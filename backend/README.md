- Backend en FastAPI, organizado por módulos ( api/ , auth/ , database/ , memory/ , models/ , common/ , utils/ , core/ ).
- Punto central de configuración en config.py , con flags y parámetros para servidor, seguridad, logging, modelo, RAG, cache, y directorios.
- Al iniciar, se genera un resumen del estado con utils/deploy_log.build_startup_summary() para validar configuración y componentes activos. Configuración

- config.py
  - Define Settings (Pydantic) que carga variables de entorno y parámetros: servidor ( host , port ), CORS, JWT, logging, modelo (tipo, temperatura, tokens), RAG (chunking, retrieval, vector store, embeddings), cache (in-memory/Redis).
  - get_settings() retorna una instancia global para uso en todo el backend.
- utils/deploy_log.py
  - build_startup_summary(settings, app, routes, flags) compone un resumen legible tras el arranque: entorno, logging, modelo, bot, componentes RAG, MongoDB, PDF manager, CORS, middleware de auth, rutas registradas y feature flags (cache, métricas, tracing).
- utils/logging_utils.py

  - \_MessageExclusionFilter para suprimir mensajes ruidosos.
  - suppress_cl100k_warnings() filtra agresivamente warnings sobre cl100k_base de tiktoken y langchain_openai . Autenticación

- auth/jwt_handler.py
  - JWTHandler(settings) maneja creación y verificación de tokens JWT con configuración de Settings .
  - create_access_token(data, expires_delta) y create_refresh_token(data, expires_delta) construyen tokens con exp , iat y type .
  - decode_token(token) valida y decodifica, con excepciones dedicadas: TokenExpiredError , InvalidTokenError , JWTError .
  - verify_token(token, token_type="access") asegura tipo y campos requeridos (por ejemplo sub ).
  - Funciones de conveniencia: create_access_token , create_refresh_token , verify_token , decode_token .
- auth/password_handler.py
  - PasswordHandler(rounds=12) para hashing y verificación con bcrypt .
  - hash_password(password) y verify_password(plain, hashed) con validaciones y manejo de errores seguro.
  - needs_update(hashed_password) detecta si el hash requiere rehash según rounds ( $2b$<rounds>$... ).
  - Alias: get_password_hash , password_needs_update .
- auth/password_handler_bcrypt.py
  - Variante directa con misma interfaz ( PasswordHandler ) centrada en bcrypt (duplicada/compat).
- auth/dependencies.py
  - Dependencias para FastAPI: get_current_user , get_current_active_user , require_admin , get_optional_current_user .
  - Usa HTTPBearer y verify_token para proteger endpoints; integra UserRepository para resolución de usuarios.
- auth/middleware.py
  - AuthenticationMiddleware protege rutas administrativas y deja públicas ciertas rutas (salud, auth, chat, docs).
  - Extrae Bearer del header y valida contra JWT; rutas protegidas: /api/v1/pdfs , /api/v1/rag , /api/v1/bot , /api/v1/users .
- auth/**init**.py

  - Re-exporta utilidades JWT, password y dependencias para import simple. Modelos y Esquemas

- models/auth.py
  - Pydantic para autenticación: LoginRequest , TokenResponse , RefreshTokenRequest , UserProfileResponse , AuthErrorResponse , PasswordChangeRequest , LogoutResponse .
  - Incluye ejemplos y validaciones de campos.
- models/user.py
  - Modelos de usuario: User (persistencia con PyObjectId ), UserCreate , UserLogin , UserResponse , UserUpdate .
  - Valida unicidad y formatos; separa input/persistencia/output.
- models/model_types.py
  - ModelTypes enum: OPENAI , VERTEX , LLAMA_CPP .
  - MODEL_TO_CLASS mapea a clases de Langchain ( ChatOpenAI , ChatVertexAI , LlamaCpp ) para instanciar el modelo configurado.
- api/schemas/config.py

  - Esquema de petición UpdateBotConfigRequest para actualizar configuración del bot (prompt, temperatura, ui_prompt_extra ) con validaciones. Base de Datos

- database/mongodb.py
  - MongodbClient encapsula la conexión MongoDB y operaciones de historial de chat (leer/agregar mensajes), garantiza índices, y formatea el historial de conversaciones.
- database/user_repository.py
  - UserRepository gestiona usuarios: crear, recuperar (por username, email, id), actualizar, desactivar, listar; asegura índices únicos en username y email .
- database/config_repository.py

  - BotConfig (prompt del sistema, temperatura, nombre del bot).
  - ConfigRepository para obtener, actualizar y resetear configuración del bot en MongoDB. Memoria de Conversación

- memory/base_memory.py
  - AbstractChatbotMemory : interfaz para agregar/recuperar/limpiar mensajes.
  - BaseChatbotMemory : implementación en memoria con window_size , contexto de sesión (usuario, tópicos, resumen) y formateo de historial.
- memory/mongo_memory.py
  - MongoChatbotMemory extiende BaseChatbotMemory con persistencia langchain_community.chat_message_histories.mongodb.MongoDBChatMessageHistory , derivando nombre de DB del URI.
- memory/custom_memory.py
  - CustomMongoChatbotMemory (basado en BaseChatMemory de Langchain) con \_CustomMongoPersistence asíncrono: índices, carga/guardado, limpieza y formateo compatible para el chatbot.
- memory/memory_types.py
  - MemoryTypes enum ( BASE_MEMORY , MONGO_MEMORY , CUSTOM_MEMORY ) y MEM_TO_CLASS para resolver la clase según configuración.
- memory/**init**.py

  - Expone clases y enums de memoria para import directo. Core (Cadena/Chatbot)

- core/chain.py

  - ChainManager construye y gestiona la cadena de conversación (modelo + memoria + RAG), usando parámetros de Settings como temperature y max_tokens .
  - Provee recarga de cadena al cambiar configuración del bot. RAG y Vector Store

- rag/retrieval/retriever.py
  - log_statistics registra métricas de rendimiento en procesos de retrieval (tiempos, documentos, etc.).
- utils/rag_fix/check_vector_store.py
  - Inspección del estado actual del Chroma VectorStore usando componentes del backend en modo lectura.
- utils/rag_fix/purge_pdf_from_rag.py
  - Purga embeddings de un PDF específico del VectorStore; opciones para borrar el archivo físico, dry_run , y generar reportes en Markdown/CSV.
- utils/rag_fix/clear_vector_store.py

  - Limpieza completa del VectorStore Chroma, confirmando estado antes y después. Cache y Métricas

- utils/chain_cache.py

  - ChatbotCache gestiona cache de respuestas (soporta InMemoryCache y RedisCache ), inicialización/limpieza y configuración.
  - CacheMetrics captura hits , misses , y tiempos de respuesta; logging de métricas para observabilidad.
  - Flags de características ( cache_enabled , métricas, tracing) integrados con Settings y el startup summary. API (Rutas)

- api/routes/chat/chat_routes.py
  - POST / (streaming) recibe ChatRequest ( input , conversation_id ) y devuelve StreamEventData ; valida bot activo; maneja errores JSON y Pydantic; incluye logging.
  - GET /export-conversations exporta todas las conversaciones a Excel ( pandas + xlsxwriter ), con formateo.
  - GET /stats estadísticas: total de queries, usuarios únicos (por conversation_id ), y total de PDFs en el sistema RAG.
- api/routes/bot/config_routes.py

  - Endpoints para obtener, actualizar y resetear configuración del bot; las actualizaciones se aplican en runtime a Settings y fuerza recarga del ChainManager . Comunes

- common/objects.py

  - Message y MessageTurn (Pydantic) para manejo de conversaciones; validación de roles ( user , assistant ).
  - Convención: conversation_id se usa como session_id para componentes de Langchain. Relaciones Clave

- Settings de config.py se inyecta en JWTHandler , ChainManager , RAG, cache y CORS.
- UserRepository y MongodbClient colaboran con auth/dependencies.py y auth/middleware.py para autorización y resolución de usuarios.
- memory/\* se selecciona por MemoryTypes y se integra en core/chain.py según config.
- utils/deploy_log.py consolida el estado de todos los componentes activos y sus flags al inicio. Notas Operativas

- Variables sensibles (JWT, Mongo URI, modelos) provienen de entorno y se validan en Settings .
- Endpoints administrativos se protegen vía middleware y dependencias; chat y salud quedan públicos.
- Herramientas RAG ( utils/rag_fix/\* ) son utilidades de mantenimiento fuera del flujo normal de API.
