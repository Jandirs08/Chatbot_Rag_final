# Fase 4 – Plan de acción priorizado

## Contexto
Plan de optimización con acciones concretas, esfuerzo e impacto estimados.

## 🔴 Crítico
- Enforzar `JWT_SECRET` en producción.
  - Acción: validación en `config.py` y `create_app()` para abortar si falta.
  - Esfuerzo: bajo; Impacto: alto (seguridad).
- CORS explícito en producción (eliminar `*`).
  - Acción: configurar `CORS_ORIGINS` desde entorno y validar no vacío; fallback seguro `'self'`.
  - Esfuerzo: bajo; Impacto: alto (exposición controlada).
- Sustituir/aislar `pickle` y `md5`.
  - Acción: usar `json`/`msgpack` para serialización; cambiar `md5` a `sha256` (si no crítico rendimiento). Documentar si se mantienen por compatibilidad y filtrar entradas.
  - Esfuerzo: medio; Impacto: alto (seguridad y robustez).

## 🟠 Alto
- Observabilidad y métricas.
  - Acción: integrar `prometheus-client` (contador, latencia por ruta `/chat` y errores). Exponer `/metrics`.
  - Esfuerzo: bajo-medio; Impacto: alto (operación y diagnóstico).
- Rendimiento en RAG y estilo.
  - Acción: aplicar `black/isort/flake8` y refactor de funciones largas (split en helpers); revisar batch sizes e IO en vector store.
  - Esfuerzo: medio; Impacto: alto (mantenibilidad y rendimiento).
- CSP efectiva para `/chat` embebido.
  - Acción: derivar `frame-ancestors` desde `CORS_ORIGINS_WIDGET` validado; añadir tests.
  - Esfuerzo: bajo; Impacto: alto.

## 🟡 Medio
- Accesibilidad y UX en chat.
  - Acción: pruebas con `axe-core`, roles ARIA, foco al enviar/recibir streaming; shortcuts.
  - Esfuerzo: bajo-medio; Impacto: medio.
- Pre-commit y CI.
  - Acción: `pre-commit` con `black/isort/flake8/mypy` y `eslint/prettier`; pipeline CI (GitHub Actions) con linters y tests.
  - Esfuerzo: bajo; Impacto: medio.
- Ingestión PDFs robusta.
  - Acción: casos de error, tamaños máximos, OCR opcional; pruebas con fixtures.
  - Esfuerzo: medio; Impacto: medio.

## Estimaciones (orientativas)
- Seguridad crítica (JWT/CORS/pickle/md5): 1–2 días.
- Observabilidad + métricas: 0.5–1 día.
- Refactors RAG y estilo: 2–4 días.
- Accesibilidad UI: 1–2 días.
- CI/CD y pre-commit: 0.5–1 día.