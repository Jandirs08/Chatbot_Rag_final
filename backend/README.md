# Backend ChatBot RAG

## Descripción General

Este backend implementa una API REST para un chatbot con capacidades RAG (Retrieval-Augmented Generation), permitiendo interacción conversacional, gestión de documentos PDF, almacenamiento vectorial y recuperación de información avanzada.

---

## Requisitos

- Python 3.10+
- MongoDB (para historial de chat)
- (Opcional) Redis (para caché)
- Dependencias del proyecto (ver `requirements.txt`)

---

## Instalación y Ejecución

1. **Instala las dependencias:**
   ```bash
   pip install -r requirements.txt
   ```
2. **Configura las variables de entorno:**
   - Puedes usar un archivo `.env` en la carpeta `backend/` para definir claves como `OPENAI_API_KEY`, `MONGO_URI`, etc.
3. **Inicializa la base de datos si es necesario.**
4. **Ejecuta el backend:**
   ```bash
   uvicorn backend.api.app:create_app --factory --reload
   ```
   O usa los scripts `setup.sh` o `setup.bat` para entornos Linux/Windows.

---

## Endpoints Principales

- **/api/v1/health**: Estado de salud del backend.
- **/api/v1/chat/**: Endpoints para interacción conversacional.
- **/api/v1/pdfs/**: Subida, listado y borrado de PDFs.
- **/api/v1/rag/rag-status**: Estado del sistema RAG (PDFs y vector store).
- **/api/v1/rag/clear-rag**: Limpieza total de PDFs y vector store.
- **/api/v1/bot/**: Configuración y control del bot.

> Consulta los archivos en `backend/api/routes/` para ver todos los endpoints disponibles y sus detalles.

---

## Estructura de Carpetas y Archivos

```
backend/
├── api/                    # API REST y endpoints
│   ├── routes/            # Rutas de la API (chat, pdf, rag, health, bot)
│   ├── schemas/           # Esquemas Pydantic para validación
│   ├── app.py             # Configuración principal de FastAPI
│   └── __init__.py
│
├── core/                  # Núcleo del bot y lógica de procesamiento
│   ├── bot.py, chain.py, prompt.py, ...
│   └── README.md
│
├── rag/                   # Sistema RAG (Retrieval-Augmented Generation)
│   ├── ingestion/         # Procesamiento e ingesta de documentos
│   ├── embeddings/        # Gestión de embeddings
│   ├── pdf_processor/     # Procesamiento de PDFs
│   ├── vector_store/      # Almacenamiento vectorial (Chroma, etc.)
│   ├── retrieval/         # Recuperación de información
│   └── __init__.py
│
├── storage/               # Almacenamiento persistente
│   ├── documents/         # PDFs y documentos procesados
│   │   ├── pdfs/          # PDFs subidos
│   │   └── pdf_manager.py # Lógica de gestión de PDFs
│   └── vector_store/      # Base de datos vectorial (Chroma DB)
│
├── database/              # Conexión y lógica de base de datos (MongoDB)
│   └── mongodb.py
│
├── models/                # Modelos y tipos de datos
│   └── model_types.py
│
├── memory/                # Gestión de memoria conversacional
│   ├── base_memory.py, custom_memory.py, mongo_memory.py, ...
│
├── utils/                 # Utilidades generales (caché, helpers)
│   └── chain_cache.py
│
├── common/                # Código y constantes compartidas
│   └── constants.py, objects.py
│
├── dev/                   # Herramientas y scripts de desarrollo/pruebas
│   └── add_test_docs.py, performance_test.py, ...
│
├── config.py              # Configuración global y variables de entorno
├── main.py                # Punto de entrada principal
├── requirements.txt       # Dependencias del proyecto
├── setup.bat / setup.sh   # Scripts de instalación y arranque
├── Dockerfile             # Configuración para Docker
└── backend_structure.md   # Documentación de la estructura (referencia)
```

---

## Descripción de Carpetas y Archivos

- **api/**: Lógica de la API REST, rutas y validaciones.
- **core/**: Lógica principal del bot, gestión de prompts y cadenas de procesamiento.
- **rag/**: Todo lo relacionado con RAG (ingesta, embeddings, vector store, recuperación).
- **storage/**: PDFs y base de datos vectorial persistente.
- **database/**: Conexión y operaciones con MongoDB.
- **models/**: Tipos y modelos de datos usados en el sistema.
- **memory/**: Implementaciones de memoria conversacional (en memoria, MongoDB, etc.).
- **utils/**: Funciones utilitarias y caché.
- **common/**: Constantes y objetos compartidos.
- **dev/**: Scripts y utilidades para pruebas y desarrollo.
- **config.py**: Configuración global, variables de entorno y validaciones.
- **main.py**: Punto de entrada para ejecución directa.
- **requirements.txt**: Lista de dependencias Python.
- **setup.bat / setup.sh**: Scripts de instalación y arranque rápido.
- **Dockerfile**: Configuración para contenedores Docker.
- **backend_structure.md**: Referencia visual de la estructura del backend.

---

## Notas y Buenas Prácticas

- **No borres manualmente archivos de `storage/vector_store/chroma_db` si el sistema está en uso.** Hazlo solo con el backend detenido.
- Los archivos `__pycache__` y `.pyc` pueden eliminarse sin problema, Python los regenera automáticamente.
- La carpeta `backend/data/` es obsoleta si ya migraste a `storage/`.
- Usa el endpoint `/api/v1/rag/rag-status` para monitorear el estado del sistema y `/api/v1/rag/clear-rag` para limpiar datos.
- Configura correctamente tu archivo `.env` para evitar errores de conexión o autenticación.

---

## Contacto y Soporte

Para dudas, sugerencias o reportes, contacta al equipo de desarrollo o revisa la documentación interna del proyecto.

---

## Patrones de Diseño y Principios

- **Principio de Responsabilidad Única (SRP):** Cada módulo y clase tiene una única responsabilidad clara (por ejemplo, gestión de PDFs, embeddings, memoria, etc.).
- **Inyección de Dependencias:** Los componentes principales (como el vector store, gestor de PDFs, embeddings) se inyectan en los controladores y servicios, facilitando pruebas y mantenimiento.
- **Separación de Capas:** La lógica de negocio, acceso a datos, y API están claramente separadas en carpetas y módulos distintos.
- **Uso de Pydantic:** Para validación y serialización de datos en los endpoints.
- **Principio DRY (Don't Repeat Yourself):** Utilidades y funciones comunes están centralizadas en módulos como `utils/` y `common/`.
- **Asincronía:** Uso intensivo de async/await para operaciones de I/O, permitiendo alta concurrencia y eficiencia.

---

## Arquitectura y Componentes

El backend sigue una arquitectura **modular y desacoplada**, orientada a microservicios internos:

- **API Layer:** (Carpeta `api/`) Expone los endpoints REST y valida las peticiones/respuestas.
- **Core Layer:** (Carpeta `core/`) Lógica principal del bot y procesamiento de cadenas conversacionales.
- **RAG Layer:** (Carpeta `rag/`) Encapsula todo lo relacionado con la ingesta, procesamiento, embeddings y recuperación de información.
- **Storage Layer:** (Carpeta `storage/`) Persistencia de PDFs y base de datos vectorial.
- **Database Layer:** (Carpeta `database/`) Abstracción de la base de datos MongoDB.
- **Memory Layer:** (Carpeta `memory/`) Implementaciones de memoria conversacional.
- **Utils/Common:** Funciones utilitarias, constantes y objetos compartidos.

Cada componente es fácilmente intercambiable y testeable de forma aislada.

---

## Funcionalidades Principales

- **Chat conversacional:** Interacción con el usuario usando modelos LLM y memoria contextual.
- **RAG (Retrieval-Augmented Generation):** Recuperación de información relevante desde PDFs y base vectorial para enriquecer las respuestas.
- **Gestión de PDFs:** Subida, listado, procesamiento y borrado de documentos PDF.
- **Almacenamiento vectorial:** Indexación y búsqueda eficiente de fragmentos de texto usando embeddings.
- **Historial de chat:** Persistencia de conversaciones en MongoDB.
- **Caché:** Optimización de respuestas y reducción de latencia usando Redis o memoria local.
- **Endpoints de salud y administración:** Monitoreo y control del estado del sistema.

---

## Flujo de Datos

1. **Ingreso de datos:**
   - El usuario sube un PDF o envía un mensaje al chat.
2. **Procesamiento:**
   - Los PDFs se procesan, dividen en fragmentos y se generan embeddings.
   - Los fragmentos se almacenan en el vector store.
   - Los mensajes del chat se almacenan en la base de datos y/o memoria.
3. **Recuperación:**
   - Cuando el usuario hace una consulta, se buscan los fragmentos más relevantes en el vector store usando embeddings.
   - Se combinan los resultados recuperados con la respuesta generada por el modelo LLM.
4. **Respuesta:**
   - El sistema responde al usuario con información enriquecida y contextual.
5. **Administración:**
   - Los endpoints de administración permiten limpiar, monitorear y gestionar el sistema de forma sencilla.
