2026-04-30 10:32:12.032 | 2026-04-30 15:32:12 | INFO:cache.manager:CacheManager: Redis PING OK
2026-04-30 10:32:12.041 | 2026-04-30 15:32:12 | INFO:cache.manager:CacheManager: Redis conectado correctamente (usando RedisCache).
2026-04-30 10:32:12.338 | 2026-04-30 15:32:12 | INFO:utils.rate_limiter:Rate limiter using shared storage: redis
2026-04-30 10:32:15.166 | 2026-04-30 15:32:15 | INFO:api.app:Creando instancia de FastAPI...
2026-04-30 10:32:15.166 | 2026-04-30 15:32:15 | INFO:api.app:
2026-04-30 10:32:15.166 | --------------------------------------------------------------------
2026-04-30 10:32:15.166 |   FASTAPI BACKEND INITIALIZED | Version 1.0.0 | Env: development
2026-04-30 10:32:15.166 | --------------------------------------------------------------------
2026-04-30 10:32:15.166 | 2026-04-30 15:32:15 | INFO:api.app:CORS Origins configurados: ['http://localhost:3000', 'http://localhost:8000']
2026-04-30 10:32:15.166 | 2026-04-30 15:32:15 | DEBUG:api.app:CORS Widget Origins: ['http://localhost:3000']
2026-04-30 10:32:15.166 | 2026-04-30 15:32:15 | DEBUG:api.app:CORS Admin Origins: ['http://localhost:3000']
2026-04-30 10:32:15.166 | 2026-04-30 15:32:15 | DEBUG:api.app:CORS Max Age: 3600
2026-04-30 10:32:15.166 | 2026-04-30 15:32:15 | DEBUG:api.app:CORS configurado para orígenes: ['http://localhost:3000', 'http://localhost:8000']
2026-04-30 10:32:15.166 | 2026-04-30 15:32:15 | INFO:api.app:Middleware de autenticación configurado.
2026-04-30 10:32:15.218 | 2026-04-30 15:32:15 | INFO:api.app:Routers registrados.
2026-04-30 10:32:15.218 | 2026-04-30 15:32:15 | INFO:api.app:Aplicación FastAPI creada y configurada exitosamente.
2026-04-30 10:32:15.218 | INFO:     Started server process [8]
2026-04-30 10:32:15.218 | INFO:     Waiting for application startup.
2026-04-30 10:32:15.218 | 2026-04-30 15:32:15 | DEBUG:api.app:Iniciando aplicación...
2026-04-30 10:32:15.218 | 2026-04-30 15:32:15 | INFO:api.app:SIMILARITY_THRESHOLD=0.25
2026-04-30 10:32:15.218 | 2026-04-30 15:32:15 | INFO:api.app:Cache activo: backend=RedisCache, ttl=300, max_size=1000
2026-04-30 10:32:15.218 | 2026-04-30 15:32:15 | INFO:database.mongodb:Creating new MongoDB client instance (singleton)...
2026-04-30 10:32:15.233 | 2026-04-30 15:32:15 | INFO:database.mongodb:MongoDB connection to db 'chatbot_rag_db' established successfully.
2026-04-30 10:32:15.233 | 2026-04-30 15:32:15 | INFO:database.mongodb:✅ MongoDB client singleton created successfully.
2026-04-30 10:32:15.234 | 2026-04-30 15:32:15 | INFO:api.app:Config dinámica aplicada: temperature=0.2
2026-04-30 10:32:15.244 | 2026-04-30 15:32:15 | INFO:EmbeddingManager:Usando OpenAIEmbeddings: text-embedding-3-small (batch_size interno=100)
2026-04-30 10:32:15.431 | 2026-04-30 15:32:15 | INFO:rag.vector_store.vector_store:Colección 'rag_child_chunks' ya existe.
2026-04-30 10:32:15.564 | 2026-04-30 15:32:15 | INFO:rag.vector_store.vector_store:VectorStore inicializado | strategy=cosine | cache_enabled=True | similarity_threshold=0.25
2026-04-30 10:32:15.564 | 2026-04-30 15:32:15 | DEBUG:api.app:VectorStore inicializado (Qdrant)
2026-04-30 10:32:15.566 | 2026-04-30 15:32:15 | DEBUG:EmbeddingManager:Cache HIT embedding consulta
2026-04-30 10:32:15.567 | 2026-04-30 15:32:15 | INFO:api.app:✅ Ping Embeddings: OK
2026-04-30 10:32:15.587 | 2026-04-30 15:32:15 | INFO:ChatbotCache:CacheManager activo; tipo preferido: rediscache
2026-04-30 10:32:15.599 | 2026-04-30 15:32:15 | INFO:ChainManager:Bound 2 tool(s) to model: ['request_human_handoff', 'search_documents']
2026-04-30 10:32:15.599 | 2026-04-30 15:32:15 | INFO:api.app:Instancia de Bot creada con tipo de memoria: MemoryTypes.BASE_MEMORY
2026-04-30 10:32:15.599 | 2026-04-30 15:32:15 | DEBUG:chat.manager:[DB] ChatManager inicializado | client_id=132693432544336
2026-04-30 10:32:15.599 | 2026-04-30 15:32:15 | INFO:api.app:ChatManager inicializado.
2026-04-30 10:32:15.599 | 2026-04-30 15:32:15 | INFO:api.app:Initializing persistent MongoDB client for application lifespan...
2026-04-30 10:32:15.606 | 2026-04-30 15:32:15 | INFO:database.mongodb:✅ Índices MongoDB aplicados correctamente
2026-04-30 10:32:15.607 | 2026-04-30 15:32:15 | DEBUG:api.app:[DB] MongoDB client id=132693432544336
2026-04-30 10:32:15.608 | 2026-04-30 15:32:15 | INFO:database.mongodb:✅ Índices de usuarios aplicados correctamente
2026-04-30 10:32:15.762 | 2026-04-30 15:32:15 | INFO:rag.retrieval.retriever:RAGRetriever initialized with normalize -> cheap gate -> cache -> single embedding -> retrieval
2026-04-30 10:32:15.763 | 2026-04-30 15:32:15 | INFO:api.app:🚀 Persistent MongoDB client initialized and indexes created successfully
2026-04-30 10:32:15.763 | 2026-04-30 15:32:15 | DEBUG:database.user_repository:Usando cliente MongoDB global en get_user_repository
2026-04-30 10:32:15.763 | 2026-04-30 15:32:15 | INFO:api.app:AuthDependencies inicializado correctamente en app.state.
2026-04-30 10:32:15.763 | 2026-04-30 15:32:15 | INFO:api.app:
2026-04-30 10:32:15.763 | 
2026-04-30 10:32:15.763 | ────────────────────────────────────────────────────────────
2026-04-30 10:32:15.763 |   🚀 BACKEND READY
2026-04-30 10:32:15.763 | ────────────────────────────────────────────────────────────
2026-04-30 10:32:15.763 |   ✓ Env: development | Log: DEBUG
2026-04-30 10:32:15.763 |   ✓ Model: OPENAI / gpt-4o-mini
2026-04-30 10:32:15.763 |   ✓ Embeddings: openai:text-embedding-3-small
2026-04-30 10:32:15.763 |   ✓ VectorStore: OK
2026-04-30 10:32:15.763 |   ✓ RAG: LCEL | Retriever: OK
2026-04-30 10:32:15.763 |   ✓ MongoDB: connected
2026-04-30 10:32:15.763 |   ✓ Cache: ON
2026-04-30 10:32:15.763 |   ✓ Routes: 57 | PDFs: /app/storage/documents/pdfs
2026-04-30 10:32:15.763 | ────────────────────────────────────────────────────────────
2026-04-30 10:32:15.763 | 
2026-04-30 10:32:15.763 | INFO:     Application startup complete.
2026-04-30 10:32:23.780 | 2026-04-30 15:32:23 | DEBUG:database.config_repository:[28e00f00] Initializing ConfigRepository and using global MongoDB client.
2026-04-30 10:32:23.781 | 2026-04-30 15:32:23 | INFO:api.app:GET /api/v1/bot/config -> 200 in 17ms
2026-04-30 10:32:24.038 | 2026-04-30 15:32:24 | DEBUG:database.config_repository:[5e2e39e0] Initializing ConfigRepository and using global MongoDB client.
2026-04-30 10:32:26.348 | 2026-04-30 15:32:26 | INFO:api.routes.chat.chat_routes:[96c66667] [CHAT] Request: 'Holaa...' conv=7ef79185-d797-4f92-90f4-bdd4c79ea6f7
2026-04-30 10:32:26.351 | 2026-04-30 15:32:26 | DEBUG:api.routes.chat.chat_routes:[96c66667] [CHAT] Agentic stream start | conv=7ef79185-d797-4f92-90f4-bdd4c79ea6f7
2026-04-30 10:32:26.351 | 2026-04-30 15:32:26 | INFO:api.app:POST /api/v1/chat/ -> 200 in 46ms
2026-04-30 10:32:26.372 | 2026-04-30 15:32:26 | DEBUG:Bot:[96c66667] [HISTORY] Cargado | msgs=2 conv=7ef79185-d797-4f92-90f4-bdd4c79ea6f7
2026-04-30 10:32:27.841 | 2026-04-30 15:32:27 | DEBUG:database.mongodb:[96c66667] Mensaje agregado a la conversación 7ef79185-d797-4f92-90f4-bdd4c79ea6f7
2026-04-30 10:32:27.842 | 2026-04-30 15:32:27 | DEBUG:database.mongodb:[96c66667] Mensaje agregado a la conversación 7ef79185-d797-4f92-90f4-bdd4c79ea6f7
2026-04-30 10:32:27.843 | 2026-04-30 15:32:27 | INFO:chat.debug:[96c66667] [CHAT][PERF] conv=7ef79185-d797-4f92-90f4-bdd4c79ea6f7 cached=0 history_ms=- embedding_ms=- dense_ms=- lexical_ms=- hydrate_ms=- rerank_ms=- first_token_ms=1217.5 rag_ms=- llm_ms=1492.1 stream_total_ms=1492.1