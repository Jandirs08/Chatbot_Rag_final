# Addendum al Informe de Auditoría Frontend

**Fecha:** 2026-02-03  
**Objetivo:** Completar la auditoría con foco en organización del proyecto, calidad estructural y riesgos a mediano plazo.

---

## 1. Resumen Ejecutivo
*   **Arquitectura Híbrida Confusa:** Existe una mezcla crítica entre `src/features` y `app/` que duplica dominios (especialmente chat) y fragmenta la lógica de negocio.
*   **Seguridad en Tokens:** La persistencia de tokens usa `document.cookie` (client-side), exponiendo la sesión a ataques XSS al no ser `HttpOnly`.
*   **Infrautilización de App Router:** La mayoría de las páginas (`page.tsx`) y layouts usan `"use client"`, perdiendo los beneficios de rendimiento y seguridad de los React Server Components (RSC).
*   **Estrategia de Datos Reactiva pero Costosa:** Se utiliza *polling* (5-10s) con SWR en paneles administrativos, lo cual es funcional pero ineficiente comparado con WebSockets o SSE.
*   **Inconsistencia de Naming:** Mezcla de inglés/español y formatos (`Documents` vs `admin`, `usuarios` vs `users`) que dificulta la mantenibilidad.

---

## 2. Tabla de Hallazgos

| Severidad | Hallazgo | Evidencia | Impacto | Recomendación |
| :--- | :--- | :--- | :--- | :--- |
| **Alta** | **Estructura Fragmentada (Split Brain)** | `src/features/chat` contiene componentes lógicos mientras `app/chat` define rutas y vistas. `app/components` mezcla `admin`, `auth` y UI genérica. | Dificulta la navegación, duplica código y complica el onboarding de nuevos devs. | Migrar todo `src/features` dentro de `app/` siguiendo una arquitectura modular por dominio (ej: `app/(features)/chat`). |
| **Alta** | **Cookies No Seguras (XSS Risk)** | `app/lib/services/authService.ts` usa `document.cookie` para setear tokens manualmente. | Un script malicioso inyectado podría robar el token de sesión. | Implementar API Routes (`/api/auth/login`) que seteen cookies `HttpOnly` desde el servidor (Next.js backend). |
| **Media** | **Convención de Naming Inconsistente** | Carpetas `Documents/` (PascalCase), `usuarios/` (español), `admin/` (inglés), `configuracion-whatsapp/` (kebab-es). | Aumenta la carga cognitiva y errores al importar rutas. | Estandarizar a **kebab-case** y **inglés** para todas las rutas y carpetas (ej: `users`, `whatsapp-settings`, `documents`). |
| **Media** | **Abuso de "use client"** | `app/page.tsx` (Dashboard) y layouts principales son Client Components. | Aumenta el bundle size JS que baja al cliente y retrasa el First Contentful Paint. | Mover lógica de estado a componentes hoja (leaf components) y mantener las `page.tsx` como Server Components. |
| **Oportunidad** | **Polling vs Tiempo Real** | `app/admin/inbox/page.tsx` usa `refreshInterval: 10000` (10s) para actualizar chats. | Carga innecesaria al servidor y latencia en la percepción de nuevos mensajes. | Evaluar migrar a Server Sent Events (SSE) o WebSockets para notificaciones en tiempo real. |
| **Oportunidad** | **Protección de Rutas Redundante** | `useRequireAdmin` (client-side) se usa junto con Middleware. | Añade complejidad; el middleware ya debería rechazar la carga del HTML inicial. | Centralizar la protección fuerte en `middleware.ts` y usar el hook solo para UX (ocultar botones). |

---

## 3. Propuesta de Estructura Ideal (Next.js App Router)

El objetivo es eliminar `src/` y consolidar todo bajo `app/` aprovechando los **Route Groups** para organización lógica sin afectar la URL.

```text
frontend/
└── app/
    ├── (auth)/                 # Grupo de rutas de autenticación (sin prefijo en URL)
    │   ├── login/
    │   └── register/
    ├── (dashboard)/            # Layout protegido para app interna
    │   ├── layout.tsx          # Sidebar + AuthGuard (Server)
    │   ├── admin/              # /admin/...
    │   │   ├── inbox/
    │   │   └── settings/
    │   ├── chat/               # /chat (interfaz principal)
    │   └── documents/          # /documents (antes Documents)
    ├── api/                    # Route Handlers
    ├── _components/            # Componentes compartidos globales
    │   ├── ui/                 # Shadcn/UI
    │   └── layout/             # Header, Footer
    ├── _lib/                   # Utilidades puras (sin estado React)
    │   ├── services/           # Fetchers y lógica de negocio
    │   └── utils.ts
    ├── global-error.tsx
    ├── layout.tsx              # Root Layout (Server)
    └── page.tsx                # Landing o Redirect
```

### Cambios clave para la transición:
1.  **Colocación (Co-location):** Los componentes específicos de una vista viven dentro de la carpeta de esa vista (ej: `app/chat/_components/ChatWindow.tsx`).
2.  **Eliminación de `src/features`:** Se integra en la estructura de rutas o en carpetas `_features` dentro de los grupos de rutas.
3.  **Route Groups `(...)`:** Permiten tener layouts distintos (ej: Auth vs Dashboard) sin anidar la URL (ej: no tener `/dashboard/chat` sino `/chat`).

---

## 4. Próximos Pasos Recomendados

1.  **Inmediato:** Renombrar carpetas `Documents` -> `documents` y `usuarios` -> `users` para consistencia de naming.
2.  **Corto Plazo:** Mover lógica de `src/features/chat` a `app/chat/_components` y eliminar `src`.
3.  **Mediano Plazo:** Refactorizar el manejo de tokens para usar `HttpOnly` cookies via Next.js API Routes para mitigar riesgos XSS.
