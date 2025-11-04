# Plan Integral de Pruebas y Optimización (refinado por criticidad)

Objetivo: elevar calidad y mantenibilidad sin sobre-ingeniería. Priorizado de más crítico a menos crítico, con acciones concretas y herramientas aplicables.

## Crítico

- Área: Backend
  - Tarea: Enforzar seguridad de configuración en arranque (rechazar inicio si falta `JWT_SECRET`, `OPENAI_API_KEY` para `model_type=OPENAI`)
  - Herramientas Sugeridas ("Aplicables"): `pydantic-settings`, validación en `config.py`, `pytest`
  - Justificación: Evita despliegues inseguros o no funcionales; ya se valida OpenAI key, falta exigir secret JWT.

- Área: Backend
  - Tarea: Revisar y probar estrictamente middleware de autenticación (paths públicos vs protegidos, extracción de token, expiración)
  - Herramientas Sugeridas ("Aplicables"): `pytest`, `pytest-asyncio`, `httpx`, `python-jose`
  - Justificación: Módulos `pdf`, `rag`, `bot`, `users` indican protección; `chat` es público. Asegurar que la lógica de rutas protegidas no filtre accesos.

- Área: Backend
  - Tarea: Tests de contratos de rutas críticas: `auth/login`, `auth/refresh`, `users`, `bot/config`, `health`, `CORS`
  - Herramientas Sugeridas ("Aplicables"): `pytest`, `pytest-asyncio`, `pytest-cov`, `httpx`
  - Justificación: Ya existen tests PR11, ampliar y asegurar cobertura estable de flujos vitales.

- Área: Backend (Chat)
  - Tarea: Validación y robustez en `/api/v1/chat/stream_log` (input schema, errores malformados, disponibilidad del bot)
  - Herramientas Sugeridas ("Aplicables"): `pytest-asyncio`, `httpx`, `pydantic`
  - Justificación: Endpoint público; proteger de inputs inválidos y estados de bot inactivo.

- Área: Frontend
  - Tarea: Endurecer headers de seguridad y CSP para `/chat` conforme a `CORS_ORIGINS_WIDGET`
  - Herramientas Sugeridas ("Aplicables"): `next` headers API (`next.config.js`), verificación manual, `@next/codemod` si hace falta
  - Justificación: Minimiza clickjacking y embebidos no autorizados; el archivo ya diferencia DEV/PROD, validar casos reales.

## Alto

- Área: General / E2E
  - Tarea: Pruebas E2E mínimas del flujo completo (login admin, acceso a rutas protegidas, envío de mensaje al chat, recepción de streaming)
  - Herramientas Sugeridas ("Aplicables"): `Playwright`, `docker-compose`
  - Justificación: Verifica integraciones y timings en entorno real sin tunear demasiado.

- Área: Backend
  - Tarea: Observabilidad simple: logs consistentes de requests y errores; métricas básicas de latencia
  - Herramientas Sugeridas ("Aplicables"): logs `uvicorn`/propios, `prometheus-client` para exponer contador/latencia de `/chat`
  - Justificación: Diagnóstico operativo con overhead mínimo; OpenTelemetry puede quedar para una fase posterior.

- Área: General
  - Tarea: Pre-commit y linters esenciales (formato y estática) en ambos repos
  - Herramientas Sugeridas ("Aplicables"): `pre-commit`, `black`, `isort`, `flake8`, `mypy` en backend; `eslint`, `prettier` en frontend
  - Justificación: Mantenibilidad y consistencia diaria sin complejidad extra.

## Medio

- Área: Backend
  - Tarea: Rate limiting básico y caché en paths calientes del chat
  - Herramientas Sugeridas ("Aplicables"): `slowapi` (rate limit), `redis` (caché), util `utils/chain_cache.py`
  - Justificación: Previene abuso y reduce carga; aplicar de forma acotada.

- Área: Frontend
  - Tarea: Pruebas unitarias de componentes clave (Chat UI) y hooks
  - Herramientas Sugeridas ("Aplicables"): `jest`, `@testing-library/react`, `@testing-library/jest-dom`
  - Justificación: Robustez en interacción con API y estados; evitar regresiones en UI.

- Área: Backend (RAG)
  - Tarea: Pruebas de ingestión y manejo de PDFs (formatos, errores, OCR cuando aplique)
  - Herramientas Sugeridas ("Aplicables"): `pytest`, `unstructured`, `pytesseract`, fixtures de documentos
  - Justificación: Documentos son fuente crítica; evitar fallos por variabilidad.

## Bajo

- Área: General / API
  - Tarea: Validación de esquemas OpenAPI y tests de propiedades
  - Herramientas Sugeridas ("Aplicables"): `/openapi.json`, `schemathesis`
  - Justificación: Asegura contratos hacia clientes externos.

- Área: DevOps
  - Tarea: Endurecer Docker de forma ligera (multistage y lint básico)
  - Herramientas Sugeridas ("Aplicables"): `hadolint`, multi-stage build
  - Justificación: Mejora reproducibilidad sin convertirlo en un proyecto complejo.

---

## Sugerencias Concretas (pragmáticas)

- Backend
  - En `config.py`: exigir `jwt_secret` en producción y abortar arranque si falta.
  - Ampliar tests existentes (`backend/tests`) para cubrir `chat/stream_log` y casos de token expirado/faltante.
  - Exponer métrica Prometheus simple para contador y latencia de `/chat`.
  - Implementar rate limit moderado en `/chat` y caché sólo para respuestas repetidas.

- Frontend
  - Añadir `jest` + `testing-library` con tests de componentes del chat; verificar CSP efectiva en `next.config.js`.

- E2E
  - Playwright: login admin, acceso a `/bot` protegido, enviar mensaje al chat y verificar streaming.
  - Ejecutar contra `docker-compose` para consistencia.

- Calidad
  - `pre-commit` con `black`, `isort`, `flake8`, `mypy` (backend) y `eslint`, `prettier` (frontend).

## Métricas y Criterios de Éxito (mínimos)

- Cobertura: Backend ≥ 75% en módulos críticos (auth, chat, users); Frontend ≥ 60% en componentes clave.
- Estabilidad: E2E esenciales pasando en `docker-compose`.
- Seguridad: Arranque bloquea si faltan secretos críticos; rutas protegidas verificadas.
- Observabilidad: Logs consistentes y métricas básicas disponibles.

## Próximos Pasos

1. Endurecer `config.py` para secretos críticos.
2. Ampliar `backend/tests` para auth y chat (incluye expiración y errores).
3. Añadir métrica Prometheus simple y rate limit moderado en `/chat`.
4. Configurar `jest` y cubrir Chat UI.
5. Agregar `pre-commit` y linters esenciales.