# Fase 2 – Estrategia de pruebas

## Contexto
Se define un plan de pruebas integral para backend, frontend, integración y performance, priorizando rutas críticas y seguridad.

## Tipos de pruebas y herramientas
- Pruebas unitarias (backend): `pytest`, `pytest-asyncio`, `mypy`.
  - Objetivo: funciones de auth (`jwt_handler`, `password_handler`), repositorios Mongo, validadores `pydantic`.
- Pruebas de integración (backend): `httpx` + `pytest-asyncio` contra `uvicorn`.
  - Objetivo: `/auth/login`, `/auth/refresh`, `/users`, `/bot/config`, `/health`, CORS.
- Pruebas E2E (full): `Playwright` contra `docker-compose`.
  - Flujo: login admin, acceso a rutas protegidas, chat SSE en `/chat`, export de conversaciones.
- Pruebas de rendimiento/carga: `k6` o `locust`.
  - Escenarios: ráfagas de `/chat/stream_log`, tamaños de PDFs, acceso concurrente admin.
- Pruebas de seguridad: `bandit` (backend), `hadolint` (Docker), `schemathesis` contra `/openapi.json`.
  - Objetivo: detectar patrones peligrosos (`pickle`, `md5`), contratos API.
- Pruebas de frontend (unitarias): `jest`, `@testing-library/react`.
  - Componentes: `ChatWindow`, hooks (`useChatStream`, `useAuth`), navegación protegida.
- Accesibilidad (frontend): `axe-core`, `@testing-library/react`, `lighthouse`.
  - Verificar roles ARIA, foco correcto, contraste.

## Priorización (impacto vs facilidad)
1) Crítico: Auth y rutas protegidas; `/chat/stream_log` robustez y SSE.
2) Alto: CORS/Headers y CSP; repos usuarios; bot config; integración SSE.
3) Medio: ingestión PDFs (formatos y errores); accesibilidad UI; caching.
4) Bajo: validación OpenAPI; codemods menores.

## Cobertura objetivo
- Backend: ≥ 75% en auth, users, chat, bot config.
- Frontend: ≥ 60% en componentes clave (Chat UI, Auth).
- E2E: flujo esencial estable contra `docker-compose`.

## Plan de ejecución
- Semana 1: ampliar tests backend existentes (auth, users, chat SSE, CORS), configurar `pre-commit` con `black/isort/flake8/mypy`.
- Semana 2: E2E con Playwright, pruebas frontend unitarias de `ChatWindow` y hooks.
- Semana 3: carga con `k6` y métricas Prometheus (latencia y contador), revisión de seguridad con `schemathesis`.