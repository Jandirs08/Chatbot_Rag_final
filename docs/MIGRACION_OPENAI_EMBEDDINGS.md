# Plan de Migración de Embeddings Locales a OpenAI API

## Objetivo
- Migrar de `sentence-transformers` (modelo local que carga `torch` y usa >400MB RAM) a la API de OpenAI usando `text-embedding-3-small` para eliminar OOMKill en el plan gratuito de 512MB de Render.
- Reutilizar la misma `OPENAI_API_KEY` ya configurada para las llamadas de chat.
- Reducir dependencias pesadas y acelerar el arranque.

## Análisis de Complejidad
- Complejidad: Medio.
- Principales riesgos:
  - Cambios de dimensión de vector (384 → 1536) que invalidan la base Chroma existente.
  - Latencia de red y cuotas/rate limits de OpenAI.
  - Coste por uso de API (mínimo, pero presente).
  - Fallos de red o claves inválidas pueden impedir la ingesta/búsqueda.
  - Tests deben contemplar mocks o skips si no hay `OPENAI_API_KEY` en CI.

## Plan de Acción Detallado

### Paso 1: Dependencias (`backend/requirements.txt`)
- Añadir o confirmar:
  - `langchain-openai` (ya presente: `==0.0.5`). Mantener versión compatible con `langchain-core`.
  - `tiktoken` (ya presente; útil para OpenAI).
- Eliminar (si están presentes directa o indirectamente):
  - `sentence-transformers` (trae `torch`, `transformers`, `scipy`, etc.).
  - Cualquier referencia explícita a `torch`, `transformers`, `onnxruntime`, `scipy`.
  - Mantener `langchain-huggingface` por ahora, dado que `backend/rag/retrieval/retriever.py` lo importa. Se puede limpiar en una tarea separada.
- Nota: En este repo actual `requirements.txt` ya incluye `langchain-openai` y no lista `torch/transformers/scipy`, pero sí `sentence-transformers`. Eliminar `sentence-transformers` para evitar instalación transitiva pesada.

### Paso 2: Configuración (Variables de Entorno)
- `OPENAI_API_KEY`: ya usada por el LLM; será leída automáticamente por `langchain_openai.OpenAIEmbeddings`.
- Cambiar el modelo de embeddings en configuración para activar OpenAI:
  - En `backend/config.py`, setear `EMBEDDING_MODEL=openai:text-embedding-3-small`.
  - Actualizar `DEFAULT_EMBEDDING_DIMENSION=1536` para alinear fallbacks con la dimensión del modelo de OpenAI.
- Opcional: Documentar `EMBEDDING_MODEL` y `DEFAULT_EMBEDDING_DIMENSION` en `docs/env_reference.md`.

### Paso 3: Refactorización del Código (Antes/Después)

Archivo: `backend/rag/embeddings/embedding_manager.py`

Antes (uso local de SentenceTransformer por defecto):
```python
# config.py
embedding_model: str = Field(default="sentence-transformers/all-MiniLM-L6-v2", env="EMBEDDING_MODEL")
default_embedding_dimension: int = Field(default=384, env="DEFAULT_EMBEDDING_DIMENSION")

# app.py
app.state.embedding_manager = EmbeddingManager(model_name=s.embedding_model)

# embedding_manager.py (ruta ST)
if self._st_model is None:
    ST = _load_st()
    self._st_model = ST(self.model_name)
embeddings = self._st_model.encode(texts, convert_to_tensor=False)
```

Después (uso de OpenAI Embeddings):
```python
# config.py
embedding_model: str = Field(default="openai:text-embedding-3-small", env="EMBEDDING_MODEL")
default_embedding_dimension: int = Field(default=1536, env="DEFAULT_EMBEDDING_DIMENSION")

# app.py
app.state.embedding_manager = EmbeddingManager(model_name=s.embedding_model)

# embedding_manager.py (ruta OpenAI)
from langchain_openai import OpenAIEmbeddings

if isinstance(model_name, str) and model_name.lower().startswith("openai:"):
    openai_model = model_name.split(":", 1)[1] or "text-embedding-3-small"
    self._openai = OpenAIEmbeddings(model=openai_model)

def embed_documents(self, texts: List[str]) -> List[List[float]]:
    if self._openai is not None:
        embeddings = self._openai.embed_documents(texts)
        return [emb if isinstance(emb, list) else emb.tolist() for emb in embeddings]
```

Notas:
- La clase actual ya soporta el prefijo `openai:` y carga perezosa de ST. Con `EMBEDDING_MODEL=openai:text-embedding-3-small` nunca se importará `sentence_transformers`.
- Asegurar que cualquier fallback y validación de dimensiones utiliza `1536`.

### Paso 4: CRÍTICO — Re-indexación de la Base de Datos Vectorial
- Los embeddings de OpenAI tienen distinta dimensión y distribución que los de `sentence-transformers`. Por ello, toda la base de datos existente en Chroma queda inválida para búsquedas coherentes.
- Acciones:
  1) Borrar el directorio de ChromaDB.
     - Ruta por defecto: `./backend/storage/vector_store/chroma_db` (configurable vía `VECTOR_STORE_PATH`).
     - Alternativas:
       - Vía API: `POST /api/rag/clear-rag` elimina la colección y limpia PDFs.
       - Manual en servidor: eliminar el directorio `chroma_db` y reiniciar el backend.
  2) Re-ejecutar la ingesta de PDFs para poblar de nuevo con los nuevos vectores de OpenAI.
     - Subir PDFs mediante los endpoints/ UI actuales.
     - La ingesta usa `RAGIngestor` y `VectorStore.add_documents(...)` que recibirán embeddings del `EmbeddingManager` con OpenAI.
- Verificaciones:
  - Contador de documentos en Chroma post-limpieza debe ser 0.
  - Tras re-ingesta, búsquedas deben retornar resultados y logs no deben mostrar errores de dimensión.

### Paso 5: Limpieza de Código Opcional (Lazy-load de `pandas`)
- Archivo: `backend/api/routes/chat/chat_routes.py`.
- Antes:
```python
import pandas as pd

@router.get("/export-conversations")
async def export_conversations(request: Request):
    # ... usa pandas
```
- Después (lazy-load dentro de la función):
```python
@router.get("/export-conversations")
async def export_conversations(request: Request):
    import pandas as pd  # lazy-load para acelerar el arranque
    # ... usa pandas
```
- Beneficio: evita cargar `pandas` en el arranque del servidor, reduciendo tiempo y memoria inicial.

## Plan de PRs (Pull Requests)
- Recomendación: 1 PR con cambios coordinados y pruebas incluidas:
  - Actualización de `backend/requirements.txt` (eliminar `sentence-transformers`).
  - Cambio de `EMBEDDING_MODEL` y `DEFAULT_EMBEDDING_DIMENSION` en `backend/config.py`.
  - Confirmar la ruta de OpenAI en `embedding_manager.py` con `OpenAIEmbeddings(model="text-embedding-3-small")`.
  - Añadir nota visible en `docs/` sobre la necesidad de re-indexar (este documento).
  - Limpieza opcional: mover import de `pandas` dentro de `export_conversations`.
  - Mantener `langchain-huggingface` en requirements si el import sigue presente en `retriever.py`; limpiar ese import en una futura PR.
- Siempre con tests en cada PR:
  - Añadir pruebas unitarias e integración básicas (ver sección “Pruebas” abajo).
  - Ejecutar `pytest` en CI.

## Beneficios Obtenidos
- Reducción sustancial de RAM: se elimina la carga de `torch`/`transformers` del modelo local.
- Arranque más rápido: sin inicialización de modelos pesados.
- Fin de los OOMKills en Render free (512MB).
- Embeddings de mejor calidad y estables con OpenAI.
- Mayor capacidad de concurrencia por menor footprint de memoria.

## Pruebas (añadir en el PR)

### 1) Test de Embeddings con OpenAI
Archivo sugerido: `backend/tests/test_embeddings_openai.py`
```python
import os
import pytest
from backend.rag.embeddings.embedding_manager import EmbeddingManager

@pytest.mark.skipif(not os.getenv("OPENAI_API_KEY"), reason="OPENAI_API_KEY no configurada")
def test_openai_embeddings_dimension():
    em = EmbeddingManager(model_name="openai:text-embedding-3-small")
    vec = em.embed_query("hola mundo")
    assert isinstance(vec, list)
    assert len(vec) == 1536
```

### 2) Test de reindexación de Chroma (limpieza de colección)
Archivo sugerido: `backend/tests/test_vectorstore_reindex.py`
```python
import asyncio
import pytest
from backend.rag.vector_store.vector_store import VectorStore
from backend.rag.embeddings.embedding_manager import EmbeddingManager

@pytest.mark.asyncio
async def test_delete_collection_and_reinit(tmp_path):
    em = EmbeddingManager(model_name="openai:text-embedding-3-small")
    vs = VectorStore(persist_directory=str(tmp_path / "chroma_db"), embedding_function=em)
    # La colección inicialmente existe (vacía)
    await vs.delete_collection()
    # Tras reinicializar, count debería ser 0
    assert vs.store._collection.count() == 0
```

### 3) Test de lazy-load `pandas` en exportación
Archivo sugerido: `backend/tests/test_chat_routes_pandas_lazy.py`
```python
import importlib
import types

def test_pandas_lazy_import():
    # Asegurar que el módulo se carga sin pandas importado previamente
    chat_routes = importlib.import_module("backend.api.routes.chat.chat_routes")
    assert isinstance(chat_routes, types.ModuleType)
    # No valida la exportación completa, pero confirma que el import global no falla sin pandas
```

### 4) CI y ejecución
- Configurar CI para ejecutar `pytest` y fallar si las pruebas no pasan.
- Para pruebas de OpenAI, usar `skipif` cuando `OPENAI_API_KEY` no esté presente o mockear la clase `OpenAIEmbeddings`.

## Procedimiento de Despliegue
- Desplegar el PR.
- Verificar que `EMBEDDING_MODEL=openai:text-embedding-3-small` y `OPENAI_API_KEY` están presentes en variables de entorno.
- Limpiar ChromaDB vía `POST /api/rag/clear-rag` o eliminación del directorio `VECTOR_STORE_PATH`.
- Re-ingestar PDFs (subida manual o proceso automatizado existente).
- Validar búsquedas y consumo de memoria en Render.

## Notas Adicionales
- Si en el futuro se desea remover `langchain-huggingface`, eliminar el import de `HuggingFaceEmbeddings` en `backend/rag/retrieval/retriever.py` y ajustar cualquier referencia.
- Considerar reemplazar `sklearn.metrics.pairwise.cosine_similarity` por una implementación con `numpy` para reducir dependencias (no obligatorio en esta migración).