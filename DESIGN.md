---
name: Aleph
description: Plataforma RAG para empresas — el panel de control de tu asistente inteligente
colors:
  primary: "#4f35cc"
  primary-faint: "#f0edff"
  primary-muted: "#8b7fd4"
  bg-light: "#fafaff"
  bg-dark: "#100f1c"
  surface-dark: "#1a1930"
  surface-dark-elevated: "#232238"
  fg-light: "#131228"
  fg-dark: "#f2f1ff"
  muted-light: "#6b6688"
  muted-dark: "#9a97b4"
  border-light: "#e0dff0"
  border-dark: "#2e2c4a"
  success: "#17a96a"
  warning: "#d48c0a"
  error: "#dc2626"
  info: "#0ea5e9"
typography:
  display:
    fontFamily: "'Space Grotesk', system-ui, sans-serif"
    fontSize: "clamp(2rem, 3vw + 0.5rem, 3.5rem)"
    fontWeight: 700
    lineHeight: 1.05
    letterSpacing: "-0.03em"
  headline:
    fontFamily: "'Space Grotesk', system-ui, sans-serif"
    fontSize: "clamp(1.25rem, 1.5vw + 0.5rem, 1.75rem)"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  title:
    fontFamily: "'Space Grotesk', system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-0.01em"
  body:
    fontFamily: "'Inter', system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "normal"
  label:
    fontFamily: "'Space Grotesk', system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "0.06em"
  mono:
    fontFamily: "'DM Mono', 'Fira Code', 'Courier New', monospace"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "-0.01em"
rounded:
  sm: "4px"
  md: "8px"
  lg: "12px"
  xl: "16px"
  "2xl": "20px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
  "2xl": "48px"
  "3xl": "64px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "#ffffff"
    rounded: "{rounded.md}"
    padding: "10px 20px"
    typography: "{typography.label}"
  button-primary-hover:
    backgroundColor: "#3d25b0"
    textColor: "#ffffff"
    rounded: "{rounded.md}"
    padding: "10px 20px"
  button-outline:
    backgroundColor: "transparent"
    textColor: "{colors.primary}"
    rounded: "{rounded.md}"
    padding: "10px 20px"
  button-outline-hover:
    backgroundColor: "{colors.primary-faint}"
    textColor: "{colors.primary}"
    rounded: "{rounded.md}"
    padding: "10px 20px"
  status-ok:
    backgroundColor: "#dcfce7"
    textColor: "#15803d"
    rounded: "{rounded.full}"
    padding: "3px 10px"
  status-warn:
    backgroundColor: "#fef9c3"
    textColor: "#a16207"
    rounded: "{rounded.full}"
    padding: "3px 10px"
  status-crit:
    backgroundColor: "#fee2e2"
    textColor: "#b91c1c"
    rounded: "{rounded.full}"
    padding: "3px 10px"
---

# Design System: Aleph

## 1. Overview

**Creative North Star: "La Sala de Control"**

Aleph es una herramienta de trabajo seria. El usuario que la abre tiene una tarea: entender si su bot funciona, tomar acción si no. El diseño responde a esa misión con densidad controlada — información disponible cuando se necesita, silenciosa cuando no. La estética viene de los centros de misión crítica: cada elemento en pantalla justifica su presencia, cada color tiene un significado, cada animación tiene una función.

El sistema opera en dos registros visuales. El dashboard principal (modo claro) es el espacio de trabajo cotidiano: limpio, confiable, con el violeta primario como señal de autoridad en elementos interactivos. La página de observabilidad es territorio oscuro: dark-mode-first, números monoespaciados, animaciones que pulsan al ritmo del sistema vivo. La transición entre ambos no es un accidente — es diseño intencional que comunica "aquí entramos al motor".

La paleta rechaza el reflejo de categoría: nada de azul SaaS corporativo, nada de verde startup. El violeta-índigo es raro en este mercado y tiene carga semántica correcta para IA/conocimiento sin gritar "hecho con IA". No hay gradientes de texto, glassmorphism decorativo, ni iconos de cerebros flotantes. La sofisticación se demuestra con precisión tipográfica, espaciado deliberado y datos que hablan solos.

**Key Characteristics:**
- Violeta índigo como color primario — infrecuente en chatbot SaaS, semánticamente correcto para conocimiento/IA
- Dos modos de superficie: light (trabajo cotidiano) + dark (observabilidad / ingeniería)
- Tipografía en tres capas: Space Grotesk para identidad, Inter para lectura, DM Mono para datos técnicos
- Animaciones funcionales: pulso en servicios vivos, transición de pipeline, no decoración
- Densidad variable: dashboard ligero, observabilidad densa pero legible


## 2. Colors: La Paleta Violeta Índigo

El sistema usa violeta-índigo como único acento, con neutrales tintados hacia ese mismo hue para coherencia perceptual. Nada es puramente gris — cada neutral carga 4-6 unidades de hue 280-285 en OKLCH.

### Primary
- **Deep Violet-Indigo** (`#4f35cc` / `oklch(45% 0.24 280)`): El acento único del sistema. Botones primarios, estados activos en sidebar, el dot de estado del bot activo, el segmento dominante del donut de gating. Nunca usado como fondo de página.
- **Soft Violet Tint** (`#f0edff` / `oklch(95% 0.04 280)`): Fondo de hover en sidebar, highlight de item activo en modo claro, background de chips en estado seleccionado.
- **Muted Violet** (`#8b7fd4` / `oklch(62% 0.12 280)`): Texto de soporte, etiquetas secundarias, iconos en estado idle. No para texto sobre fondo blanco sin verificar contraste.

### Neutral (Light Mode)
- **Barely Violet White** (`#fafaff`): Background de página en modo claro. El violet hint es subliminal — no perceptible como "morado", sí perceptible como "no genérico".
- **Near-Black Violet** (`#131228`): Foreground principal. Más rico que `#000000` puro.
- **Muted Light** (`#6b6688`): Texto secundario, labels, metadata. Contraste AA sobre `#fafaff`.
- **Border Light** (`#e0dff0`): Separadores, bordes de inputs en rest, divisores de tabla.

### Neutral (Dark Mode — Observabilidad)
- **Dark Void** (`#100f1c`): Background de página en modo oscuro. Casi negro con hue violeta profundo.
- **Surface Dark** (`#1a1930`): Primer nivel de elevación — cards, paneles laterales.
- **Surface Dark Elevated** (`#232238`): Segundo nivel — dropdowns, tooltips, modales sobre dark.
- **Off-White Violet** (`#f2f1ff`): Foreground en dark mode. No es blanco puro.
- **Muted Dark** (`#9a97b4`): Texto secundario en dark.
- **Border Dark** (`#2e2c4a`): Bordes sutiles en dark mode.

### Semantic
- **Success** (`#17a96a`): Estado healthy en observabilidad, tasa de éxito alta, bot activo.
- **Warning** (`#d48c0a`): Estado degraded, atención requerida, Redis en fallback.
- **Error** (`#dc2626`): Estado crítico, MongoDB/Qdrant caído, tasa de error alta.
- **Info** (`#0ea5e9`): Datos neutrales sin evaluación de salud.

**La Regla del Color Único.** El violeta-índigo es la única señal de acento. No existe un segundo color de acento diferente. Los colores semánticos (success/warning/error) son de estado — no son identidad. Si algo necesita énfasis y no es un estado, usa peso tipográfico, no un color nuevo.

**La Regla del Tinte Neutral.** Ningún fondo o borde es gray puro. Todos los neutrales llevan al menos `C=0.004` en OKLCH apuntando a H=280. Esto crea cohesión sin que el usuario lo note conscientemente.


## 3. Typography: Tres Capas, Un Sistema

**Display / Heading Font:** Space Grotesk (Google Fonts, variable)
**Body Font:** Inter (Google Fonts, variable)
**Mono Font:** DM Mono (Google Fonts)

**Character:** Space Grotesk da carácter geométrico sin frialdad — sus letras tienen idiosincrasia sutil que Inter no tiene, especialmente en mayúsculas y en números. Inter sigue siendo el mejor texto de cuerpo para pantalla. DM Mono tiene la presencia de una fuente de terminal sin ser incómoda de leer — perfecta para latencias, PIDs, timestamps.

### Hierarchy
- **Display** (Space Grotesk 700, clamp 2–3.5rem, lh 1.05, tracking -0.03em): Número dominante en el dashboard. El "1,247 mensajes" tipográfico sin card wrapper. Una vez por pantalla, máximo.
- **Headline** (Space Grotesk 600, clamp 1.25–1.75rem, lh 1.2, tracking -0.02em): Títulos de sección, nombre de página en header. Máximo 2-3 por pantalla.
- **Title** (Space Grotesk 600, 1rem, lh 1.3, tracking -0.01em): Títulos de cards, labels de sección en sidebar, headers de tabla.
- **Body** (Inter 400, 15px, lh 1.6, max 65ch): Descripciones, tooltips, contenido de párrafo. Nunca más ancho de 65ch.
- **Label** (Space Grotesk 500, 12px, lh 1.4, tracking +0.06em, UPPERCASE): Labels de KPI, headers de tabla, chips de estado, navegación sidebar. Uppercase solo en este rol.
- **Mono** (DM Mono 400, 14px, lh 1.5, tracking -0.01em): Todos los datos técnicos: latencias en ms, worker PID, conteo de muestras, timestamps, throughput values, versiones. Si es un número que mide un sistema, va en mono.

**La Regla Mono.** Todo número que representa una métrica del sistema — latencia, uptime, tokens, costo, chats/min — se renderiza en DM Mono. Los números tipográficos de marketing (el gran "1,247 mensajes" en dashboard) van en Space Grotesk. La diferencia es intencional: sistema vs identidad.


## 4. Elevation

El sistema usa elevación tonal, no sombras decorativas. En modo claro, la jerarquía se comunica con fondos: `#fafaff` (base) → `#ffffff` (cards y paneles) → `#f0edff` (highlighted). En modo oscuro, la jerarquía es la secuencia `#100f1c` → `#1a1930` → `#232238`.

Las sombras existen solo como respuesta a estado, no en rest:

### Shadow Vocabulary
- **Sombra de reposo de card** (`0 1px 2px rgb(0 0 0 / 0.04)`): Aplicada a cards en light mode únicamente. Apenas visible — su función es separar del fondo, no decorar.
- **Sombra de hover** (`0 4px 20px rgb(79 53 204 / 0.12)`): Aparece en hover de elementos interactivos grandes (cards cliqueables, botones de acción). El color de la sombra es el primario, no negro — crea un halo violeta sutil.
- **Sombra de foco** (`0 0 0 3px rgb(79 53 204 / 0.25)`): Ring de focus para accesibilidad. Visible sobre fondo claro y oscuro.

**La Regla Flat-by-Default.** Las superficies están planas en reposo. La elevación es una respuesta a interacción o estado elevado — no decoración estática. Un card no tiene sombra porque existe; la tiene cuando el usuario interactúa con él.


## 5. Components

### Buttons
Los botones tienen bordes redondeados suaves (8px) — no pill, no rectangular. Comunican acción sin agresividad.
- **Shape:** Gently rounded (8px)
- **Primary:** Background `#4f35cc`, text white, padding 10px 20px, label uppercase Space Grotesk 500 12px tracking 0.06em. Hover: background oscurece a `#3d25b0` con transición 150ms ease-out.
- **Outline:** Border 1.5px `#4f35cc`, text `#4f35cc`, background transparent. Hover: background `#f0edff`.
- **Ghost:** No border, no background. Text `#6b6688`. Hover: background `#f0edff`, text `#4f35cc`.
- **Destructive:** Background `#dc2626`, white text. Solo para acciones irreversibles confirmadas.
- **Focus ring:** `0 0 0 3px rgb(79 53 204 / 0.25)` sobre cualquier fondo.

### Status Badges / Pills
Elemento central del sistema — indica salud de servicios, estado del bot, health del sistema.
- **OK:** Background `#dcfce7`, text `#15803d`, dot animado (pulse verde).
- **Warn:** Background `#fef9c3`, text `#a16207`, dot ámbar estático.
- **Crit:** Background `#fee2e2`, text `#b91c1c`, dot rojo con pulse rápido (1s).
- **Info / Unknown:** Background `#f0edff`, text `#4f35cc`, dot gris.
- Shape: pill completo (border-radius 9999px), padding 3px 10px, label 11px Space Grotesk 500.

### Cards / Containers
- **Light mode:** Background `#ffffff`, border 1px `#e0dff0`, radius 12px, shadow de reposo mínima. Padding interno 20-24px.
- **Dark mode:** Background `#1a1930`, border 1px `#2e2c4a`, radius 12px, sin sombra.
- **Hover interactivo:** Sombra `0 4px 20px rgb(79 53 204 / 0.12)`, translateY(-1px), 200ms ease-out.
- **Prohibido:** Franja de borde izquierdo/derecho como acento de color. Nunca `border-left: 3px solid`. Usar tint de fondo o nada.

### Inputs / Fields
- **Rest:** Background `#fafaff`, border 1.5px `#e0dff0`, radius 8px, text `#131228`.
- **Focus:** Border `#4f35cc`, shadow `0 0 0 3px rgb(79 53 204 / 0.15)`, background `#ffffff`.
- **Error:** Border `#dc2626`, shadow `0 0 0 3px rgb(220 38 38 / 0.15)`.
- **Dark mode rest:** Background `#1a1930`, border `#2e2c4a`.
- **Dark mode focus:** Border `#8b7fd4`, shadow `0 0 0 3px rgb(139 127 212 / 0.2)`.

### Navigation (Sidebar)
- **Background:** Blanco en light, `#100f1c` en dark.
- **Item rest:** Text `#6b6688` (light) / `#9a97b4` (dark), no background.
- **Item hover:** Background `#f0edff` (light) / `#1a1930` (dark), text `#131228` / `#f2f1ff`.
- **Item active:** Background `#f0edff` (light) / `#1a1930` (dark), text `#4f35cc` (ambos), dot violeta a la izquierda del label (2px × 16px, `border-left: 2px solid #4f35cc` — excepción permitida solo en nav items, no en cards).
- **Label de grupo:** Space Grotesk 500 11px uppercase tracking 0.1em, `#9a97b4`.

### Pipeline Waterfall (Componente Signature)
El visualizador del pipeline RAG en la página de observabilidad. Único en el mercado de chatbot SaaS.
- **Nodos:** Rectángulos con radius 8px, background `#232238`, border 1px `#2e2c4a`. Texto en Space Grotesk title. Latencia en DM Mono.
- **Conectores:** Líneas horizontales con grosor proporcional al p50 del segmento (min 2px, max 8px). Color = estado de salud (verde/ámbar/rojo según thresholds).
- **Animación al cargar datos nuevos:** Los conectores hacen `stroke-dashoffset` de derecha a izquierda en 600ms ease-out-quart. Respeta `prefers-reduced-motion`.
- **Nodo activo (hover):** Border cambia a `#4f35cc`, aparece tooltip con p50/p95/p99 + sample count.

### Systems Status Bar (Componente Signature)
Muestra MongoDB, Redis, Qdrant, RAG como nodos con estado vivo.
- **Nodo healthy:** Dot circular 8px con pulse animation (scale 1→1.4→1, opacity 1→0, 2s infinite). Color `#17a96a`.
- **Nodo degraded:** Dot ámbar estático con border punteado.
- **Nodo critical:** Dot rojo con pulse rápido (1s). El nodo completo tiene background `#fee2e2` en dark mode para visibilidad inmediata.
- **Latencia del servicio:** Bajo el nombre del nodo, en DM Mono 11px `#9a97b4`.


## 6. Do's and Don'ts

### Do:
- **Do** usar `#fafaff` (barely violet white) como background de página en light mode, no `#ffffff` puro ni ningún `hsl(0 0% 100%)` sin tinte.
- **Do** renderizar todas las métricas técnicas (latencias, uptime, PIDs, tokens, costos) en DM Mono. La distinción mono/sans comunica "dato de sistema" vs "dato de negocio".
- **Do** usar `oklch()` en los tokens CSS del proyecto, aunque la YAML frontmatter use hex por compatibilidad Stitch.
- **Do** animar los dots de estado vivo con `@keyframes pulse` en `box-shadow` o `opacity`. Los servicios que respiran se sienten diferentes a los servicios estáticos.
- **Do** hacer que la sombra de hover use el color primario (`rgb(79 53 204 / 0.12)`), no negro. El halo violeta en hover conecta visualmente el elemento con la identidad del sistema.
- **Do** usar el pipeline waterfall como la visualización central de latencia. Es la diferencia visual más fuerte contra cualquier competidor.
- **Do** verificar contraste WCAG AA antes de usar `#8b7fd4` (muted violet) como texto. Solo es seguro sobre `#fafaff` a tamaños ≥16px o bold.

### Don't:
- **Don't** usar `border-left: 3px solid [color]` como acento decorativo en cards, list items o callouts. Prohibido. Usar tint de fondo o border completo si se necesita separación visual.
- **Don't** usar `background-clip: text` con gradient para texto de énfasis. Usar `#4f35cc` sólido y peso 700.
- **Don't** usar `#3b82f6` (Tailwind blue-500) en ningún lugar del sistema. Es el color que reemplazamos explícitamente.
- **Don't** imitar visualmente a Intercom, Zendesk, Hubspot, Salesforce ni ChatGPT. Si alguien ve la pantalla y piensa en alguna de esas herramientas, el diseño falló.
- **Don't** usar glassmorphism (blur + transparencia) como decoración. Si aparece, es porque hay una razón estructural, no estética.
- **Don't** crear un diseño que parezca una plantilla shadcn sin modificar. Cards idénticas en grids uniformes, Inter como única fuente, azul primario — eso es exactamente el estado anterior.
- **Don't** animar propiedades de layout CSS (width, height, top, left, padding). Solo `transform` y `opacity`. Sin excepciones.
- **Don't** usar gradientes de texto decorativos en headings. Es el patrón más fácil para que algo parezca "hecho con IA" sin diseñador real.
- **Don't** mostrar el pipeline RAG como un bar chart agrupado genérico. El pipeline tiene forma secuencial — debe visualizarse como flujo, no como estadística.
- **Don't** mostrar los servicios (MongoDB, Qdrant, Redis) como filas de tabla con dots de color. Merecen presencia visual como nodos de sistema, no como checkboxes.
- **Don't** ignorar `prefers-reduced-motion`. Todas las animaciones de pulse, flujo de pipeline y transiciones deben estar wrapped en `@media (prefers-reduced-motion: no-preference)`.
