# Aleph — Plataforma de Atención al Usuario con Agente RAG para la Fundación Romero

> **Trabajo de investigación para optar el título profesional de Ingeniero de Sistemas**
> Universidad: *(por completar)*
> Asesor: *(por completar)*
> Autor: Jandir
> Lima, Perú — 2026

---

## ¿Qué es exactamente?

Para evitar confusión, conviene precisar:

| ¿Qué es? | Detalle |
|---|---|
| **Una aplicación web** | Panel de administración + widget de chat embebible (Next.js). |
| **Un agente conversacional con IA** | Usa un LLM como cerebro, no flujos rígidos (decision tree). |
| **Un sistema RAG** | Las respuestas se anclan a documentos cargados por la institución. |
| **Multicanal** | Chat web + WhatsApp (vía Twilio). |

> **Definición corta para el asesor:**
> *Aleph es una plataforma web que permite a una organización desplegar un agente conversacional con IA, capaz de responder consultas en lenguaje natural usando los documentos propios de la organización como fuente de verdad. El agente decide cuándo recuperar información (RAG) y cuándo escalar a un operador humano. Se entrega vía widget web embebido y WhatsApp.*

### Por qué *agente* y no *chatbot*

**Chatbot tradicional** (ManyChat, Tidio, Landbot, Botsify):
- El humano dibuja un diagrama de flujo: *"Si dice X → respondo A; si elige opción 2 → muestro menú B"*.
- El usuario ve botones, no escribe libremente.
- Cualquier pregunta que no esté en el árbol cae en "no te entendí".
- Mantenerlo es trabajo manual: cada nueva pregunta = nuevo nodo en el flujo.

**Asistente con NLU clásica** (IBM Watson Assistant, Google Dialogflow, Microsoft LUIS, Rasa):
- Mejora el chatbot tradicional con clasificación de *intents* (intenciones) y *entities* (entidades).
- Sigue siendo flujo: *"detecté intent `consultar_beca` → ejecuto la rama de respuesta de becas"*.
- Requiere entrenar y mantener cientos de intents con ejemplos. Cada nuevo tema es trabajo de etiquetado.
- No genera respuestas, las selecciona de plantillas escritas por humanos.

**LLM puro** (ChatGPT abierto, Claude.ai en una página web):
- Entiende cualquier pregunta. No necesita flujos ni intents.
- Pero **alucina** — inventa datos cuando no los sabe. Inadmisible para una institución que da información oficial sobre becas.
- No tiene acceso a documentos privados de la organización.

**Agente con RAG** (Aleph):
- Cerebro = LLM (entiende lenguaje natural).
- Conocimiento = corpus documental de la organización (no el conocimiento general del LLM).
- En cada turno, el LLM decide autónomamente:
  - ¿Esta pregunta se responde con conversación general? → responde directo.
  - ¿Necesito datos del corpus? → invoca `search_documents` con una consulta reformulada.
  - ¿Está fuera de mi alcance o el usuario pidió un humano? → invoca `request_human_handoff` y termina el turno.
- No hay flujos. No hay intents que entrenar. Subir un documento nuevo = el agente ya lo conoce.

### Lo que el agente realmente hace (paso a paso)

Cuando llega un mensaje, el sistema ejecuta:

1. **Recibe** el mensaje por web o WhatsApp.
2. **Carga** historial reciente y el system prompt configurado por el administrador.
3. **El LLM decide:**
   - Responder directamente (saludo, small talk, pregunta ya respondida en el historial).
   - Llamar `search_documents(query, k)` con una reformulación clara de la pregunta.
   - Llamar `request_human_handoff(reason)` con motivo: `user_request`, `low_confidence` o `out_of_scope`.
4. **Si llamó búsqueda:**
   - Pipeline RAG ejecuta: recuperación jerárquica (parent-child) + búsqueda densa en Qdrant + búsqueda léxica (BM25) + re-ranker.
   - Caché de dos niveles (por turno y cross-turn vía Redis) evita recuperaciones repetidas.
   - Devuelve fragmentos relevantes al LLM como `ToolMessage`.
   - El LLM genera la respuesta final anclada a esos fragmentos.
5. **Si pidió handoff:** la conversación se marca, llega a la bandeja del operador humano, y el flujo se detiene.
6. **Persiste** la conversación en MongoDB con metadata: tiempo de RAG, herramientas invocadas, motivo de handoff.
7. **Reporta** métricas en el panel de administración.

> Nada de esto está cableado a mano por tema o por sector. El mismo agente sirve para becas, atención inmobiliaria o cualquier dominio: lo único que cambia es el corpus documental que sube el administrador.

---

## Título propuesto para la tesis

> **"Implementación de un agente conversacional con arquitectura RAG para mejorar la atención al usuario del programa Becas Grupo Romero de la Fundación Romero, Lima 2026"**

### Títulos alternativos

1. *Diseño e implementación de un agente conversacional con recuperación aumentada (RAG) y modelos de lenguaje de gran escala (LLM) para la atención de consultas en el programa Becas Grupo Romero de la Fundación Romero.*
2. *Desarrollo de un sistema de atención al usuario multicanal (Web y WhatsApp) basado en IA generativa anclada a documentos para optimizar la resolución de dudas en la Fundación Romero, 2026.*
3. *Implementación de una plataforma de soporte automatizado con agente RAG para resolver consultas sobre becas, cursos e inscripción en la Fundación Romero.*

### Convención (pregrado peruano)

`[Verbo de acción] de [solución] basado en [tecnología] para [verbo de propósito] [proceso/área] en [institución], [ciudad y año]`

---

## 1. Resumen ejecutivo

La Fundación Romero, mediante el programa **Becas Grupo Romero** y la plataforma **Campus Romero**, ha entregado más de 2 millones de becas y formado a más de 1.5 millones de peruanos en cursos virtuales gratuitos. Este volumen genera una demanda creciente de atención al usuario sobre becas disponibles, cursos, requisitos, inscripción, certificación y soporte general.

**Aleph** es una aplicación web que despliega un agente de IA conversacional anclado a la documentación oficial de la organización. Responde consultas en español, 24/7, vía web y WhatsApp, con escalamiento a operador humano cuando corresponde.

## 2. Planteamiento del problema

### Contexto

La Fundación Romero atiende a una población masiva y heterogénea. Las consultas más frecuentes son repetitivas y bien documentadas, pero llegan por canales que dependen de operadores humanos en horario laboral.

### Brechas identificadas (gap)

| Brecha | Situación actual | Consecuencia |
|---|---|---|
| **Cobertura horaria** | Atención humana en horario laboral | Consultas fuera de horario quedan en cola |
| **Tiempo de respuesta** | Correo / formulario | Espera de horas a días |
| **Repetición** | Mismas preguntas resueltas N veces | Saturación del equipo de soporte |
| **Información dispersa** | Web, redes, PDFs, FAQs | El usuario no encuentra lo que busca |
| **Visibilidad de impacto** | Reportes manuales | Dudas reales de los usuarios no se capitalizan como métrica |

### Caso de uso (atención al usuario, no postulación)

El sistema **no automatiza la postulación a becas** — eso ya tiene flujo institucional. Lo que automatiza es la **atención al usuario** alrededor de los programas:

- *"¿Qué becas hay disponibles ahora mismo?"*
- *"¿Cuáles son los requisitos para la beca de empleabilidad?"*
- *"¿Qué cursos tiene Campus Romero sobre emprendimiento?"*
- *"¿Cómo me registro en Campus Romero?"*
- *"¿Cómo descargo mi certificado?"*
- *"No me llegó el correo de confirmación, ¿qué hago?"*

Para el equipo administrativo: reportes de uso e impacto (volumen de consultas, temas más preguntados, tasa de resolución sin escalamiento, horas hombre liberadas del soporte).

### Pregunta de investigación

**General:** ¿De qué manera la implementación de un agente conversacional con arquitectura RAG mejora la atención al usuario del programa Becas Grupo Romero de la Fundación Romero?

**Específicas:**
- ¿Cómo reduce el tiempo de respuesta a consultas frecuentes?
- ¿Cómo amplía la cobertura horaria y multicanal de la atención?
- ¿Cómo asegura la veracidad de las respuestas frente a alucinaciones del LLM?
- ¿Cómo aporta visibilidad de impacto vía reportes operativos?

## 3. Objetivos

**General:**
Implementar un agente conversacional con arquitectura RAG para mejorar la atención al usuario del programa Becas Grupo Romero de la Fundación Romero.

**Específicos:**
1. Diseñar la arquitectura del agente (LLM + recuperación + herramientas + handoff humano).
2. Desarrollar el panel administrativo para gestión de documentos, configuración del agente y monitoreo.
3. Integrar canales web (widget embebido) y WhatsApp.
4. Implementar reportes de uso e impacto para la institución.
5. Evaluar la calidad de las respuestas con métricas de relevancia y *faithfulness*.

## 4. Justificación

- **Social:** Acceso a información sobre becas y cursos sin restricción de horario.
- **Tecnológica:** Aplicación productiva de IA generativa anclada a documentos verificables, con observabilidad y métricas reproducibles.
- **Institucional:** Reduce la carga del equipo de soporte y libera horas para tareas de mayor valor.
- **Académica:** Documenta una implementación real de agentes RAG en una organización peruana con caso de uso concreto.

## 5. Hipótesis

> La implementación de un agente conversacional con arquitectura RAG mejora la atención al usuario del programa Becas Grupo Romero, reduciendo el tiempo de respuesta, ampliando la cobertura horaria y manteniendo la veracidad de las respuestas mediante el anclaje a documentos oficiales.

## 6. Alcance y limitaciones

**Alcance:**
- Caso piloto: Fundación Romero — programas Becas Grupo Romero y Campus Romero.
- Canales: widget web embebido y WhatsApp (vía Twilio).
- Idioma: español.
- Atención al usuario, escalamiento humano y reportes operativos.

**Fuera de alcance:**
- Postulación o inscripción transaccional a becas (no se modifica el flujo institucional existente).
- Reemplazo del equipo humano de soporte.
- Integración profunda con sistemas internos (CRM, LMS).

**Limitaciones:**
- Dependencia de proveedores externos (OpenAI, Twilio).
- La calidad de las respuestas depende de la cobertura del corpus documental.

## 7. Marco teórico (resumen)

- **Retrieval-Augmented Generation (RAG):** Lewis et al., 2020 — patrón que ancla la generación a un corpus recuperado.
- **Agentes de IA basados en LLM:** modelos que invocan herramientas externas (function calling) para tomar decisiones durante la conversación.
- **Recuperación híbrida:** combinación de búsqueda densa (embeddings) y recuperación jerárquica con re-ranking.
- **Bases de datos vectoriales:** Qdrant para indexación semántica.
- **Evaluación de RAG:** *faithfulness*, *answer relevance*, *context precision/recall* (Ragas y derivados).

## 8. Arquitectura de la solución

```
┌────────────────────────┐    ┌─────────────────────────┐
│  Widget Web (Next.js)  │    │   WhatsApp (Twilio)     │
└───────────┬────────────┘    └────────────┬────────────┘
            │                              │
            └──────────────┬───────────────┘
                           ▼
                ┌──────────────────────┐
                │  API (FastAPI)       │
                └──────────┬───────────┘
                           │
        ┌──────────────────┼─────────────────────┐
        ▼                  ▼                     ▼
  ┌──────────┐     ┌────────────────┐     ┌────────────────┐
  │ Auth /   │     │ Agente IA      │     │ Panel Admin    │
  │ Usuarios │     │ (LangChain +   │     │ (Next.js)      │
  │          │     │  LLM + tools)  │     │                │
  └────┬─────┘     └────────┬───────┘     └────────┬───────┘
       │                    │                      │
       │                    ▼                      │
       │          ┌─────────────────────┐          │
       │          │ Pipeline RAG        │          │
       │          │ (embeddings +       │          │
       │          │  retrieval          │          │
       │          │  jerárquico +       │          │
       │          │  re-ranking)        │          │
       │          └─────────┬───────────┘          │
       │                    │                      │
       ▼                    ▼                      ▼
  ┌──────────┐      ┌──────────────┐       ┌──────────────────┐
  │ MongoDB  │      │   Qdrant     │       │ Redis (cache,    │
  │ (datos)  │      │ (vectores)   │       │  rate limiting)  │
  └──────────┘      └──────────────┘       └──────────────────┘
```

### Herramientas del agente (tool use)

| Herramienta | Propósito |
|---|---|
| `retrieval_tool` | Buscar información en el corpus documental cuando la pregunta lo requiere. |
| `handoff_tool` | Escalar la conversación a un operador humano (caso fuera de alcance, urgencia, solicitud explícita). |

### Stack técnico (lo que está realmente implementado)

| Capa | Tecnología |
|---|---|
| Frontend | Next.js 14, TypeScript, TailwindCSS, shadcn/ui |
| Backend | FastAPI, Python 3.11, Pydantic |
| Orquestación IA | LangChain (core, community) |
| LLM | OpenAI (vía `langchain-openai`) |
| Vector DB | Qdrant |
| Base de datos | MongoDB (Motor / PyMongo) |
| Cache | Redis |
| Mensajería WhatsApp | Twilio |
| Email transaccional | Resend |
| Observabilidad | Sentry |
| Procesamiento PDF | PyPDF, PyMuPDF, PyMuPDF4LLM |
| Despliegue | Docker, Docker Compose |

## 9. Funcionalidades principales (lo que ya existe)

### Para el usuario final
- Chat web embebido.
- Chat por WhatsApp.
- Respuestas en lenguaje natural ancladas a documentos cargados.
- Escalamiento transparente a operador humano cuando corresponde.

### Para el operador de soporte
- Bandeja de conversaciones (`/admin/inbox`).
- Toma de control de conversaciones escaladas.
- Vista de contexto del usuario (lead sheet).

### Para el administrador
- Carga y gestión del corpus documental (PDFs).
- Configuración del comportamiento del agente.
- Dashboard de métricas operativas.
- Gestión de usuarios.
- Configuración de WhatsApp.

## 10. Indicadores de éxito propuestos

| Indicador | Línea base estimada | Meta |
|---|---|---|
| Tiempo medio de respuesta a consulta frecuente | 4–24 h | < 5 s |
| Cobertura horaria | Lun–Vie 9–18 h | 24/7 |
| Tasa de resolución sin escalamiento humano | — | ≥ 70 % |
| *Faithfulness* (Ragas) | — | ≥ 0.85 |
| Satisfacción del usuario (CSAT) | — | ≥ 4.2 / 5 |

## 11. Metodología

**Tipo:** investigación aplicada, enfoque cuantitativo y de desarrollo tecnológico.
**Diseño:** cuasi-experimental con medición pre / post implementación.
**Desarrollo:** Scrum adaptado, sprints de dos semanas.

**Fases:**
1. Levantamiento de requerimientos con la Fundación Romero.
2. Diseño arquitectónico.
3. Desarrollo iterativo del agente, panel y canales.
4. Carga del corpus documental.
5. Pruebas funcionales y evaluación de calidad.
6. Piloto y recolección de métricas.
7. Análisis de resultados.

## 12. Cronograma tentativo

| Mes | Actividad |
|---|---|
| 1 | Aprobación del plan de tesis |
| 2 | Levantamiento de requerimientos |
| 3–4 | Desarrollo del MVP |
| 5 | Integración WhatsApp y carga del corpus |
| 6 | Piloto con usuarios |
| 7 | Análisis de resultados |
| 8 | Redacción y sustentación |

## 13. Estructura del repositorio

```
Chatbot_Rag_final/
├── backend/              # API FastAPI
│   ├── api/              # Rutas REST y esquemas
│   ├── chat/             # Manejadores de conversación
│   ├── core/             # Bot, prompts, herramientas del agente
│   │   └── tools/        # retrieval_tool, handoff_tool
│   ├── rag/              # Ingesta, embeddings, recuperación jerárquica
│   ├── auth/             # Autenticación y permisos
│   ├── database/         # Repositorios MongoDB
│   └── tests/            # Pruebas unitarias e integración
├── frontend/             # Next.js
│   └── app/
│       ├── admin/        # Dashboard, inbox, conversaciones, usuarios
│       ├── chat/         # Cliente de chat
│       ├── widget/       # Widget embebible
│       └── whatsapp-settings/
├── docs/                 # Documentación técnica
├── DESIGN.md             # Sistema de diseño
├── PRODUCT.md            # Definición de producto
└── README.md             # Este documento
```

## 14. Brief para el asesor (versión corta)

**¿Qué se construye?**
Una aplicación web con un agente de IA conversacional, anclado a documentos de la organización vía RAG. Incluye panel administrativo, ingesta documental y canales web + WhatsApp.

**¿Para quién?**
Caso piloto: Fundación Romero — atención al usuario del programa Becas Grupo Romero (resolver dudas sobre becas, cursos, registro, certificación, soporte general). **No** se automatiza la postulación a becas.

**¿Qué problema resuelve?**
La Fundación atiende a más de 1.5 millones de personas y enfrenta volumen masivo de consultas repetitivas, en horario limitado y con información dispersa. Aleph automatiza la atención de estas consultas con respuestas trazables a documentos oficiales, 24/7, multicanal, con escalamiento humano cuando hace falta y con reportes operativos para la institución.

**¿Por qué es novedoso? (comparativa con alternativas)**

| Solución | Cómo decide qué responder | Limitación frente a Aleph |
|---|---|---|
| **ManyChat / Tidio / Landbot** | Flujo dibujado por humano (decision tree) | Cada pregunta nueva es trabajo manual. No entiende lenguaje libre. |
| **IBM Watson Assistant / Dialogflow / Rasa** | Clasificación de *intents* + plantillas | Requiere entrenar y mantener intents. Cada nuevo tema = nuevo etiquetado. No genera, selecciona. |
| **ChatGPT / Claude.ai abierto** | LLM solo, sin anclaje | Alucina. No conoce documentos privados de la institución. |
| **Intercom Fin / Zendesk Answer Bot** | LLM + RAG cerrado del proveedor | Caja negra. Vendor lock-in. Costos por resolución (~1 USD por consulta resuelta). Sin control sobre el pipeline ni sobre los datos. |
| **Aleph (este trabajo)** | LLM como cerebro + tools (`search_documents`, `request_human_handoff`) + RAG sobre corpus propio | Pipeline auditable, datos en infraestructura propia, métricas de calidad reproducibles, costo por consulta controlado. |

**Aporte concreto:**
- No es novedoso *por usar LLM o RAG* (existen desde 2020). Lo novedoso es la **composición** y la **aplicación al contexto peruano** de educación social: agente con tool use real, recuperación jerárquica con re-ranking, observabilidad operativa, multicanal y reportes de impacto, todo en una plataforma propia (no SaaS de terceros), aplicado a una organización con más de 1.5 millones de beneficiarios.
- Aporta evaluación cuantitativa de calidad (Ragas: *faithfulness*, *answer relevance*, *context precision/recall*) y métricas operativas reales (tiempo de respuesta, tasa de resolución sin escalamiento, costos por consulta).

**¿Qué aporta académicamente?**
Documenta una aplicación productiva de agentes RAG en el contexto peruano, con métricas de calidad y de impacto operativo.

**Estado actual:**
Funcional en desarrollo: backend, frontend, ingesta documental, panel administrativo, agente con tool use y canal WhatsApp ya implementados. Pendiente: piloto formal con la institución y recolección sistemática de métricas.

---

## Tests

### Frontend (Vitest + Playwright)

> **Pendiente:** instalar dependencias antes de correr por primera vez.

```bash
cd frontend
yarn add -D vitest @vitejs/plugin-react @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom
yarn add -D @playwright/test
npx playwright install chromium
```

| Comando | Qué corre |
|---|---|
| `yarn test` | Unit tests (Vitest) — 30 tests, sin servidor |
| `yarn test:watch` | Vitest en modo watch |
| `yarn test:e2e` | E2E Playwright — requiere `yarn dev` corriendo |

**Tests unitarios (`__tests__/`):**
- `inbox-utils.test.ts` — colorFromId, humanizeId, getInitials, getScoreTone, getScoreStyle, displayLabel, formatRelativeAgo, getMessageKey
- `register-validation.test.ts` — lógica de validación del formulario de registro (username, email, password, confirmPassword)

**Tests E2E (`e2e/`):**
- `auth.spec.ts` — login page carga, error en credenciales inválidas, redirect a login sin auth

### Backend (pytest)

```bash
cd backend
pytest --cov=. --cov-report=term-missing
```

Coverage mínimo: 65% (enforced en CI).

---

## Referencias preliminares

- Lewis, P. *et al.* (2020). *Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks*. NeurIPS.
- Fundación Romero. *Becas Grupo Romero*. https://www.becasgruporomero.pe/
- Fundación Romero. *Sobre nosotros*. https://fundacionromero.org.pe/
- OpenAI. *API Documentation*.
- Qdrant. *Vector Search Engine — Documentation*.
- LangChain. *Documentation*.
