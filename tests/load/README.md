# Tests de Carga — Locust

## Instalación

```bash
pip install locust
```

## Antes de correr

El backend necesita el rate limiter relajado, si no el 99% de requests son 429:

```bash
# En el .env o al levantar el backend:
ENABLE_RATE_LIMITING=false
```

---

## Forma 1 — Con UI (recomendada para explorar)

```bash
locust -f tests/load/locustfile.py --host http://localhost:8000
```

Abre **http://localhost:8089** en el navegador.

Ahí pones:
- **Number of users** — cuántos usuarios concurrentes quieres
- **Spawn rate** — cuántos usuarios por segundo se agregan al inicio
- **Host** — ya viene pre-cargado

Le das **Start** y ves las métricas en tiempo real: RPS, latencia p50/p95/p99, errores.

---

## Forma 2 — Headless (para CI o scripting)

```bash
locust -f tests/load/locustfile.py \
  --host http://localhost:8000 \
  --headless \
  --users 20 \
  --spawn-rate 2 \
  --run-time 5m
```

Al terminar imprime el reporte en la terminal.

---

## Qué hace cada clase

| Clase | Qué simula |
|---|---|
| `ChatUser` | Usuario nuevo cada request. Conversation ID único cada vez. |
| `WarmChatUser` | Usuario que continúa la misma conversación. Ejercita la memoria del bot. |

Puedes elegir qué clase correr desde la UI (dropdown "User classes") o con `--class`:

```bash
locust -f tests/load/locustfile.py --host http://localhost:8000 --class ChatUser
```

---

## Recetas comunes

**Smoke** — validar que funciona (1 usuario, 1 minuto):
```bash
locust -f tests/load/locustfile.py --host http://localhost:8000 \
  --headless --users 1 --spawn-rate 1 --run-time 1m
```

**Load** — carga normal (20 usuarios, 5 minutos):
```bash
locust -f tests/load/locustfile.py --host http://localhost:8000 \
  --headless --users 20 --spawn-rate 2 --run-time 5m
```

**Stress** — hasta dónde aguanta: usa la UI, empieza con 10 y sube manualmente.

---

## Qué mirar en los resultados

| Métrica | Qué indica | Referencia |
|---|---|---|
| `chat_stream` p95 | Latencia total p95 (incluye LLM) | < 15s |
| `chat_stream` p50 | Latencia mediana | < 6s |
| Failures % | Errores SSE o HTTP | < 2% |

Si ves **"SSE event:error"** en los failures → problema en el LLM o RAG, no en la infra.

Si ves **"HTTP 429"** → el rate limiter no está desactivado.
