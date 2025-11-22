# Auditoría de Código — Integración WhatsApp (Twilio)

Informe técnico de análisis estático sobre la implementación de WhatsApp en el backend. Alcance principal: `backend/api/routes/whatsapp`, `backend/utils/whatsapp`, `backend/database/whatsapp_session_repository.py`, `backend/config.py`, y dependencias relevantes.

## Checklist de Auditoría

- [ ] Bombas de Tiempo (Estabilidad)
- [ ] Malas Prácticas y Seguridad
- [ ] Código Muerto
- [ ] Redundancia

---

## Bombas de Tiempo (Estabilidad)

- [x] Falta de validación de firma del webhook (riesgo de reintentos y duplicados)
  - Implementado validación con RequestValidator en 2025-11-21

  - Evidencia: `backend/api/routes/whatsapp/webhook_routes.py:22-31`
  - Observación: El endpoint procesa el formulario sin verificar `X-Twilio-Signature`. Bajo carga o ataques, Twilio puede reintentar y generar duplicados si la respuesta tarda.
  - Sugerencia: Validar `X-Twilio-Signature` usando el `TWILIO_AUTH_TOKEN` antes de leer y procesar (`pre-auth`). Rechazar con `403` si no coincide.

- [ ] Tiempo de respuesta del webhook depende del LLM

  - Evidencia: `backend/api/routes/whatsapp/webhook_routes.py:55-66` + `backend/chat/manager.py:49-59`
  - Observación: El webhook espera a que el LLM responda (timeout configurable de 25s). Twilio recomienda responder rápido para evitar reintentos/duplicados.
  - Sugerencia: Desacoplar con procesamiento asíncrono (p.ej., encolar trabajo y responder `200` inmediatamente), o limitar `llm_timeout` a una ventana segura (<10s), con fallback de mensaje corto y envío posterior.

- [x] Rate limiting de Twilio (códigos 429 / 20429) no manejado explícitamente
  - Implementado backoff exponencial con jitter en 2025-11-21

  - Evidencia: `backend/utils/whatsapp/client.py:51-72`
  - Observación: El cliente reintenta ante 5xx y excepciones con backoff exponencial, pero no contempla 429 (rate limit) ni el `code` específico `20429` de Twilio.
  - Sugerencia: Añadir manejo de `429`/`20429` con backoff exponencial + jitter y un máximo de cola; registrar métricas para ajustar umbrales.

- [ ] Conversación nula ante fallo de repositorio
  - Evidencia: `backend/api/routes/whatsapp/webhook_routes.py:50-52`
  - Observación: Si falla la obtención/creación de conversación, se continúa con `conversation_id=None`. El flujo tolera esto, pero puede afectar trazabilidad.
  - Sugerencia: Asignar fallback determinístico (p.ej., hash de `wa_id`) o cortar con `503` y reintento controlado.

---

## Malas Prácticas y Seguridad

- [ ] Secretos comprometidos en `.env` dentro del repo

  - Evidencia: `backend/.env:18`, `backend/.env:52-54`
  - Observación: Se encuentran valores reales de `OPENAI_API_KEY`, `TWILIO_ACCOUNT_SID` y `TWILIO_AUTH_TOKEN` en el archivo de entorno dentro del árbol del proyecto.
  - Sugerencia: Eliminar `backend/.env` del repositorio, rotar claves, usar `ENV VARS` del entorno de despliegue y proveer solo `backend/.env.example` sin secretos.

- [ ] Webhook público sin autenticación de origen

  - Evidencia: `backend/auth/middleware.py:20-29`
  - Observación: La ruta `/api/v1/whatsapp/webhook` es pública por diseño. Sin validación de firma, cualquier actor puede hacer POST y forzar el envío vía Twilio.
  - Sugerencia: Implementar verificación de `X-Twilio-Signature` y limitar IPs si aplica (proxies/ACL), más rate limiting por IP.

- [ ] Sanitización básica, pero sin chequeos de payloads complejos
  - Evidencia: `backend/api/routes/whatsapp/webhook_routes.py:32-41`
  - Observación: Se valida `wa_id` y se sanitiza `text` evitando control chars. Es correcto, pero no hay validación de longitudes extremas antes del formateo.
  - Sugerencia: Limitar `Body` por tamaño (p.ej., 2–4 KB) antes de pasar a LLM; rechazar exceso con `413`.

---

## Código Muerto

- [ ] Imports redundantes o sin uso no detectados en módulo WhatsApp
  - Observación: En los archivos auditados, no se detectan imports sin usar. Mantener revisión en futuros cambios.

---

## Redundancia

- [ ] Patrones de logging con `try/except` repetidos

  - Evidencia: `backend/api/routes/whatsapp/webhook_routes.py:14-21`, `backend/utils/whatsapp/client.py:52-84`
  - Observación: Se envuelven logs en `try/except` para robustez; útil, pero repetitivo y puede ocultar fallos de logging.
  - Sugerencia: Centralizar un helper de logging seguro o configurar el logger para no lanzar excepciones.

- [ ] Envío de mensaje acoplado a generación de respuesta
  - Evidencia: `backend/api/routes/whatsapp/webhook_routes.py:55-70`
  - Observación: La lógica de negocio (LLM) y la entrega (Twilio) están en el mismo ciclo. Bajo carga, separarlo reduce latencia y mejora tolerancia a fallos.
  - Sugerencia: Abstraer a una cola/trabajo asíncrono (`task queue`), con reintentos y métricas por separado.

---

## Hallazgos Positivos

- [x] Validación de `wa_id` con regex y sanitización de `Body`
  - Evidencia: `backend/api/routes/whatsapp/webhook_routes.py:32-41`
- [x] Índices en Mongo para sesiones (`wa_id` único y `updated_at`)
  - Evidencia: `backend/database/whatsapp_session_repository.py:17-23`
- [x] Backoff exponencial para 5xx y excepciones en cliente Twilio
  - Evidencia: `backend/utils/whatsapp/client.py:38-72`
- [x] Timeout del LLM controlado
  - Evidencia: `backend/chat/manager.py:49-59`

---

## Recomendaciones de Corrección (Resumen)

1. Verificar `X-Twilio-Signature` en el webhook antes de procesar.
2. Desacoplar respuesta del webhook del tiempo de generación del LLM.
3. Manejar específicamente `429/20429` con backoff + jitter.
4. Eliminar secretos del repo y rotar credenciales.
5. Definir `conversation_id` fallback ante fallo de repositorio.
6. Actualizar documentación para reflejar la lógica real de reintentos.

---

## Puntaje de Salud del Código

- Evaluación: 7/10
- Justificación: Buena base asíncrona, validaciones y reintentos parciales. Riesgos principales por ausencia de verificación de firma en webhook y secretos en `.env` versionados. Con las correcciones propuestas, puede alcanzar 9/10.
- [x] Seguridad en Endpoints de Diagnóstico
  - Protegidos con require_admin en 2025-11-21
