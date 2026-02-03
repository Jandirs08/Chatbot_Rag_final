# Informe Técnico de Auditoría Frontend

## Resumen Ejecutivo
- AdminSettingsPage es extremadamente grande y multifunción; aumenta riesgo de bugs y dificulta mantenimiento (High).
- Color del texto global para inputs/textareas fuerza negro y puede romper contraste en dark mode (High).
- Duplicación de lógica de historial/conversationId entre ChatPage y PlaygroundPage; favorece errores y dificulta cambios (Medium).
- Quick wins: hacer import dinámico del componente de charts para reducir bundle inicial (Low) y corregir keys en el listado de mensajes del Buzón (Medium).

## Mapa del Proyecto
- Raíz frontend con Next.js App Router: [frontend/app](file:///c:/DEV%20Jandir%202026/Chatbot_Rag_final/frontend/app), rutas por carpeta (auth/, chat/, admin/, Documents/, configuracion-whatsapp/, usuarios/, widget/).
- Layout global en [layout.tsx](file:///c:/DEV%20Jandir%202026/Chatbot_Rag_final/frontend/app/layout.tsx) usando AuthProvider y RootLayoutClient; sidebar y topbar viven en [components](file:///c:/DEV%20Jandir%202026/Chatbot_Rag_final/frontend/app/components).
- UI shared consolidada en [components/ui](file:///c:/DEV%20Jandir%202026/Chatbot_Rag_final/frontend/app/components/ui) con botón, input, card, table, toast, sidebar y más (Radix, Tailwind).
- Hooks y servicios en [hooks](file:///c:/DEV%20Jandir%202026/Chatbot_Rag_final/frontend/app/hooks) y [lib/services](file:///c:/DEV%20Jandir%202026/Chatbot_Rag_final/frontend/app/lib/services), con API_URL en [config.ts](file:///c:/DEV%20Jandir%202026/Chatbot_Rag_final/frontend/app/lib/config.ts).
- Features de chat en [src/features/chat](file:///c:/DEV%20Jandir%202026/Chatbot_Rag_final/frontend/src/features/chat), incluyendo ChatWindow y burbujas.
- Estilos globales y tokens en [globals.css](file:///c:/DEV%20Jandir%202026/Chatbot_Rag_final/frontend/app/globals.css), Tailwind en [tailwind.config.ts](file:///c:/DEV%20Jandir%202026/Chatbot_Rag_final/frontend/tailwind.config.ts).
- Middleware de protección de rutas en [middleware.ts](file:///c:/DEV%20Jandir%202026/Chatbot_Rag_final/frontend/middleware.ts).
- Páginas principales: Home [page.tsx](file:///c:/DEV%20Jandir%202026/Chatbot_Rag_final/frontend/app/page.tsx), Buzón [admin/inbox/page.tsx](file:///c:/DEV%20Jandir%202026/Chatbot_Rag_final/frontend/app/admin/inbox/page.tsx), Documentos [Documents/page.tsx](file:///c:/DEV%20Jandir%202026/Chatbot_Rag_final/frontend/app/Documents/page.tsx), WhatsApp [configuracion-whatsapp/page.tsx](file:///c:/DEV%20Jandir%202026/Chatbot_Rag_final/frontend/app/configuracion-whatsapp/page.tsx), Configuración del Bot [admin/settings/page.tsx](file:///c:/DEV%20Jandir%202026/Chatbot_Rag_final/frontend/app/admin/settings/page.tsx).

## Tabla de Hallazgos Priorizados

Severidad | Hallazgo | Evidencia (archivo+línea) | Impacto | Fix recomendado
--- | --- | --- | --- | ---
High | Página de configuración demasiado grande | [admin/settings/page.tsx:L1-L120](file:///c:/DEV%20Jandir%202026/Chatbot_Rag_final/frontend/app/admin/settings/page.tsx#L1-L120) | 1.077 líneas, muchos estados y responsabilidades mezcladas; difícil de testear y mantener | Extraer subcomponentes por pestaña (appearance/brain/system) en archivos separados; mover lógica de estado común a hooks locales reutilizables; mantener misma UI y API.
High | Contraste roto en dark mode para inputs | [globals.css:L160-L163](file:///c:/DEV%20Jandir%202026/Chatbot_Rag_final/frontend/app/globals.css#L160-L163) | Forzar color negro en body input/textarea puede anular dark:text-white y generar texto negro sobre fondo oscuro | Eliminar o limitar la regla a un selector más específico no global; confiar en utilidades Tailwind (text-foreground, dark:text-white) ya presentes en Input.
Medium | Keys inestables por índice en lista de mensajes | [admin/inbox/page.tsx:L668-L676](file:///c:/DEV%20Jandir%202026/Chatbot_Rag_final/frontend/app/admin/inbox/page.tsx#L668-L676) | key={idx} puede causar re-renderes erróneos al cambiar orden/insertar mensajes | Usar key estable (p.ej., timestamp + role o hash de contenido) o el id propio del mensaje si está disponible.
Medium | Duplicación de lógica de historial y conversationId | [chat/page.tsx:L17-L43](file:///c:/DEV%20Jandir%202026/Chatbot_Rag_final/frontend/app/chat/page.tsx#L17-L43), [dashboard/playground/page.tsx:L17-L34](file:///c:/DEV%20Jandir%202026/Chatbot_Rag_final/frontend/app/dashboard/playground/page.tsx#L17-L34) | Copiar/pegar gestión de localStorage y fetch del historial aumenta deuda y dificulta cambios coherentes | Extraer hook utilitario (useConversationHistory) que encapsule ID y carga de historial; reutilizar en ambas páginas.
Medium | Import innecesario y fuera de lugar en settings de dashboard | [dashboard/settings/page.tsx:L12](file:///c:/DEV%20Jandir%202026/Chatbot_Rag_final/frontend/app/dashboard/settings/page.tsx#L12) | Import tras export default y no usado; puede provocar warnings de build y confusión | Eliminar el import; mantener sólo el redirect.
Medium | Activo de menú basado en igualdad exacta de pathname | [AppSidebar.tsx:L123-L131](file:///c:/DEV%20Jandir%202026/Chatbot_Rag_final/frontend/app/components/AppSidebar.tsx#L123-L131) | pathname===url puede fallar para subrutas o query strings; UX del “activo” inexacta | Cambiar a startsWith para secciones (p.ej., pathname.startsWith('/admin/settings')); mantener exacto para rutas puntuales; revisar casos de Home '/'.
Medium | Gestión de tema acoplada al pathname | [RootLayoutClient.tsx:L16-L27](file:///c:/DEV%20Jandir%202026/Chatbot_Rag_final/frontend/app/components/RootLayoutClient.tsx#L16-L27) | Side-effect global en router (force light en /chat) crea acoplamiento entre navegación y tema, difícil de extender | Extraer política de tema a config contextual (p.ej., ThemeContext con overrides por ruta); mantener comportamiento actual con una lista de rutas “light” configurable.
Low | Bundle mayor por import sincrónico de charts | [DashboardCharts.tsx:L15](file:///c:/DEV%20Jandir%202026/Chatbot_Rag_final/frontend/app/components/dashboard/DashboardCharts.tsx#L15), [app/page.tsx:L303-L304](file:///c:/DEV%20Jandir%202026/Chatbot_Rag_final/frontend/app/page.tsx#L303-L304) | Recharts es pesado; cargado en la home sin lazy loading aumenta TTI en dispositivos lentos | Import dinámico de DashboardCharts con Suspense y fallback Skeleton; opcionalmente ssr:false si aplica.
Low | Toast propio con TTL extremadamente largo | [use-toast.ts:L8-L10](file:///c:/DEV%20Jandir%202026/Chatbot_Rag_final/frontend/app/hooks/use-toast.ts#L8-L10) | TOAST_REMOVE_DELAY=1.000.000ms deja toasts visibles por ~16min; puede saturar UI | Reducir TTL a ~6–10s; unificar uso con Sonner Toaster ya presente en layout para consistencia.
Low | Import no usado en ChatWindow | [ChatWindow.tsx:L6](file:///c:/DEV%20Jandir%202026/Chatbot_Rag_final/frontend/src/features/chat/components/ChatWindow.tsx#L6) | EmptyState importado pero no utilizado | Eliminar import; si se desea mostrar estado vacío, integrarlo condicionalmente cuando no hay mensajes.

## Hotspots
- AdminSettingsPage: tamaño y mezcla de UI/estado/persistencia; ver [admin/settings/page.tsx](file:///c:/DEV%20Jandir%202026/Chatbot_Rag_final/frontend/app/admin/settings/page.tsx).
- RootLayoutClient: side-effects de tema y lógica de visibilidad de sidebar dependiente de rutas; ver [RootLayoutClient.tsx](file:///c:/DEV%20Jandir%202026/Chatbot_Rag_final/frontend/app/components/RootLayoutClient.tsx).
- AdminInboxPage: listado, filtros y polling; claves de items y scroll; ver [admin/inbox/page.tsx](file:///c:/DEV%20Jandir%202026/Chatbot_Rag_final/frontend/app/admin/inbox/page.tsx).

## CSS/Design Debt
- Tokens consistentes bien definidos en globals.css; sin embargo, la regla global de color para inputs/textareas rompe el sistema de tokens y el modo oscuro (ver [globals.css:L160-L163](file:///c:/DEV%20Jandir%202026/Chatbot_Rag_final/frontend/app/globals.css#L160-L163)). Recomendación: eliminarla y usar utilidades de Input (dark:text-white).
- Duplicación de seteo de brand color via documentElement en varias vistas: [admin/inbox/page.tsx:L125-L132](file:///c:/DEV%20Jandir%202026/Chatbot_Rag_final/frontend/app/admin/inbox/page.tsx#L125-L132) y [ChatWindow.tsx:L104-L111](file:///c:/DEV%20Jandir%202026/Chatbot_Rag_final/frontend/src/features/chat/components/ChatWindow.tsx#L104-L111). Centralizar en un hook/efecto global.
- Naming inconsistente de rutas: carpeta “Documents” en mayúscula y uso de “/Documents”. Conviene homogeneizar a minúsculas (necesita verificación de impacto en despliegues sensibles a mayúsculas/minúsculas).

## Dead Code
- Import no usado y fuera de bloque en [dashboard/settings/page.tsx:L12](file:///c:/DEV%20Jandir%202026/Chatbot_Rag_final/frontend/app/dashboard/settings/page.tsx#L12). Impacto: warnings de compilación. Fix: eliminar línea.
- EmptyState importado sin uso en [ChatWindow.tsx:L6](file:///c:/DEV%20Jandir%202026/Chatbot_Rag_final/frontend/src/features/chat/components/ChatWindow.tsx#L6). Impacto: bytes de bundle. Fix: quitar import o usarlo cuando no haya mensajes.
- Posible solapamiento de frameworks de toast (Sonner vs toast propio): NECESITA VERIFICACIÓN. Revisar uso real y consolidar uno.

## NECESITA VERIFICACIÓN
- Exposición de Twilio Auth Token en UI admin: [configuracion-whatsapp/page.tsx:L170-L183](file:///c:/DEV%20Jandir%202026/Chatbot_Rag_final/frontend/app/configuracion-whatsapp/page.tsx#L170-L183). Verificar que la página esté protegida por permisos admin (usa useAuthGuard) y que el backend filtre el token para roles menores. Método: probar acceso sin ser admin y observar respuesta del backend y render del campo.
- Virtualización de listas: Buzón pagina a 50 items; si crece y hay latencia de scroll en dispositivos de baja gama, considerar virtualización. Método: medir FPS y React Profiler con 200+ items simulados.

## Roadmap de Refactor (PRs Pequeños)
- PR1: Corregir keys en mensajes del Buzón.
  - Cambiar key={idx} por key estable (timestamp+role o hash de contenido) en [admin/inbox/page.tsx:L668-L676](file:///c:/DEV%20Jandir%202026/Chatbot_Rag_final/frontend/app/admin/inbox/page.tsx#L668-L676).
  - Revisar que no se generen duplicados en actualizaciones.
- PR2: Reducir deuda en AdminSettingsPage sin reescritura grande.
  - Extraer pestaña “appearance” a componentes separados y mover su estado local correspondiente.
  - Repetir para “brain” y “system”. Mantener APIs actuales, imports desde page.tsx.
- PR3: Lazy load de charts en Home.
  - dynamic(() => import("./components/dashboard/DashboardCharts"), { ssr: false }) con Suspense y Skeleton en [app/page.tsx](file:///c:/DEV%20Jandir%202026/Chatbot_Rag_final/frontend/app/page.tsx).
- PR4: Arreglar contraste en dark mode.
  - Eliminar regla global de color en [globals.css:L160-L163](file:///c:/DEV%20Jandir%202026/Chatbot_Rag_final/frontend/app/globals.css#L160-L163); validar que Input mantiene legibilidad con dark:text-white.
- PR5: Unificar gestión de brand color.
  - Crear hook/useBrandColor que setee --brand-color tras cargar getPublicBotConfig, usar en RootLayoutClient; remover duplicaciones en Buzón y ChatWindow.
- PR6: Limpiezas menores.
  - Quitar import sobrante en [dashboard/settings/page.tsx:L12](file:///c:/DEV%20Jandir%202026/Chatbot_Rag_final/frontend/app/dashboard/settings/page.tsx#L12).
  - Eliminar import no usado de EmptyState en [ChatWindow.tsx:L6](file:///c:/DEV%20Jandir%202026/Chatbot_Rag_final/frontend/src/features/chat/components/ChatWindow.tsx#L6).
  - Ajustar matcher de middleware si “/public” no es aplicable (opcional).
