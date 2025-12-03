import sys
import types
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

# ==================================================================================
# 1. PRE-POISONING: ROMPER DEPENDENCIAS CIRCULARES Y DEL ENTORNO
# ==================================================================================
# Esto debe ejecutarse ANTES de importar cualquier archivo del proyecto.
# Inyectamos módulos falsos para que Python no intente cargar los archivos reales
# que tienen dependencias circulares (Cache <-> Utils <-> Config).

# A. Mockear 'config' para evitar validaciones de Pydantic al importar
if 'config' not in sys.modules:
    mock_config = types.ModuleType('config')
    mock_config.settings = MagicMock()
    mock_config.Settings = MagicMock()
    sys.modules['config'] = mock_config

# B. Mockear 'utils.logging_utils' para evitar configuración de logs compleja
if 'utils.logging_utils' not in sys.modules:
    mock_logging = types.ModuleType('utils.logging_utils')
    mock_logging.get_logger = lambda name: MagicMock()
    sys.modules['utils.logging_utils'] = mock_logging
    # Crear módulo padre 'utils' si no existe
    if 'utils' not in sys.modules:
        sys.modules['utils'] = types.ModuleType('utils')

# C. Mockear 'cache.manager' (EL CULPABLE DEL ERROR CIRCULAR)
# Al inyectarlo aquí, vector_store.py importará este mock en lugar del real.
if 'cache.manager' not in sys.modules:
    mock_cache_mgr = types.ModuleType('cache.manager')
    mock_cache_mgr.cache = MagicMock() # El objeto que todos buscan
    sys.modules['cache.manager'] = mock_cache_mgr
    if 'cache' not in sys.modules:
        sys.modules['cache'] = types.ModuleType('cache')

# ==================================================================================
# 2. STUBS PARA LIBRERÍAS EXTERNAS (Qdrant, LangChain)
# ==================================================================================
# Evitamos que el test falle si no tienes instaladas estas libs en el entorno de test

if 'qdrant_client' not in sys.modules:
    qdrant_client = types.ModuleType('qdrant_client')
    http_mod = types.ModuleType('qdrant_client.http')
    models_mod = types.ModuleType('qdrant_client.http.models')

    class MockClass:
        def __init__(self, *args, **kwargs): pass

    for name in ['Distance', 'VectorParams', 'PointStruct', 'Filter', 'FieldCondition', 
                 'MatchValue', 'FilterSelector', 'HnswConfigDiff', 'OptimizersConfigDiff', 'NearestQuery']:
        setattr(models_mod, name, MockClass)
    
    models_mod.Distance.COSINE = 'cosine'
    http_mod.models = models_mod
    qdrant_client.QdrantClient = MockClass
    qdrant_client.http = http_mod
    sys.modules['qdrant_client'] = qdrant_client
    sys.modules['qdrant_client.http'] = http_mod
    sys.modules['qdrant_client.http.models'] = models_mod

if 'langchain_core.documents' not in sys.modules:
    docs_mod = types.ModuleType('langchain_core.documents')
    class Document:
        def __init__(self, page_content: str = "", metadata: dict | None = None):
            self.page_content = page_content
            self.metadata = metadata or {}
    docs_mod.Document = Document
    sys.modules['langchain_core.documents'] = docs_mod

# ==================================================================================
# 3. IMPORTACIÓN DEL CÓDIGO A TESTEAR
# ==================================================================================
# Ajustamos el path para asegurar que encuentre 'rag' desde /app
import os
sys.path.append('/app') 

from langchain_core.documents import Document
# Ahora sí es seguro importar porque sus dependencias conflictivas están mockeadas
from rag.retrieval.retriever import RAGRetriever 

# ==================================================================================
# 4. FIXTURES Y TESTS (LÓGICA REAL)
# ==================================================================================

@pytest.fixture(autouse=True)
def patched_settings():
    """Sobrescribe settings solo para el contexto de este test."""
    # Patch sobre el lugar donde se usa, que ahora es nuestro mock o el módulo real
    with patch('rag.retrieval.retriever.settings') as mock_settings:
        mock_settings.retrieval_k_multiplier = 3
        mock_settings.enable_cache = False
        mock_settings.default_embedding_dimension = 1536
        mock_settings.rag_gating_similarity_threshold = 0.45
        yield mock_settings

@pytest.fixture
def mock_embedding_manager():
    m = MagicMock()
    # Simula un vector válido para happy path
    m.embed_query.return_value = [0.1] * 1536
    return m

@pytest.fixture
def mock_vector_store():
    vs = MagicMock()
    vs.retrieve = AsyncMock()
    vs.client = MagicMock()
    vs.client.count = MagicMock()
    return vs

@pytest.fixture
def retriever(mock_vector_store, mock_embedding_manager):
    # Instanciamos el retriever real. Gracias a los mocks de arriba, 
    # no explotará al intentar conectar con Cache o Redis.
    r = RAGRetriever(vector_store=mock_vector_store, embedding_manager=mock_embedding_manager, cache_enabled=False)
    
    # Forzamos un centroide válido en memoria para que no intente calcularlo
    import numpy as np
    r._centroid_embedding = (np.ones(1536, dtype=np.float32) / np.sqrt(1536)).astype(np.float32)
    return r

# --- TESTS DE LÓGICA ---

@pytest.mark.parametrize('text', ['Hola', 'buenos días', 'gracias', 'ok'])
def test_gating_small_talk(retriever, mock_embedding_manager, text):
    """
    Valida que el 'Portero' (Gating) detecte saludos y NO gaste dinero en embeddings.
    """
    reason, use = retriever.gating(text)
    
    # Debe identificarlo como charla y decir FALSE al uso de RAG
    assert reason == 'small_talk'
    assert use is False
    
    # CRÍTICO: Asegurar que NO se llamó a OpenAI
    mock_embedding_manager.embed_query.assert_not_called()

@pytest.mark.parametrize('text', ['A', 'xy', 'yo'])
def test_gating_too_short(retriever, text):
    """Valida el bloqueo por longitud mínima."""
    reason, use = retriever.gating(text)
    assert reason == 'too_short'
    assert use is False

@pytest.mark.asyncio
async def test_retrieval_early_exit_small_talk(retriever, mock_vector_store):
    """
    TEST DE INTEGRIDAD DEL RETRIEVER:
    Si le llega un 'Hola' directo a retrieve_documents, debe cortar el flujo.
    """
    mock_vector_store.retrieve.reset_mock()
    
    # Acción: Pedir documentos para un saludo
    result = await retriever.retrieve_documents('Hola')
    
    # Validación 1: Devuelve lista vacía
    assert result == []
    
    # Validación 2: NO tocó la base de datos (Ahorro de recursos confirmado)
    mock_vector_store.retrieve.assert_not_called()

@pytest.mark.asyncio
async def test_retrieval_happy_path_calls_vector_store(retriever, mock_vector_store, mock_embedding_manager):
    """
    TEST DE FLUJO FELIZ:
    Si es una pregunta real, debe ejecutar todo el pipeline.
    """
    # Setup: El vector store devuelve algo
    docs = [Document(page_content='Doc 1', metadata={'vector': [0.1]*1536})]
    mock_vector_store.retrieve.return_value = docs
    
    query = '¿Cuál es el presupuesto del proyecto Titán?'
    
    # Acción
    result = await retriever.retrieve_documents(query, k=4, filter_criteria=None, use_semantic_ranking=True)
    
    # Validación
    assert isinstance(result, list)
    assert len(result) > 0
    
    # Verifica que llamó a la DB con la optimización de vectores activada (para reranking)
    # O desactivada según tu lógica actual. En tu último código 'retrieve_documents'
    # determina 'need_vectors' basado en 'use_semantic_ranking'.
    mock_vector_store.retrieve.assert_called_once()
    args, kwargs = mock_vector_store.retrieve.call_args
    assert args[0] == query