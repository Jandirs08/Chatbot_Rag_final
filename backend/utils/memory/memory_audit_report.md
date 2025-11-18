# Auditoría Técnica del Sistema de Memoria del Chatbot

## Resumen ejecutivo

- El bot usa actualmente `BaseChatbotMemory` para construir el historial en los prompts (`backend/core/bot.py:166-190`, `backend/api/app.py:222-237`).
- Existen tres implementaciones declaradas: `BaseChatbotMemory`, `MongoChatbotMemory` y `CustomMongoChatbotMemory`.
- `MongoChatbotMemory` no es funcional con la clase base actual: pasa argumentos no soportados y referencia una configuración inexistente (`backend/memory/mongo_memory.py:12-31`).
- `CustomMongoChatbotMemory` implementa `LangChain` `BaseChatMemory` con persistencia propia en MongoDB, pero no implementa el contrato `AbstractChatbotMemory` que el bot invoca (`backend/memory/custom_memory.py:123-133`, `backend/core/bot.py:220-231`). No se usa en el flujo actual.
- Hay duplicación y riesgos: dos `MEM_TO_CLASS`, redefinición de `BaseChatbotMemory` en `memory_types.py`, inconsistencias de colecciones Mongo.
- Recomendación: mantener `BaseChatbotMemory` como opción estable y eliminar o refactorizar `MongoChatbotMemory`. Dejar `CustomMongoChatbotMemory` como experimental hasta integrarlo correctamente o retirarlo.

## Arquitectura actual

- Selección de memoria:
  - El tipo se decide en el arranque (`backend/api/app.py:222-237`) usando `MemoryTypes`; por defecto `BASE_MEMORY`.
  - El bot construye la instancia con `MEM_TO_CLASS` del paquete `memory` (`backend/core/bot.py:166-190`, `backend/memory/__init__.py:7-11`).
- Uso dentro del bot:
  - El pipeline LCEL solicita historial con `memory.get_history(conversation_id)` y lo formatea (`backend/core/bot.py:112-123`, `backend/core/bot.py:233-240`).
  - Al producir respuesta, añade mensajes con `memory.add_message(...)` (`backend/core/bot.py:220-231`).
- Persistencia fuera de “memoria”:
  - Independientemente, `ChatManager` guarda todos los mensajes en MongoDB (`backend/chat/manager.py:53-56`) usando `database.mongodb` (`backend/database/mongodb.py:79-89`).
  - La API expone historial desde Mongo (`backend/api/routes/chat/chat_routes.py:101-137`). Esto es paralelo al historial que el bot usa en sus prompts.

## Diagrama lógico (ASCII)

```
[Request] -> ChatManager -> Bot.__call__
                  |             |
                  |             +-> memory.get_history -> (formateo) -> prompt/model
                  |
                  |             +-> add_to_memory (in-memory)
                  |
                  +-> guardar en MongoDB (database.mongodb)

[API /history] -> lee de MongoDB (no del objeto memory)
```

## Memorias existentes y evaluación técnica

### BaseChatbotMemory

- Origen: `backend/memory/base_memory.py:55-219`. Implementa `AbstractChatbotMemory` (`backend/memory/base_memory.py:19-52`).
- Propósito: mantener ventana de mensajes en memoria RAM y enriquecer con un contexto derivado del texto del usuario.
- API: `add_message`, `get_history`, `clear_history`.
- Dependencias: estándar Python (`logging`, `datetime`, `re`).
- Almacenamiento: lista interna en proceso (`_message_history`) y diccionario de contexto (`_session_context`). No persistente.
- Ventajas:
  - Simple y funcional con el flujo actual del bot.
  - Sin dependencias externas.
- Desventajas:
  - Historial no persiste entre procesos; desconectado de Mongo.
  - Formato de contexto “system” generado puede ser acoplado a heurísticas específicas.
- Estado: EN USO REAL (por defecto y en error/fallback) (`backend/core/bot.py:166-190`).

### MongoChatbotMemory

- Origen: `backend/memory/mongo_memory.py:12-31`.
- Propósito declarado: memoria basada en Mongo usando `langchain_community.MongoDBChatMessageHistory`.
- API: hereda de `BaseChatbotMemory` (actualmente no compatible).
- Dependencias: `langchain_community`, MongoDB.
- Almacenamiento: intenta delegar en `MongoDBChatMessageHistory` mediante parámetros `chat_history_class` y `chat_history_kwargs`.
- Problemas técnicos:
  - `BaseChatbotMemory` actual no acepta ni usa `chat_history_class`/`chat_history_kwargs` → diseño inconsistente.
  - Usa `app_settings.memory_window_size` que no existe en `Settings` (`backend/memory/mongo_memory.py:14`; ver `backend/config.py:83-86`).
- Ventajas: n/a en estado actual.
- Desventajas: implementación rota con la arquitectura presente.
- Estado: NO USADA; INCOMPATIBLE.

### CustomMongoChatbotMemory

- Origen: `backend/memory/custom_memory.py:123-233`.
- Propósito: implementar `LangChain.BaseChatMemory` con persistencia en Mongo (motor async) mediante `_CustomMongoPersistence` (`backend/memory/custom_memory.py:16-52` y `61-120`).
- API: `aload_memory_variables`, `asave_context`, `aclear`, utilidades personalizadas (`get_buffer_string`, `add_message_custom`, `get_history_custom`).
- Dependencias: `langchain_core`, `langchain.memory`, `motor`, `pymongo`, `logging`.
- Almacenamiento: colección configurable `mongo_collection_name` (por defecto `chat_history`) separada de `database.mongodb.messages`.
- Problemas técnicos:
  - No implementa `add_message`/`get_history` que el bot invoca (`backend/core/bot.py:220-231`, `backend/core/bot.py:119-123`).
  - La importación desde `memory.__init__` fuerza cargar `motor`/`pymongo` aunque no se use.
  - Formato de documentos distinto al usado por `database.mongodb`.
- Ventajas:
  - Arquitectura orientada a `LangChain` memory con operaciones async.
- Desventajas:
  - No integrada con el pipeline actual; requeriría adaptar el bot y/o `ChainManager`.
- Estado: NO USADA; EXPERIMENTAL/INTEGRACIÓN PENDIENTE.

### Módulo memory_types

- Origen: `backend/memory/memory_types.py:1-24`.
- Contiene: `MemoryTypes` Enum y un `MEM_TO_CLASS` adicional.
- Problema: redefinición de `BaseChatbotMemory` dentro del módulo (`backend/memory/memory_types.py:21-24`) que puede confundir si alguien importa desde aquí.
- Duplicación: hay otro `MEM_TO_CLASS` en `backend/memory/__init__.py:7-11`. El bot usa el del paquete `memory` (no el de `memory_types`).

## Qué memorias están en uso real

- En arranque, la API usa `MemoryTypes.BASE_MEMORY` (`backend/api/app.py:222-237`).
- En construcción, el bot valida el tipo y cae a `BaseChatbotMemory` si no coincide (`backend/core/bot.py:170-174`).
- En fallo de instanciación, hay fallback explícito a `BaseChatbotMemory` (`backend/core/bot.py:182-190`).
- Conclusión: `BaseChatbotMemory` es la única memoria usada operativamente.

## Duplicación, conflictos y redundancias

- Dos diccionarios `MEM_TO_CLASS` (paquete y `memory_types.py`). Riesgo de divergencia.
- Redefinición de `BaseChatbotMemory` en `memory_types.py` (stub), potencial confusión de importadores.
- Dos mecanismos de persistencia en Mongo con esquemas distintos:
  - `database.mongodb.messages` (`backend/database/mongodb.py:79-89`).
  - `custom_memory` colección `mongo_collection_name` (`backend/memory/custom_memory.py:42-52`).
- `MongoChatbotMemory` intenta integrar `LangChain` chat history pero la base actual no lo soporta.

## Obsolescencia o desalineación

- `MongoChatbotMemory`: no encaja con la implementación actual de `BaseChatbotMemory` y referencia settings inexistentes.
- `CustomMongoChatbotMemory`: diseño alterno válido para `LangChain`, pero no acoplado al contrato que el bot usa; requiere re-arquitectura para ser útil.

## Riesgos de bugs por coexistencia

- Selección de memoria:
  - Si `settings.memory_type` apuntara a `MONGO_MEMORY` o `CUSTOM_MEMORY`, el bot fallaría en tiempo de ejecución por métodos faltantes o instanciación inconsistente.
- Importaciones pesadas:
  - Cargar `memory_types` desde `memory.__init__` arrastra `custom_memory` y sus dependencias.
- Inconsistencias de colección:
  - Historial del prompt vs. historial persistido pueden divergir (distintas colecciones y formatos).

## Imports circulares e inconsistencias

- Ciclo de importación fuerte pero no circular operativo: `memory.__init__` → `memory.memory_types` → `memory.custom_memory` → `memory.base_memory`.
- No se detecta bucle circular que impida importar, pero sí sobrecarga de dependencias.
- Inconsistencias:
  - `memory/mongo_memory.py:14` usa `memory_window_size` (inexistente). Debiera alinearse con `max_memory_entries` (`backend/config.py:83-86`).
  - Dos `MEM_TO_CLASS` y redefinición de clase en `memory_types.py`.

## Tabla comparativa

| Memoria | Origen | Guarda datos | Interfaz esperada por Bot | Dependencias | Uso actual | Ventajas | Desventajas | Estado |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| BaseChatbotMemory | `backend/memory/base_memory.py` | RAM (proceso) | `add_message`, `get_history`, `clear_history` | estándar | Sí | Simple, estable | No persistente; heurísticas propias | Estable |
| MongoChatbotMemory | `backend/memory/mongo_memory.py` | Mongo (pretendido) | Hereda de `BaseChatbotMemory` | `langchain_community` | No | Persistencia deseada | Incompatibilidad con clase base y settings | Rota |
| CustomMongoChatbotMemory | `backend/memory/custom_memory.py` | Mongo (`mongo_collection_name`) | `BaseChatMemory` (`aload_*`, `asave_*`) | `langchain`, `motor`, `pymongo` | No | Integración `LangChain` pura | No cumple contrato del bot; colecciones distintas | Experimental |

## Identificación de problemas

- Implementación rota de `MongoChatbotMemory` (`backend/memory/mongo_memory.py:12-31`).
- `CustomMongoChatbotMemory` no implementa el contrato que el bot usa (`backend/core/bot.py:119-123`, `backend/core/bot.py:220-231`).
- Duplicación del mapeo `MEM_TO_CLASS` y redefinición de clase en `memory_types.py` (`backend/memory/memory_types.py:14-18`, `backend/memory/memory_types.py:21-24`).
- Divergencia de almacenamiento entre `database.mongodb` y `custom_memory`.
- Riesgo de configuración inválida si se usa un tipo de memoria distinto a `BASE_MEMORY`.

## Sugerencias de mejora

- Consolidar el mapeo único `MEM_TO_CLASS` en `memory/__init__.py` y eliminar el duplicado de `memory_types.py`.
- Eliminar o reescribir `MongoChatbotMemory` para alinear con `BaseChatbotMemory` actual, o migrar toda la memoria del bot a un diseño `LangChain` si eso es un objetivo.
- Decidir una sola colección y esquema en Mongo para historial, alineando `ChatManager` y cualquier memoria persistente.
- Si se busca persistencia en prompts, integrar `database.mongodb.get_conversation_history` en `Bot.get_history_async` o adaptar `BaseChatbotMemory` para leer/escribir de Mongo.
- Minimizar dependencias innecesarias: evitar cargar `custom_memory` desde la ruta de importación principal si no se usa.
- Alinear `Settings.memory_type` con los valores del `Enum` o normalizar de forma consistente (hoy ya hay fallback correcto en el bot).

## Recomendación final

- Mantener `BaseChatbotMemory` como memoria activa y soporte principal.
- Deprecar y eliminar `MongoChatbotMemory` en su estado actual por incompatibilidad.
- Mantener `CustomMongoChatbotMemory` solo si existe un plan de integración con el pipeline (adaptar el bot/chain al contrato `BaseChatMemory`); de lo contrario, retirarla para reducir complejidad.
- Unificar mapeos y limpiar `memory_types.py` para evitar confusiones.

---

.

🧠 2. ¿Qué tipo de memoria lo resuelve?

🔥 BaseChatbotMemory, con un pequeño ajuste:

✔ Extraer preferencias simples

Ej: “no me gusta X”, “me interesa Y”

✔ Guardarlas SOLO para esta conversación/session_id ✔ Borrarse cuando la sesión termina o expira 🧠 3. ¿Qué NO necesitas?

❌ Guardar memoria en Mongo ❌ Persistencia entre días ❌ Memoria común entre todos los usuarios ❌ Colecciones nuevas ❌ RAG para memoria ❌ LangChain Memory persistente

Porque eso:

⚠ generaría riesgos de mezclar preferencias entre usuarios ⚠ aumentaría costos ⚠ complicaría el sistema ⚠ introduciría bugs

🧠 4. ¿Tu BaseChatbotMemory actual ya soporta eso?

SÍ, tiene:

extracción de temas

extracción de preferencias (likes, dislikes)

resumen de contexto

inyección en cada prompt

almacenamiento por session_id

Solo requiere revisar si deseas ampliar patrones o hacerla más precisa.

👉 Pero la arquitectura es EXACTA para tu caso.

🧠 5. ¿Puede tu bot morir si muchas personas usan esto?

NO. BaseChatbotMemory:

vive en memoria del proceso

usa max 5–10 mensajes por sesión

se resetea cuando la sesión cambia

es súper ligera

no guarda nada personal

Esto escala PERFECTAMENTE para cientos o miles de usuarios simultáneos.

(Tu bottleneck será el LLM, no la memoria.)

🧠 6. ¿Quieres evitar que el bot recomiende algo que el usuario dijo que NO le gusta?

Ya lo tienes casi todo.

Ejemplo: Usuario: “No me gusta Excel”

BaseChatbotMemory puede capturarlo como:

preferences: "no excel" likes: [] dislikes: ["excel"]

Luego, en el resumen del contexto, se inyecta:

El usuario mencionó que dislikes: excel

Y el modelo NO recomendará cursos de Excel porque el prompt contextual ya lo evita.

🧠 7. Respuesta final simple

✔ Lo que NECESITAS: Memoria contextual de sesión (BaseChatbotMemory).

✔ Lo que NO necesitas: Persistencia en Mongo, memorias rotas, duplicadas, ni sistemas avanzados.

✔ Tu bot NO va a morir con cientos de usuarios. El consumo de memoria será micro.

📌 ¿Quieres que generemos ahora una instrucción para Cursor que:

LIMPIE totalmente todo el sistema de memory

ELIMINE las memorias rotas

DOCUMENTE la memoria actual

OPTIMICE BaseChatbotMemory para preferencias como “no me gusta Excel”

DEJE una arquitectura limpia, estable y escalable
