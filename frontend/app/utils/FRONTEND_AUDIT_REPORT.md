### 1. 📂 Arquitectura y Organización de Carpetas (Estructural)

Progreso Fase 2 (Refactorización Estructural):
- ✅ Tailwind: agregado `theme.extend.colors.brand` y `content` incluye `src/**`.
- ✅ Reorganización: `ChatWindow`, `ChatMessageBubble`, `EmptyState` → `src/features/chat/components/`.
- ✅ Reorganización: `AutoResizeTextarea` → `src/shared/components/ui/`.
- ✅ Imports actualizados en `app/chat/page.tsx`, `app/admin/inbox/page.tsx`, `app/components/FloatingChatWidget.tsx`, `app/dashboard/playground/page.tsx`.
- ✅ Estilos inline de marca reemplazados por `bg-brand`/`text-brand` y `bg-brand/10`.
- ✅ Alias TS: añadidos `@/features/*` y `@/shared/*`.

- Hallazgo: El proyecto concentra componentes reutilizables dentro de `app/components` y subcarpetas como `ui/` y `dashboard/`, mezclando dominios (admin, chat, documentos, widget) con componentes compartidos. Esto dificulta el descubrimiento y promueve acoplamiento.
- Hallazgo: Se usa ampliamente `use client` en páginas y componentes (37 archivos). Esto incrementa el coste de renderizado en cliente y reduce las ventajas del App Router. Muchos componentes podrían ser Server Components con “client islands”.
- Hallazgo: Lógica de negocio aparece en áreas de UI, por ejemplo `app/components/ui/use-toast.ts` reexporta un hook desde `app/hooks/use-toast.ts`, señalando cruces de capas. También `app/utils/constants.tsx` actúa como puente hacia `lib/`, creando rutas redundantes.
- Hallazgo: Servicios HTTP están correctamente en `app/lib/services/*`, pero no todos los puntos de acceso los consumen; hay `fetch` y `XMLHttpRequest` directos dispersos.
- Componentes Huérfanos: En `app/components/` hay piezas no agrupadas por feature: `AccountManagement.tsx`, `AppSidebar.tsx`, `DocumentManagement.tsx`, ~~`ChatWindow.tsx`~~ ✅ (movido a `src/features/chat/components/ChatWindow.tsx`), `WidgetPreview.tsx`, `InlineCitation.tsx`, `SourceBubble.tsx`. Deben ir por dominio (`chat/`, `admin/`, `documents/`, `widget/`).
- Next.js App Router: Hay páginas enteras marcadas como client components (ej. `app/page.tsx:1`), `app/admin/settings/page.tsx:1`, `app/chat/page.tsx:1`. Se puede mover la carga de datos al servidor y renderizar client islands para interactividad.

Sugerencia de estructura ideal (feature-based):

```
src/
  app/                      # App Router (mínima lógica)
    (routes)
  features/
    chat/
      components/
      hooks/
      pages/                # wrappers para app router
    admin/
      components/
      pages/
    documents/
      components/
      pages/
    widget/
      components/
      pages/
  shared/
    components/
      ui/                   # shadcn/ui + wrappers
      layout/
    hooks/
    lib/
      services/             # auth, bot, rag, stats, pdf, user
      config.ts
      logger.ts
    types/
  public/

# Alias: `@/` → `src/`
```

Acciones recomendadas:
- ~~Mover `app/components/*` a `src/features/*` o `src/shared/components/*` según corresponda~~ ✅ (parcial: chat y textarea movidos).
- Reducir `use client` en páginas; usar Server Components para datos y pasar props a client islands.
- Eliminar puentes redundantes (`app/utils/constants.tsx`) y centralizar importadores.

### 2. 🧟‍♂️ Código Muerto (Dead Code)

Archivo | Línea | Elemento | Nivel de Confianza
- `app/components/Layout.tsx:7` | `export function Layout` | Alto (no hay importadores)
- `app/components/InlineCitation.tsx:1` | Componente `InlineCitation` | Alto (no se referencia en el repo)
- `app/components/SourceBubble.tsx:1` | Componente `SourceBubble` | Alto (sin usos detectados)
- `app/components/AccountManagement.tsx:1` | Componente `AccountManagement` | Medio-Alto (no se encontró consumo)
- `app/components/LazyFloatingChatWidget.tsx:10` | `LazyFloatingChatWidget` | Medio (no se encontró consumo)
- `app/components/FloatingChatWidget.tsx:7` | `FloatingChatWidget` | Medio (no se encontró consumo)
- `app/components/AppSidebar.tsx:73-79` | `integrationItems` (filtro por títulos que no existen) | Alto (siempre vacío)

### 3. 🐳 Componentes Gigantes (Bloated Components)

Archivo | Líneas | Diagnóstico
- `app/components/DocumentManagement.tsx` | 497 | Mezcla fetch, estado complejo, vista, modales y utilidad de formato
- `app/components/AppSidebar.tsx` | 318 | Maneja tema, auth, navegación, y UI compleja en un único componente
- `src/features/chat/components/ChatWindow.tsx` | 239 | Streaming, scroll, focus, estado, y UI en un único bloque (parcialmente saneado: tokens de color brand) ✅
- `app/admin/settings/page.tsx` | 1000+ | Config + upload logo (XHR), sliders, previews móviles/escritorio, estado masivo
- `app/components/DebugInspector.tsx` | 1000+ | UI de inspección extensa, cálculos y visualizaciones en un solo archivo

Recomendación: dividir por responsabilidades (data hooks, services, UI presentacional), y lazy load de paneles auxiliares.

### 4. ♻️ Redundancia y Duplicidad (DRY Violations)

- ~~Tipos duplicados de `Message` en `app/components/ChatMessageBubble.tsx:4-12` y `app/hooks/useChatStream.ts:5-13`~~ ✅ `ChatMessageBubble` ahora utiliza `@/types/chat` y reexporta el tipo; pendiente mover tipos a `shared/types`.
- Doble módulo de `useToast`: `app/hooks/use-toast.ts:1-191` y re-export en `app/components/ui/use-toast.ts:1-3`. Mantener solo uno en `shared/hooks`.
- Constantes/puentes: `app/utils/constants.tsx:1` reexporta `API_URL` desde `lib/constants.ts`, que a su vez reexporta desde `lib/config.ts`. Consolidar en un único origen.
- Estilos e inline-colors repetidos (hex y variables). Unificar vía CSS variables (`--primary`) y tokens en Tailwind. ✅ Token `brand` configurado y aplicado en componentes de chat.
- Fetch lógico repetido fuera de servicios: `app/admin/settings/page.tsx` usa `XMLHttpRequest` y `fetch` directo para logo; `app/utils/sendFeedback.tsx` usa `fetch` directo. Usar `authenticatedFetch` y servicios dedicados.

### 5. ⚠️ Anti-Patrones y Rendimiento

- Renderizado: Sobreuso de `use client` en páginas clave. Migrar a Server Components y mantener islands interactivas.
- Estado: Componentes monolíticos con múltiples `useState` y efectos (ej. settings, document management). Extraer hooks especializados (`useDocuments`, `useBotConfig`) y memorizar cálculos.
- Estilos: Uso de `style={{}}` en muchos lugares, p.ej. ~~`app/components/ChatWindow.tsx:138,266`~~ ✅ (ahora `src/features/chat/components/ChatWindow.tsx` con `bg-brand`/`text-brand`), `app/admin/settings/page.tsx:244,279,425`. Preferir clases Tailwind y variables CSS.
- Seguridad: `TokenManager` guarda `refresh_token` en `localStorage` y `auth_token` en cookie no HttpOnly (`app/lib/services/authService.ts:45-58`). Riesgo ante XSS. Sugerir cookies HttpOnly en backend y evitar exponer refresh en web.
- Hooks: Efectos con dependencias mínimas o vacías; revisar `app/components/ChatWindow.tsx:88-97` (carga de estado activo del bot) y consolidar fuentes de verdad.
- UI: Filtro `integrationItems` en `AppSidebar` no coincide con títulos reales (`Web` y `WhatsApp`), generando sección vacía.

### 6. 🎨 Consistencia de UI/UX

- Colores: Mezcla de hex hardcodeados y variables CSS. Ejemplos: `app/page.tsx:166` usa `bg-[#da5b3e]`; presets en `app/admin/settings/page.tsx:120`; debug usa `#0F1115`. Centralizar paleta en tokens. ✅ `brand` configurado en Tailwind y aplicado en chat.
- Nombres: Carpeta `Documents/` (PascalCase) junto con `configuracion-whatsapp/` (kebab-case) y `usuarios/` (lowercase). Uniformar a `kebab-case` para rutas y `PascalCase` para componentes.
- Componentes de UI: Mezcla de estilos inline y Tailwind; establecer guideline (Tailwind + CSS vars) y aplicar sistemáticamente.

—

Plan de mejora propuesto (priorizado):
- Reestructurar carpetas a modelo por features y `shared/*`.
- Reducir `use client` en páginas; mover datos a Server Components.
- Unificar tipos y hooks compartidos (`Message`, `useToast`).
- Centralizar servicios y `authenticatedFetch`; eliminar `XMLHttpRequest` directo.
- ~~Introducir tokens de diseño y CSS variables para colores y tamaños~~ ✅ (parcial: `--brand-color` + `colors.brand` ya operativos en chat).
- Dividir componentes gigantes en contenedor + presentacionales; lazy load de paneles secundarios.

Referencias clave:
- Duplicidad de `Message`: `src/features/chat/components/ChatMessageBubble.tsx` (resuelto) ✅, `app/hooks/useChatStream.ts:5-13` (pendiente mover tipos a `shared/types`).
- `integrationItems` vacío: `app/components/AppSidebar.tsx:73-79`
- Inline styles frecuentes: `src/features/chat/components/ChatWindow.tsx` (resuelto en colores de marca) ✅; `app/admin/settings/page.tsx:244,279,425` (pendiente).
- TokenManager y almacenamiento de tokens: `app/lib/services/authService.ts:45-58`, `app/lib/services/authService.ts:93-112`

