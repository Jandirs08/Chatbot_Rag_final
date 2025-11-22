# Backlog de Tareas del Frontend

## P0 — Críticas (máxima prioridad)

- Endurecer pipeline de build (lint/typecheck obligatorios)
  - Prioridad: Crítica (P0) · Complejidad: Media
  - Referencias: `frontend/next.config.js:3-14`
- Migrar tokens a cookies HttpOnly o tokens en memoria (no localStorage)
  - Prioridad: Crítica (P0) · Complejidad: Alta
  - Referencias: `frontend/app/lib/services/authService.ts:44-52,73-80,268-284`, `frontend/middleware.ts:33-53`
- Reescribir widget embebible sin JS inline ni `innerHTML`
  - Prioridad: Crítica (P0) · Complejidad: Media
  - Referencias: `frontend/app/components/WidgetPreview.tsx:80-93`
- Unificar sistema de UI (elegir Tailwind+Radix o Chakra)
  - Prioridad: Crítica (P0) · Complejidad: Alta
  - Referencias: `frontend/package.json:13-56`, `frontend/app/components/FloatingChatWidget.tsx:1-53`, `frontend/app/components/ui/*`

### PR Ideal — Endurecer pipeline de build
- Título: Enforce lint y typecheck en build; remover ignores en Next
- Descripción: Eliminar `ignoreDuringBuilds` y `ignoreBuildErrors` y configurar scripts y pipeline para bloquear builds con errores.
- Objetivo: Evitar despliegues con errores silenciosos (bomba de tiempo).
- Checklist:
  - [x] Eliminar `eslint.ignoreDuringBuilds` y `typescript.ignoreBuildErrors` (`frontend/next.config.js:3-14`).
  - [x] Asegurar scripts `lint` y `typecheck` en `package.json` (`frontend/package.json:6-11`).
  - [ ] Documentar uso en CI (prebuild: `next lint` y `tsc --noEmit`).
  - [ ] Verificar build falla ante errores intencionales.

### PR Ideal — Migración de tokens a cookies HttpOnly o memoria
- Título: Migrar almacenamiento de auth a cookies HttpOnly Secure y remover localStorage
- Descripción: Dejar de setear cookies desde el cliente, emitir cookies HttpOnly desde el backend y usar `authenticatedFetch` sin leer `localStorage`.
- Objetivo: Mitigar exfiltración de tokens ante XSS.
- Checklist:
  - [x] Deprecar `TokenManager` con `localStorage` (`frontend/app/lib/services/authService.ts:44-80`).
  - [x] Dejar de escribir cookie en cliente (`authService.ts:50-52`).
  - [x] Ajustar `middleware` para validar por cookie HttpOnly (`frontend/middleware.ts:33-53`).
  - [x] Actualizar `authenticatedFetch` para no depender de token en cliente (`frontend/app/lib/services/authService.ts:268-284`).
  - [ ] Añadir `SameSite=Strict`, `Secure` y CSRF si se mantienen cookies.
  - [ ] Probar flujos: login, me, logout, SSE chat.

### PR Ideal — Widget embebible sin JS inline
- Título: Publicar `widget.js` externo y remover `innerHTML` del snippet
- Descripción: Exportar el widget como archivo JS servible y reemplazar el código inline por `<script src=".../widget.js" data-config="..."></script>`.
- Objetivo: Mejorar CSP y reducir superficie de XSS.
- Checklist:
  - [ ] Crear `widget.js` con DOM seguro (sin `innerHTML`).
  - [ ] Reemplazar snippet en `WidgetPreview` (`frontend/app/components/WidgetPreview.tsx:80-93`).
  - [ ] Definir `data-attributes` para configuración (posición, tema, tamaño).
  - [ ] Actualizar CSP para permitir sólo script propio.
  - [ ] Validar carga en sitios externos.

### PR Ideal — Unificación de UI
- Título: Consolidar UI en una sola biblioteca; retirar duplicados
- Descripción: Elegir stack (recomendado: Tailwind+Radix) y migrar componentes Chakra/Emotion.
- Objetivo: Reducir bundle, mejorar accesibilidad y coherencia.
- Checklist:
  - [x] Inventariar componentes Chakra (grep global limpio en `frontend/**`).
  - [x] Reescribir `FloatingChatWidget` en Tailwind (`frontend/app/components/FloatingChatWidget.tsx:1`).
  - [x] Eliminar dependencias Chakra/Emotion de `package.json` (`frontend/package.json:14-53`).
  - [ ] Revisar estilos globales y tokens.
  - [ ] Validar accesibilidad (focus/aria) en componentes migrados.

## P1 — Importantes

- Endurecer CSP y cabeceras de seguridad
  - Prioridad: Alta (P1) · Complejidad: Media
  - Referencias: `frontend/next.config.js:66-76,79-87,90-102,105-114`
  - Checklist — Implementación actual
    - [x] Cabeceras globales (`/:path*`): `X-DNS-Prefetch-Control`, `Strict-Transport-Security`, `X-Content-Type-Options`, `Referrer-Policy` (`frontend/next.config.js:66-76`)
    - [x] Excepción `/chat`: `CSP: frame-ancestors *` y `script-src 'self' 'unsafe-inline'` (`frontend/next.config.js:79-87`)
    - [x] Dashboard: `X-Frame-Options: DENY` y `CSP: frame-ancestors 'self'` (`frontend/next.config.js:90-102`)
    - [x] Login: `X-Frame-Options: DENY` y `CSP: frame-ancestors 'self'` (`frontend/next.config.js:105-114`)
    - [ ] General: aplicar `X-Frame-Options: DENY` y `frame-ancestors 'self'` a todas las rutas excepto `/chat` (actualmente solo `dashboard` y `login`)
    - [ ] Ajustar ruta de login real a `/auth/login` si corresponde (ver `frontend/app/auth/login/page.tsx:1-26`)
    - [ ] Completar CSP por ruta: `style-src`, `img-src`, `font-src`, `connect-src` (API/SSE)
    - [ ] Reducir `unsafe-inline` cuando el widget loader salga de inline
- Dividir `sidebar.tsx` en subcomponentes
  - Prioridad: Alta (P1) · Complejidad: Alta
  - Referencias: `frontend/app/components/ui/sidebar.tsx:1-755`
- Reducir logging en producción y evitar PII
  - Prioridad: Alta (P1) · Complejidad: Baja
  - Referencias: `frontend/app/lib/services/authService.ts:92,114,121`, `frontend/app/lib/services/statsService.ts:7-36`
- Unificar flujos de auth (SSE + REST)
  - Prioridad: Media (P1) · Complejidad: Media
  - Referencias: `frontend/app/hooks/useChatStream.ts:52`, `authenticatedFetch`

## P2 — Menores

- Limpiar `splitChunks` (remover grupos no usados como `recharts`)
  - Prioridad: Media (P2) · Complejidad: Baja
  - Referencias: `frontend/next.config.js:52-58`
- Revisar usos de `localStorage` (theme, conversation_id)
  - Prioridad: Media (P2) · Complejidad: Baja
  - Referencias: `frontend/app/components/AppSidebar.tsx:96,118`, `frontend/app/chat/page.tsx:15,22`
- Unificar sistema de toasts (Radix vs Sonner)
  - Prioridad: Baja (P2) · Complejidad: Baja
  - Referencias: `frontend/app/components/ui/toast.tsx`, `frontend/app/layout.tsx:21`
- Actualizar dependencias y realizar verificación de seguridad
  - Prioridad: Baja (P2) · Complejidad: Media
  - Referencias: `frontend/package.json:13-69`

## Notas de Ejecución

- Orden sugerido: abordar P0 primero, desplegar en entornos de prueba, luego P1 y P2.
- Cada PR debe incluir pruebas manuales: login, navegación protegida, SSE, y visualización de UI.