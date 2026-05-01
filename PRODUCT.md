# Product

## Register

product

## Users

**Perfil primario:** Dueño de negocio o gerente general de PYME latinoamericana que adoptó un chatbot con IA para su empresa. Accede ocasionalmente para revisar métricas, activar/desactivar el sistema, subir documentos.

**Perfil secundario:** Encargado de marketing o ventas que gestiona el día a día: revisa conversaciones, evalúa leads, ajusta el comportamiento del bot.

**Contexto de uso:** Laptop en oficina, horario laboral. No es su herramienta principal del día — la usan en sesiones de 5-15 minutos. Tienen poco apetito por aprender interfaces complicadas. Necesitan confianza inmediata: saber que el sistema funciona, qué tan bien funciona, y poder actuar rápido cuando no funciona.

**No son:** desarrolladores ni DevOps. El observability no es para ellos — ese perfil es el admin técnico (el propio Jandir u otro implementador).

## Product Purpose

Plataforma de administración para un chatbot RAG (Retrieval-Augmented Generation) que empresas usan para atender clientes. Permite cargar documentos como base de conocimiento, configurar la apariencia y comportamiento del bot, integrarlo con WhatsApp y web, y monitorear su rendimiento en tiempo real.

El producto compite con herramientas de chatbot genéricas (Intercom, Tidio, ManyChat) al ofrecer respuestas basadas en documentos reales de la empresa — no respuestas inventadas. La diferenciación técnica (RAG, pipeline de búsqueda híbrida, observabilidad del sistema) es real y valiosa, pero solo si se comunica con claridad.

**Éxito:** El usuario abre el dashboard, entiende en 10 segundos si el bot está funcionando bien, y puede tomar acción sin fricciones.

## Brand Personality

**Tres palabras:** Accesible · Profesional · Directo

**Tono:** Habla como un colega técnico de confianza que no te subestima. Sin jerga innecesaria, sin infantilizar. Los datos se presentan con contexto suficiente para actuar — no son decoración.

**Emoción objetivo:** Confianza tranquila. El usuario no debería sentir ansiedad al abrir el dashboard. La interfaz da señales claras de estado, y cuando algo está mal, dice exactamente qué y qué hacer.

**No grita IA.** La sofisticación técnica del producto se demuestra a través de la calidad de la interfaz, no a través de íconos de cerebros o gradientes de arcoíris.

## Nombre sugerido

**Aleph** — Referencia a *El Aleph* de Borges: un punto del espacio que contiene todos los demás puntos. Metáfora exacta para un sistema RAG: todos tus documentos, cualquier pregunta, una sola respuesta precisa. Culto, latinoamericano, internacional, no obvio como "AI" o "Bot".

*(Pendiente de confirmar con el usuario)*

## Anti-references

- **Intercom / Zendesk:** Azul corporativo, pesado, support tool clásico. Demasiado servicio al cliente de los 2010s.
- **HubSpot / Salesforce:** CRM inflado. Naranjas y azules llamativos, pantallas con 40 campos, sensación de enterprise genérico.
- **ChatGPT / OpenAI:** Blanco puro, minimalismo extremo que parece demo inacabado. Zero identidad.
- **shadcn-default sin identidad:** El look de todos los proyectos Radix + Tailwind que salieron de la misma plantilla. Primary blue-500, Inter, 3 stat cards idénticas. Este es el estado actual — y el punto de partida del rediseño.
- **Monotonía:** Stripe es una referencia válida por claridad y profesionalismo, pero no por su paleta blanco-negro. Este producto necesita color con propósito — no decorativo, pero presente.

## Design Principles

1. **Muestra la máquina, no la escondas.** El pipeline RAG, los tiempos de latencia, el estado de Qdrant y MongoDB — son el valor del producto, no complejidad a ocultar. Presentarlos con claridad genera confianza técnica.

2. **Un vistazo, una decisión.** Cada pantalla debe tener una respuesta clara a "¿está bien o no?" antes de que el usuario lea cualquier número. Estado del sistema, salud del bot, actividad reciente — legibles en segundos.

3. **Profesional ≠ frío.** Colores con carácter, tipografía con personalidad, micro-animaciones que responden. La interfaz tiene presencia sin volverse decorativa.

4. **Contexto latino, producto global.** Español como idioma primario, formatos locales (es-PE). El producto puede venderse fuera de Perú — no debe sentirse localismo, sino internacionalización que respeta el contexto original.

5. **Confianza ganada por diseño.** Si la interfaz está pulida, el usuario infiere que el sistema subyacente también lo está. El nivel de detalle visual es una señal de calidad del producto completo.

## Accessibility & Inclusion

- WCAG 2.1 AA como mínimo.
- Contraste suficiente en modo oscuro (observability) y modo claro (dashboard).
- Soporte para `prefers-reduced-motion` — las animaciones del command center deben respetar esta preferencia.
- Tipografía legible sin depender de color para comunicar estado (siempre acompañar color con texto o icono).
