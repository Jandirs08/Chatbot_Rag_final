# 01 · Fase de Ingesta (Deep Dive)

Este documento analiza la fase de ingesta del RAG en el backend, trazando el flujo desde el upload del PDF hasta su persistencia en Qdrant. Referencias exactas de funciones, clases y variables de entorno se incluyen con ubicaciones de archivo y líneas aproximadas.

- Archivos analizados: `api/routes/pdf/pdf_routes.py`, `rag/ingestion/ingestor.py`, `rag/pdf_processor/pdf_loader.py`, `rag/embeddings/embedding_manager.py`, `rag/vector_store/vector_store.py`.
- Entorno: variables en `config.py` que afectan esta fase:
  - `MAX_FILE_SIZE_MB` → valida tamaño del archivo.
  - `RAG_CHUNK_SIZE`, `RAG_CHUNK_OVERLAP`, `MIN_CHUNK_LENGTH` → chunking.
  - `EMBEDDING_MODEL`, `EMBEDDING_BATCH_SIZE`, `DEFAULT_EMBEDDING_DIMENSION` → embeddings.
  - `ENABLE_CACHE`, `CACHE_TTL`, `CACHE_STORE_EMBEDDINGS` → caché.
  - `QDRANT_URL`, `QDRANT_API_KEY`, `DEFAULT_EMBEDDING_DIMENSION` → vector store.

## Entrada: Request `/upload`
- Ubicación: `api/routes/pdf/pdf_routes.py` líneas ~1–60.
- Endpoint: `@router.post("/upload", response_model=PDFUploadResponse)`.
- Firma: `async def upload_pdf(request: Request, file: UploadFile = File(...))`.
- Tipo de request: `multipart/form-data` con campo `file` (FastAPI `UploadFile`).
- Flujo básico:
  - Lee el archivo en chunks para medir tamaño (líneas ~25–35).
  - Restablece puntero con `await file.seek(0)` (línea ~37).
  - Guarda físicamente el PDF vía `pdf_file_manager.save_pdf(file)` (línea ~40).
  - Llama ingesta: `rag_ingestor.ingest_single_pdf(file_path)` (línea ~43).
  - Si ingesta marca `skipped` (duplicado), borra el PDF recientemente guardado y retorna 409 (líneas ~45–58).

## Validación: `MAX_FILE_SIZE_MB`
- Ubicación: `pdf_routes.py` líneas ~25–35.
- Lógica:
  - Lee el archivo en chunks de `chunk_size = 1024 * 1024` bytes.
  - Acumula `file_size` y compara contra `request.app.state.settings.max_file_size_mb * 1024 * 1024`.
  - Si excede, levanta `HTTPException(413, detail=f"Archivo excede el tamaño máximo permitido de {max_file_size_mb}MB")`.
- Variable de entorno: `MAX_FILE_SIZE_MB` (mapeada a `settings.max_file_size_mb` por `validation_alias` en `config.py` líneas ~60–90).

## Procesamiento: PDF → Chunks

### Carga y split (PDFContentLoader)
- Ubicación: `rag/pdf_processor/pdf_loader.py`.
- Clase: `PDFContentLoader` (líneas ~15–48).
- Inicialización:
  - Usa `RAG_CHUNK_SIZE` → `settings.chunk_size`.
  - Usa `RAG_CHUNK_OVERLAP` → `settings.chunk_overlap`.
  - Usa `MIN_CHUNK_LENGTH` → `settings.min_chunk_length`.
  - Construye `RecursiveCharacterTextSplitter` con `separators` seguros y `length_function=len` (líneas ~32–48).
- Librería: `langchain_community.document_loaders.PyPDFLoader` (línea ~12).
- Método: `load_and_split_pdf(pdf_path: Path) -> List[Document]` (líneas ~52–91).
  - Carga páginas: `PyPDFLoader(str(pdf_path)).load()` (líneas ~59–64).
  - Preprocesa: `_preprocess_documents` (líneas ~93–106).
  - Split: `self.text_splitter.split_documents(processed_docs)` (líneas ~73–80).
  - Postprocesa: `_postprocess_chunks(chunks, pdf_path)` (líneas ~81–91).

### Preprocesamiento no destructivo
- Método: `_clean_text(text: str) -> str` (líneas ~107–118).
  - Conserva saltos de línea y tabs.
  - Elimina caracteres no imprimibles.
  - No colapsa saltos de línea; solo `rstrip` por línea.

### Postprocesamiento: enriquecimiento de metadata
- Método: `_postprocess_chunks` (líneas ~120–166).
- Metadata anexada por chunk:
  - `source`: nombre de archivo PDF (línea ~145).
  - `file_path`: ruta absoluta (línea ~146).
  - `chunk_type`: clasificación por contenido (`numbered_list`, `bullet_list`, `text`) (líneas ~143–144, ~184–190).
  - `content_hash`: `md5` de contenido normalizado (líneas ~147, ~191–193).
  - `quality_score`: score heurístico (líneas ~141, ~168–183).
  - `word_count`, `char_count`: conteos básicos (líneas ~148–149).
  - `page_number`: índice humano (1-based) si disponible (líneas ~132–140, ~150).

## Embeddings

### Gestor de embeddings (EmbeddingManager)
- Ubicación: `rag/embeddings/embedding_manager.py`.
- Clase: `EmbeddingManager` (líneas ~14–44).
- Modelo:
  - Usa `langchain_openai.OpenAIEmbeddings` con `model` derivado de `EMBEDDING_MODEL` (prefijo `openai:`). Si no se especifica prefijo, fuerza `text-embedding-3-small` (líneas ~22–43).
- Dimensión:
  - `DEFAULT_EMBEDDING_DIMENSION` → `settings.default_embedding_dimension` (por defecto 1536) (líneas ~66–76, ~140–154, ~173–193).
- Normalización de texto:
  - Documentos: reemplaza textos cortos por `"placeholder_text"` para evitar zeros (líneas ~66–76).
  - Query: usa hash normalizado lower/strip para caché (líneas ~46–54, ~156–165).
- Caché de embeddings:
  - Claves:
    - Documentos: `emb:doc:{self.model_name}:{sha256(norm_text)}` (líneas ~76–105, ~131–153).
    - Query: `emb:query:{self.model_name}:{sha256(norm_query)}` (líneas ~156–170).
  - Almacenamiento: `cache.set(key, embedding, cache.ttl)` condicionado por `ENABLE_CACHE` y `CACHE_TTL` (ver `cache.manager`).
  - Validaciones: garantiza longitud igual a `DEFAULT_EMBEDDING_DIMENSION`; si falla, rellena con `[0.0] * dim` (líneas ~105–154, ~173–193).

### Batch embeddings en ingesta
- `RAGIngestor.ingest_single_pdf` computa embeddings en lote para `texts = [c.page_content for c in chunks]` (líneas ~86–93 en `rag/ingestion/ingestor.py`).

## Vector Store: Qdrant

### Ingesta en Qdrant (`VectorStore.add_documents`)
- Ubicación: `rag/vector_store/vector_store.py`.
- Método: `async def add_documents(documents: List[Document], embeddings: list = None)` (líneas ~134–209).
- Payload exacto por punto:
  - `payload = { **doc.metadata, "text": doc.page_content }` (líneas ~172–187).
  - `PointStruct(id=uuid4, vector=vec, payload=payload)` (líneas ~187–191).
  - Upsert: `self.client.upsert(collection_name="rag_collection", points=points, wait=True)` (líneas ~194–202).
  - Nota: el embedding ya no se almacena en el `payload` para ahorrar espacio; se pasa como `vector` en `PointStruct` y solo se recupera cuando es necesario usando `with_vectors=True` (por ejemplo, en MMR).
- Índices de payload asegurados (para filtros de metadata): `source`, `pdf_hash`, `content_hash` (líneas ~99–130).

### Detección de duplicados por `pdf_hash`
- Ubicación: `rag/ingestion/ingestor.py`.
- Cálculo de hash de archivo:
  - `_get_pdf_file_hash(pdf_path)` lectura incremental y `md5.hexdigest()` (líneas ~33–45).
- Chequeo en Qdrant:
  - `_is_already_processed_pdf_hash(pdf_hash)` construye `QFilter(must=[FieldCondition(key="pdf_hash", match=MatchValue(value=pdf_hash))])` y ejecuta `client.count("rag_collection", count_filter=f)` (líneas ~47–57).
- Uso en ingesta principal:
  - En `ingest_single_pdf`:
    - Si duplicado y no `force_update`, retorna `{"status": "skipped"}` (líneas ~72–80).
    - Anexa `pdf_hash` a cada chunk antes de subir (líneas ~86–90).
    - En `force_update=True`, primero borra vectores del mismo `pdf_hash` con `vector_store.delete_by_pdf_hash(pdf_hash)` (líneas ~80–86).

### Transformaciones de datos: PDF → Texto → Chunk → Vector
- PDF: leído con `PyPDFLoader` a `List[Document]` por página.
- Texto: preprocesado con `_clean_text` conservando estructura.
- Chunk: `RecursiveCharacterTextSplitter` produce `Document` con metadatos enriquecidos (`source`, `file_path`, `chunk_type`, `content_hash`, `quality_score`, `word_count`, `char_count`, `page_number`).
- Vector: `EmbeddingManager.embed_documents` genera `List[List[float]]` consistente en dimensión; se inserta en Qdrant como `vector` del `PointStruct`. El `payload` no incluye el embedding.

---

## Resumen de puntos críticos para debugging
- Verifique `MAX_FILE_SIZE_MB` en `settings` cuando el upload falla por tamaño.
- Inspeccione `content_hash` y `pdf_hash` en `payload` para confirmar duplicados y agrupación.
- Asegure que `DEFAULT_EMBEDDING_DIMENSION` coincide con la configuración en Qdrant (`VectorParams(size=dim, distance=Distance.COSINE)` en inicialización, líneas ~61–95).
- Si faltan `page_number`, revise logs `[ALERTA] Chunk sin número de página...` (líneas ~132–140) para diagnosticar loader.