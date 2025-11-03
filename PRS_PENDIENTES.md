# Plan de PRs Pendientes (Roadmap)

Este documento resume los Pull Requests propuestos para cerrar funcionalidad y pulir la solución con buenas prácticas.

## Resumen de progreso (hecho recientemente)
- Backend usuarios: `GET /api/v1/users`, `POST /api/v1/users`, `PATCH /api/v1/users/{id}` (editar email, nombre, rol, activo y contraseña con política server-side).
- Middleware: preflight `OPTIONS` permitido antes de autenticación para que CORS funcione en rutas protegidas.
- CORS: orígenes explícitos (localhost:3000/3001) y reemplazo de `*` cuando `allow_credentials` está activo.
- Frontend `/usuarios`: listado, creación (sin campo usuario; se genera desde el email), edición, toggle moderno de “Activo” (Radix `Switch`), select moderno de “Rol” (Radix `Select`), toasts y actualización optimista.
- Autenticación frontend: llamadas con `authenticatedFetch` incluyendo `Authorization`.

## PR #7 – Gestión de Usuarios (Edición y Activar/Desactivar)
Estado: ✅ Completado
- Backend
  - Agregar `PATCH /api/v1/users/{id}` para actualizar: `full_name`, `email` (con unicidad), `is_admin`, `is_active`.
  - Endpoints específicos (si preferimos granular): `POST /api/v1/users/{id}/activate` y `POST /api/v1/users/{id}/deactivate`.
  - Validaciones: formato email, unicidad, cambios de rol solo admin.
- Frontend
  - Modal “Editar Usuario” en `/usuarios` con formularios y validación.
  - Toggle “Activo” con `Switch` (Radix), actualización optimista y toasts.
- Aceptación
  - Admin puede editar y activar/desactivar usuarios; validaciones server-side; feedback claro en UI.

## PR #8 – Paginación y Filtros en /usuarios
Estado: ⏳ Pendiente
- Backend
  - Extender `GET /api/v1/users` con `search` (email/username), `role` (`admin|user`), `is_active`. `skip`/`limit` ya disponibles; usar `count_users` para total.
- Frontend
  - Tabla con paginación (controles siguiente/anterior) y muestra de total.
  - Búsqueda con debounce (por email/usuario) y filtro por rol/activo.
- Aceptación
  - Listado escalable con UX fluida y filtros funcionales.

## PR #9 – Modelo de Roles y Permisos
Estado: 🔶 Parcial
- Backend
  - Estandarizar roles: `admin` y `user` (base para futuros roles), autorización en middleware/dependencies.
  - Posibles scopes por módulo si se requiere granularidad.
- Frontend
  - Guards claros para secciones admin; UI de rol con `Select`.
- Aceptación
  - Acceso a `/usuarios` y endpoints `/users` solo para admin; base lista para ampliar permisos.

## PR #10 – Seguridad y Políticas
Estado: 🔶 Parcial
- Backend
  - Política de contraseñas server-side implementada en `PATCH /users/{id}`.
  - CORS ajustado; preflight `OPTIONS` permitido por middleware.
  - Pendiente: rate limiting, cookies `HttpOnly` y rotación segura de refresh tokens.
- Frontend
  - Mantener `authenticatedFetch` y manejo de expiración/refresh.
- Aceptación
  - Política de contraseñas en servidor; CORS y tokens robustos; rate limiting activo (pendiente).

## PR #11 – Auditoría y Logging
Estado: ⏳ Pendiente
- Backend
  - Traza de acciones admin: creación, edición, activación/desactivación de usuarios.
  - Structured logging con campos clave (admin_id, target_user_id, acción, timestamp).
- Frontend
  - Mensajes de éxito/error consistentes; `toast` y estados de carga.
- Aceptación
  - Auditoría mínima disponible en logs; eventos clave registrables.

## PR #12 – Documentación y API Docs
Estado: ⏳ Pendiente
- Backend
  - Documentar `/api/v1/users` (listar, crear, editar, activar/desactivar) en OpenAPI.
- Frontend
  - Añadir sección breve en README sobre gestión de usuarios.
- Aceptación
  - Endpoints visibles en `/docs`; README actualizado.

## PR #13 – Pulidos UX/UI
Estado: 🔶 Parcial
- Frontend
  - `Select` de rol y `Switch` de activo ya integrados.
  - Pendiente: `AlertDialog` de confirmación para desactivar, skeletons en carga y estados vacíos.
  - Accesibilidad: revisar ARIA y labels adicionales.
- Aceptación
  - UI consistente, accesible y con retroalimentación clara.

---

## Notas de Implementación
- Estado actual
  - Login sin “Crear cuenta”; `/usuarios` como centro de gestión.
  - `GET/POST /api/v1/users` implementados; CORS corregido permitiendo preflight `OPTIONS`.
- Dependencias
  - Mantener `authenticatedFetch` para Authorization.
  - Ajustar `middleware` y `dependencies` si añadimos roles adicionales.

## Orden sugerido
1) PR #8 (Paginación/filtros) → escalabilidad y UX.
2) PR #10 (Seguridad) → rate limiting y cookies HttpOnly.
3) PR #11 (Auditoría) → trazabilidad.
4) PR #12/#13 (Docs y UX) → pulir entrega.

## Checklist de Entrega por PR
- Código y endpoints con validación server-side.
- UX con estados de carga, error y éxito.
- Logs y mensajes claros.
- Documentación actualizada (README/OpenAPI).