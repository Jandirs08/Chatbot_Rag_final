Diagnóstico actual de logs (de tu logchat0830.md)

  Mirando tu propio log:
  2026-04-30 08:39:33.305 | 2026-04-30 13:39:33 | INFO:api.app:Request: GET ... - Status: 200 - Time: 0.02s - Body: No body
  2026-04-30 08:39:33.306 | INFO:     172.18.0.1:54970 - "GET ... HTTP/1.1" 200 OK

  Suciedad detectada:
  1. Doble timestamp (08:39:33 | 13:39:33) → uno container/Docker, otro app. Redundante
  2. Doble log mismo request: tu middleware log_requests + uvicorn.access loguean lo mismo. 2 líneas por request
  3. Body: No body → ruido constante. 90% de tus líneas
  4. Polling brutal: /chat/history/... cada ~5s. /bot/config/public cada llamada. Frontend polling sin SWR cache?
  5. DEBUG mezclado con INFO en producción (config_repository, EmbeddingManager) → log level laxo

  Impact: señal/ruido ~20%. Encontrar error real es buscar aguja en pajar.

  ---
  Niveles propuestos (orden recomendado)

  Nivel 0 — Limpiar lo que tienes (HOY) ⭐

  Costo: 0. Bottleneck: ninguno. Solo borrar ruido.

  ┌──────────────────────────────────────────────────────────────────┬───────────────────────────────────────┬───────────────┐
  │                              Acción                              │                Archivo                │    Efecto     │
  ├──────────────────────────────────────────────────────────────────┼───────────────────────────────────────┼───────────────┤
  │ Quitar log_requests middleware O desactivar uvicorn.access       │ api/app.py:606 o _logging_setup.py:30 │ -50% líneas   │
  ├──────────────────────────────────────────────────────────────────┼───────────────────────────────────────┼───────────────┤
  │ Eliminar Body: ... log salvo error 4xx/5xx                       │ api/app.py:636                        │ -30% ruido    │
  ├──────────────────────────────────────────────────────────────────┼───────────────────────────────────────┼───────────────┤
  │ Skip log si path en {/health, /chat/history, /bot/config/public} │ mismo middleware                      │ -40% más      │
  ├──────────────────────────────────────────────────────────────────┼───────────────────────────────────────┼───────────────┤
  │ Subir database.config_repository a INFO, no DEBUG                │ _logging_setup.py                     │ menos chatter │
  ├──────────────────────────────────────────────────────────────────┼───────────────────────────────────────┼───────────────┤
  │ LOG_LEVEL=INFO fijo en prod                                      │ env                                   │ DEBUG fuera   │
  └──────────────────────────────────────────────────────────────────┴───────────────────────────────────────┴───────────────┘

  Resultado esperado: logs caen ~70-80%. Lo que queda: requests POST relevantes, errores, timing RAG, cambios estado.

  Nivel 1 — Logs útiles para debugging (esta semana)

  Costo: 0. Bottleneck: ninguno.

  - Loguear timing por etapa del chat (1 línea final por turn): [CHAT] conv=X dur_ms=2340 stages: gate=2ms emb=180ms qdrant=12ms rerank=80ms
  llm=2050ms tokens_in=450 tokens_out=120 tools=1
  - Ya tienes PerformanceMetrics y request_id. Solo falta consolidar en chat/manager.py al final del turno
  - Borrar logs de scores Qdrant de INFO → bajar a DEBUG (vector_store.py)

  Beneficio: 1 línea ↔ 1 conversación = trazable, comparable, alertable.

  Nivel 2 — JSON logs (opcional, prepara futuro shipping)

  Costo: lib python-json-logger (~50KB). Bottleneck: nulo (~µs por línea).

  - Output JSON: {"ts":"...","level":"INFO","logger":"chat.manager","request_id":"cc9d1069","msg":"...","conv":"...","dur_ms":2340}
  - Permite mañana mandar a Loki/CloudWatch/Grafana sin parsear regex

  Si no piensas shippear logs en 6 meses → SKIP, no vale.

  Nivel 3 — Métricas mínimas (cuando logs limpios)

  Costo: lib prometheus-fastapi-instrumentator (~100KB). Bottleneck: ~5µs/request, RAM ~5-10MB.

  - 4 líneas en app.py → /metrics expuesto
  - Te da gratis: http_request_duration_seconds{method,path,status} (histograma), http_requests_total, in-flight gauge
  - Sin Grafana puedes consultar manualmente con curl /metrics o agregar dashboard luego

  ¿Genera bottleneck? No. Counter/histogram in-memory, lock-free. Mientras no hagas >10k req/s, irrelevante.

  ¿Genera costo? Cero si lo expones interno. Si pones Grafana Cloud free tier → 10k series gratis, suficiente.

  Nivel 4 — Verificar Sentry (5 min)

  Ya está instalado. Solo:
  - ¿SENTRY_DSN configurado en prod? → echo $SENTRY_DSN
  - Si sí → ya capturas errores. Done
  - Si no → crear proyecto Sentry free tier (5k eventos/mes gratis)

  Costo: $0 free tier. Bottleneck: envío async, sin impacto.

  Nivel 5 — LangSmith backend (si quieres ver tokens/calidad LLM)

  Costo: $39/mes plan plus, free tier 5k traces/mes. Bottleneck: trace export async (~50ms en background, no bloquea respuesta).

  Solo si:
  - Quieres comparar prompts A/B
  - Necesitas ver cadena ReAct paso a paso
  - Trackear gasto OpenAI por conversación

  Si no → SKIP por ahora. Tus logs [ReAct] iter=1 ya dan idea.

  Nivel 6 — Infra (después)

  Loki/Grafana/OTel collector. Solo cuando:
  - Tengas >1 instancia
  - Logs locales se pierdan al redeploy y duela
  - Necesites alertas automáticas

  ---
  Recomendación concreta

  Esta semana:
  1. Nivel 0 (limpiar ruido) → 1-2 horas trabajo
  2. Nivel 1 (1 línea por chat con timing) → 2-3 horas

  Próxima:
  3. Nivel 4 (verificar Sentry DSN)
  4. Nivel 3 (Prometheus si quieres gauge RPS/latencia)

  Skip por ahora: JSON logs, LangSmith, OTel, infra.

  ---
  Costos / bottlenecks tabla

  ┌──────────────┬─────────────┬─────────────┬───────────┬───────────────┬─────────────────┐
  │    Nivel     │  Lib peso   │   CPU/req   │    RAM    │     $/mes     │   Bottleneck?   │
  ├──────────────┼─────────────┼─────────────┼───────────┼───────────────┼─────────────────┤
  │ 0 limpiar    │ 0           │ -ahorras-   │ -ahorras- │ 0             │ No, solo gana   │
  ├──────────────┼─────────────┼─────────────┼───────────┼───────────────┼─────────────────┤
  │ 1 timing     │ 0           │ <1µs        │ 0         │ 0             │ No              │
  ├──────────────┼─────────────┼─────────────┼───────────┼───────────────┼─────────────────┤
  │ 2 JSON       │ 50KB        │ ~5µs        │ <1MB      │ 0             │ No              │
  ├──────────────┼─────────────┼─────────────┼───────────┼───────────────┼─────────────────┤
  │ 3 Prometheus │ 100KB       │ ~5µs        │ 5-10MB    │ 0 free        │ No (<10k rps)   │
  ├──────────────┼─────────────┼─────────────┼───────────┼───────────────┼─────────────────┤
  │ 4 Sentry     │ ya          │ async       │ <5MB      │ 0 free 5k/mes │ No              │
  ├──────────────┼─────────────┼─────────────┼───────────┼───────────────┼─────────────────┤
  │ 5 LangSmith  │ ya frontend │ async ~50ms │ <10MB     │ $0-39         │ No (async)      │
  ├──────────────┼─────────────┼─────────────┼───────────┼───────────────┼─────────────────┤
  │ 6 OTel       │ 500KB+      │ ~1-5%       │ 30MB+     │ $0-?          │ Posible si full │
  └──────────────┴─────────────┴─────────────┴───────────┴───────────────┴─────────────────┘

  ---
  Mi voto

  Empieza Nivel 0+1. Esos dos solos te dan 80% del valor. Si después quieres dashboards visuales, Nivel 3. El resto puede esperar meses sin dolor.

  Arranco con Nivel 0? Te muestro diff específico de qué borrar/cambiar en api/app.py y _logging_setup.py?