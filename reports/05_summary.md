# Fase 5 – Consolidación

## Contexto breve
Se analizó el proyecto FastAPI/Next.js con foco en seguridad, rendimiento, calidad y pruebas. Se ejecutaron linters en backend y se revisó frontend de forma estática.

## Hallazgos → Acciones recomendadas
- Secretos y CORS:
  - Hallazgo: `jwt_secret` opcional; CORS `*` por defecto.
  - Acción: exigir secreto en prod; orígenes explícitos.
- Serialización y hashing:
  - Hallazgo: `pickle` y `md5` en RAG.
  - Acción: migrar a formatos seguros y `sha256` (o documentar y aislar).
- Observabilidad:
  - Hallazgo: logging de latencias, sin métricas agregadas.
  - Acción: Prometheus en `/chat`, contadores y histogramas.
- Calidad de código:
  - Hallazgo: líneas largas, imports no usados.
  - Acción: `black/isort/flake8` en pre-commit y refactor RAG.
- Frontend:
  - Hallazgo: middleware auth correcto y CSP ajustada; falta linting automático y pruebas de accesibilidad.
  - Acción: configurar `eslint/prettier`, `jest/testing-library`, `axe-core`.

## Automatización futura (CI/CD)
- Pipeline CI (GitHub Actions):
  - Jobs: backend lint (`flake8`, `bandit`, `mypy`), tests `pytest`; frontend lint (`eslint`), unit tests; build Next y FastAPI.
  - Artefactos: reporte cobertura, reportes de linters, Docker images con multi-stage.
- Pre-commit:
  - Hooks: `black`, `isort`, `flake8`, `mypy` (backend); `eslint`, `prettier` (frontend).
- Seguridad:
  - SAST: `bandit`, `hadolint`.
  - Contract testing: `schemathesis` contra `/openapi.json`.

## Estado antes → después (esperado)
- Antes: CORS abierto por defecto; secretos opcionales; linters con hallazgos; métricas inexistentes.
- Después: arranque seguro, CORS restringido, linters en CI, métricas expuestas y pruebas E2E estables.