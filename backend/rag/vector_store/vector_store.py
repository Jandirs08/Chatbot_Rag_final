"""Módulo para gestión optimizada del almacenamiento vectorial."""
import logging
from typing import List, Optional, Dict, Any, Tuple
from pathlib import Path
import numpy as np
from sklearn.metrics.pairwise import cosine_similarity
import time
from datetime import datetime
import asyncio
from functools import lru_cache
import shutil
import sqlite3
# Redis es opcional: importar de forma condicional
try:
    import redis  # type: ignore
    _REDIS_AVAILABLE = True
except Exception:
    redis = None  # type: ignore
    _REDIS_AVAILABLE = False
from fastapi import HTTPException
import uuid

from langchain_core.documents import Document
from langchain_community.vectorstores import Chroma
from config import settings

logger = logging.getLogger(__name__)

class VectorStore:
    """Gestor optimizado de almacenamiento vectorial con soporte para MMR y caché."""

    def __init__(
        self,
        persist_directory: str,
        embedding_function: Any,
        distance_strategy: str = "cosine",
        cache_enabled: bool = True,
        cache_ttl: int = 3600,
        batch_size: int = 100
    ):
        """Inicializa el almacenamiento vectorial.
        
        Args:
            persist_directory: Directorio para persistencia.
            embedding_function: Función de embedding a usar.
            distance_strategy: Estrategia de distancia para búsqueda.
            cache_enabled: Si habilitar caché.
            cache_ttl: Tiempo de vida del caché en segundos.
            batch_size: Tamaño del lote para operaciones por lotes.
        """
        self.persist_directory = Path(persist_directory)
        self.embedding_function = embedding_function
        self.distance_strategy = distance_strategy
        self.cache_enabled = cache_enabled
        self.cache_ttl = cache_ttl
        self.batch_size = batch_size
        
        # Inicializar Redis con manejo de errores mejorado
        self._query_cache = {}  # Caché en memoria como alternativa
        self.redis_client = None
        
        if settings.redis_url and _REDIS_AVAILABLE:
            try:
                self.redis_client = redis.from_url(
                    settings.redis_url.get_secret_value(),
                    socket_timeout=1.0,  # Timeout corto para evitar bloqueos
                    socket_connect_timeout=1.0
                )
                # Verificar conexión
                self.redis_client.ping()
                logger.info("Conexión a Redis establecida correctamente")
            except Exception as e:
                logger.warning(f"No se pudo conectar a Redis: {e}. Usando caché en memoria.")
                self.redis_client = None
        else:
            if settings.redis_url and not _REDIS_AVAILABLE:
                logger.warning("REDIS_URL definido pero la librería 'redis' no está instalada. Usando caché en memoria.")
        
        self._initialize_store()
        logger.info(
            f"VectorStore inicializado en {persist_directory} "
            f"con strategy={distance_strategy}, cache={'enabled' if cache_enabled else 'disabled'}"
        )

    def _initialize_store(self) -> None:
        """Inicializa el almacenamiento Chroma con optimizaciones."""
        self.persist_directory.parent.mkdir(parents=True, exist_ok=True)
        # Pre-chequeo de compatibilidad del sysdb de Chroma (sqlite) para evitar fallos de arranque
        try:
            sqlite_path = self.persist_directory / "chroma.sqlite3"
            if sqlite_path.exists():
                conn = sqlite3.connect(str(sqlite_path))
                try:
                    cur = conn.cursor()
                    cur.execute("PRAGMA table_info(collections)")
                    cols = [row[1] for row in cur.fetchall()]  # row[1] es el nombre de la columna
                    # Columnas esperadas en versiones recientes de Chroma incluyen 'topic'
                    if "topic" not in cols:
                        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
                        backup_dir = self.persist_directory.parent / f"{self.persist_directory.name}_backup_{ts}"
                        shutil.move(str(self.persist_directory), str(backup_dir))
                        logger.error(
                            f"Chroma sysdb detectado incompatible (sin columna 'topic'). Persist movido a backup: {backup_dir}. "
                            "Se generará un nuevo almacén limpio."
                        )
                        # Recrear directorio limpio
                        self.persist_directory.mkdir(parents=True, exist_ok=True)
                finally:
                    try:
                        conn.close()
                    except Exception:
                        pass
        except Exception as precheck_err:
            # No bloquear el inicio por errores en el pre-chequeo; se manejarán en los intents posteriores
            logger.warning(f"No se pudo realizar pre-chequeo de sysdb Chroma: {precheck_err}")
        
        try:
            try:
                # Intento inicial de crear/abrir la colección persistente
                self.store = Chroma(
                    persist_directory=str(self.persist_directory),
                    embedding_function=self.embedding_function,
                    collection_name="rag_collection",
                    collection_metadata={
                        "hnsw:space": self.distance_strategy,
                        "hnsw:construction_ef": 200,
                        "hnsw:search_ef": 128,
                        "hnsw:M": 16
                    }
                )
            except Exception as init_err:
                # Manejar incompatibilidades de esquema de Chroma (sysdb) de manera robusta
                msg = str(init_err)
                if isinstance(init_err, sqlite3.OperationalError) or "no such column" in msg:
                    # Copia de seguridad y reinicialización limpia del directorio persistente
                    try:
                        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
                        backup_dir = self.persist_directory.parent / f"{self.persist_directory.name}_backup_{ts}"
                        if self.persist_directory.exists():
                            shutil.move(str(self.persist_directory), str(backup_dir))
                            logger.error(
                                f"Chroma sysdb incompatible ({msg}). Directorio persistente movido a backup: {backup_dir}. "
                                "Reinicializando colección desde cero."
                            )
                        # Reintentar creación con directorio limpio
                        self.persist_directory.mkdir(parents=True, exist_ok=True)
                        self.store = Chroma(
                            persist_directory=str(self.persist_directory),
                            embedding_function=self.embedding_function,
                            collection_name="rag_collection",
                            collection_metadata={
                                "hnsw:space": self.distance_strategy,
                                "hnsw:construction_ef": 200,
                                "hnsw:search_ef": 128,
                                "hnsw:M": 16
                            }
                        )
                    except Exception as retry_err:
                        logger.error(f"Fallo al reinicializar VectorStore tras backup: {retry_err}", exc_info=True)
                        raise retry_err
                else:
                    # Error distinto: propagar
                    raise init_err
            
            # Operaciones sobre la colección con manejo robusto de incompatibilidades
            try:
                # Eliminar dummy si existe (corregido)
                try:
                    # 'ids' no es un valor válido para 'include' en Chroma; los IDs se devuelven por defecto
                    docs = self.store._collection.get(where={"is_dummy": True}, include=["documents", "metadatas"])
                    ids = []
                    for i, meta in enumerate(docs.get("metadatas", [])):
                        if meta and meta.get("is_dummy"):
                            ids.append(docs["ids"][i])
                    if ids:
                        self.store._collection.delete(ids=ids)
                        logger.info("Dummy system_dummy_doc eliminado")
                except Exception as e:
                    logger.warning(f"No se pudo eliminar dummy: {e}")

                # Verificar si la colección está vacía
                count = self.store._collection.count()
                if count == 0:
                    logger.info("Colección vacía, se creará al añadir documentos")
                    
                    # Opcionalmente añadir un documento de inicialización para que la colección exista
                    # y se puedan hacer búsquedas sin errores
                    try:
                        dummy_text = "Documento de inicialización del sistema"
                        dummy_embedding = None
                        if hasattr(self.embedding_function, 'embed_query'):
                            dummy_embedding = self.embedding_function.embed_query(dummy_text)
                        else:
                            dummy_embedding = self.embedding_function.encode([dummy_text])[0].tolist()
                        
                        self.store._collection.add(
                            embeddings=[dummy_embedding],
                            documents=[dummy_text],
                            metadatas=[{"source": "system", "is_dummy": True}],
                            ids=["system_dummy_doc"]
                        )
                        logger.info("Documento de inicialización añadido a la colección")
                    except Exception as e:
                        logger.warning(f"No se pudo añadir documento de inicialización: {e}")
                else:
                    logger.info(f"Colección existente con {count} documentos")
            except Exception as col_err:
                msg = str(col_err)
                if isinstance(col_err, sqlite3.OperationalError) or "no such column" in msg:
                    # Respaldo y reinicialización segura ante incompatibilidad de esquema
                    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
                    backup_dir = self.persist_directory.parent / f"{self.persist_directory.name}_backup_{ts}"
                    try:
                        if self.persist_directory.exists():
                            shutil.move(str(self.persist_directory), str(backup_dir))
                            logger.error(
                                f"Chroma sysdb incompatible al operar la colección ({msg}). Persist moved to: {backup_dir}. "
                                "Reinicializando colección limpia."
                            )
                        # Recrear store limpio
                        self.persist_directory.mkdir(parents=True, exist_ok=True)
                        self.store = Chroma(
                            persist_directory=str(self.persist_directory),
                            embedding_function=self.embedding_function,
                            collection_name="rag_collection",
                            collection_metadata={
                                "hnsw:space": self.distance_strategy,
                                "hnsw:construction_ef": 200,
                                "hnsw:search_ef": 128,
                                "hnsw:M": 16
                            }
                        )
                        logger.info("VectorStore reinicializado tras incompatibilidad de esquema.")
                    except Exception as retry_err:
                        logger.error(f"Fallo al reinicializar VectorStore tras incompatibilidad: {retry_err}", exc_info=True)
                        raise retry_err
                else:
                    raise col_err
                
        except Exception as e:
            logger.error(f"Error inicializando vector store: {str(e)}", exc_info=True)
            raise

    async def add_documents(self, documents: List[Document], embeddings: list = None) -> None:
        """Añade documentos al almacenamiento de forma optimizada, permitiendo pasar embeddings explícitos."""
        if not documents:
            return
        try:
            # Procesar en lotes para optimizar memoria
            for i in range(0, len(documents), self.batch_size):
                batch = documents[i:i + self.batch_size]
                processed_batch = []
                for doc in batch:
                    try:
                        content_hash = doc.metadata.get('content_hash')
                        if content_hash:
                            try:
                                await self.delete_documents(filter={"content_hash": content_hash})
                            except Exception as delete_err:
                                logger.error(f"Error deleting document with hash {content_hash}: {delete_err}", exc_info=True)
                        processed_batch.append(doc)
                    except Exception as doc_process_err:
                        logger.error(f"Error processing document in batch {i//self.batch_size + 1}: {doc_process_err}", exc_info=True)
                        continue
                if processed_batch:
                    texts = [doc.page_content for doc in processed_batch]
                    metadatas = [doc.metadata for doc in processed_batch]
                    ids = [doc.metadata.get('id') or f"{doc.metadata.get('source','unknown')}_{hash(doc.page_content)}" for doc in processed_batch]
                    ids = [str(uuid.uuid4()) if id is None else str(id) for id in ids]
                    try:
                        add_kwargs = dict(documents=texts, metadatas=metadatas, ids=ids)
                        if embeddings is not None:
                            # Si se pasan embeddings, usar solo el slice correspondiente al batch
                            batch_embeddings = embeddings[i:i + self.batch_size]
                            add_kwargs['embeddings'] = batch_embeddings
                        self.store._collection.add(**add_kwargs)
                        logger.debug(f"Successfully added {len(processed_batch)} documents to Chroma collection for batch {i//self.batch_size + 1}.")
                    except Exception as add_err:
                        logger.error(f"Error adding documents to Chroma collection for batch {i//self.batch_size + 1}: {add_err}", exc_info=True)
            await self._invalidate_cache()
            logger.info(f"Ingestion process completed for {len(documents)} documents. Added to vector store.")
            return None
        except Exception as e:
            logger.error(f"Error general añadiendo documentos al vector store: {str(e)}", exc_info=True)
            raise

    async def _get_document_embedding(self, content: str) -> np.ndarray:
        """Obtiene el embedding de un documento, asegurando np.ndarray."""
        try:
            emb = None
            if hasattr(self.embedding_function, 'embed_query'):
                # embed_query podría ser async
                if asyncio.iscoroutinefunction(self.embedding_function.embed_query):
                     emb = await self.embedding_function.embed_query(content)
                else:
                     emb = self.embedding_function.embed_query(content)
            elif hasattr(self.embedding_function, 'encode'):
                 # encode podría ser sync o async dependiendo de la lib
                 if asyncio.iscoroutinefunction(self.embedding_function.encode):
                      emb = await self.embedding_function.encode([content])
                      if isinstance(emb, list) and len(emb) > 0:
                           emb = emb[0]
                 else:
                      emb = self.embedding_function.encode([content])
                      if isinstance(emb, list) and len(emb) > 0:
                           emb = emb[0]
            else:
                 logger.error("Función de embedding no soporta 'embed_query' ni 'encode'.")
                 raise ValueError("Función de embedding inválida")
                 
            if isinstance(emb, list):
                 return np.array(emb)
            elif isinstance(emb, np.ndarray):
                 return emb
            else:
                 logger.error(f"El embedding obtenido no es lista ni np.ndarray: {type(emb)}")
                 # Intentar convertir si es una coroutine object que se pasó sin await
                 if asyncio.iscoroutine(emb):
                     logger.warning("Embedding obtenido fue una coroutine no esperada, intentando esperar.")
                     try:
                          awaited_emb = await emb
                          if isinstance(awaited_emb, list):
                               return np.array(awaited_emb)
                          elif isinstance(awaited_emb, np.ndarray):
                               return awaited_emb
                          else:
                               logger.error(f"Embeddings después de esperar coroutine aún no es lista/ndarray: {type(awaited_emb)}")
                               raise TypeError("Tipo de embedding no soportado después de esperar")
                     except Exception as await_e:
                         logger.error(f"Error al esperar coroutine de embedding: {await_e}")
                         raise
                 else:
                      raise TypeError(f"Tipo de embedding no soportado: {type(emb)}")
                 
        except Exception as e:
            logger.error(f"Error al obtener embedding: {str(e)}", exc_info=True)
            # Devolver un array de ceros para evitar que el programa se caiga
            # Unificar fallback: usar la dimensión configurada en settings.default_embedding_dimension
            try:
                dim = int(getattr(settings, "default_embedding_dimension", 1536))
            except Exception:
                dim = 1536
            logger.warning(f"Devolviendo embedding de ceros (dimensión={dim}) debido a un error.")
            return np.zeros(dim, dtype=np.float32)
                 

    async def retrieve(
        self,
        query: str,
        k: int = 4,
        filter: Optional[Dict] = None,
        use_mmr: bool = True,
        fetch_k: Optional[int] = None,
        lambda_mult: float = 0.5,
        score_threshold: float = 0.5
    ) -> List[Document]:
        """Recupera documentos relevantes usando MMR o similitud directa."""
        cache_key = f"{query}_{k}_{str(filter)}_{use_mmr}_{fetch_k}_{lambda_mult}"
        
        # Verificar caché
        if self.cache_enabled:
            try:
                cached = await self._get_from_cache(cache_key)
                if cached:
                    logger.info(f"Cache hit para key: {cache_key}")
                    return cached
                else:
                     logger.info(f"Cache miss para key: {cache_key}")
            except Exception as e:
                logger.warning(f"Error al acceder al caché para key {cache_key}: {e}. Continuando sin caché.")

        try:
            # Obtener embedding de la consulta
            query_embedding = await self._get_document_embedding(query)
            
            # *** VERIFICACIÓN AÑADIDA ***
            if not isinstance(query_embedding, np.ndarray):
                 logger.error(f"query_embedding no es np.ndarray después de _get_document_embedding: {type(query_embedding)}")
                 # Dependiendo de la gravedad, podrías lanzar una excepción aquí o intentar convertir
                 # Por ahora, registramos y continuamos si es posible (aunque puede fallar más adelante)

            # Obtener el número total de documentos
            total_docs = self.store._collection.count()
            if total_docs == 0:
                logger.warning("La colección está vacía")
                return []
            
            # Ajustar k y fetch_k según el tamaño de la colección
            k = min(k, total_docs)
            fetch_k = min(fetch_k or k*3, total_docs)
            
            docs_and_scores = []
            if use_mmr:
                # Usar MMR para diversidad
                docs_and_scores = await self._mmr_search(
                    query_embedding,
                    k=k,
                    fetch_k=fetch_k,
                    lambda_mult=lambda_mult,
                    filter=filter
                )
            else:
                # Búsqueda por similitud directa
                docs_and_scores = await self._similarity_search(
                    query_embedding,
                    k=k,
                    filter=filter
                )

            # *** VERIFICACIÓN AÑADIDA ***
            if not isinstance(docs_and_scores, list) or any(not isinstance(item, tuple) or len(item) != 2 for item in docs_and_scores):
                 logger.error(f"_mmr_search o _similarity_search devolvió un formato inesperado: {type(docs_and_scores)}, contenido: {docs_and_scores[:5] if isinstance(docs_and_scores, list) else 'N/A'}")
                 # Intentar procesar si es una lista, aunque el formato sea raro
                 if not isinstance(docs_and_scores, list):
                     return []

            # Filtrar por score threshold y formatear resultados
            filtered_docs = []
            for doc, score in docs_and_scores:
                # *** VERIFICACIÓN AÑADIDA ***
                if not isinstance(doc, Document) or not isinstance(score, (float, int)):
                     logger.warning(f"Elemento con formato inesperado en docs_and_scores: doc type {type(doc)}, score type {type(score)}. Omitiendo.")
                     continue
                     
                if score >= score_threshold:
                    doc.metadata["score"] = float(score)
                    filtered_docs.append(doc)

            # Actualizar caché
            if self.cache_enabled and filtered_docs:
                try:
                    await self._add_to_cache(cache_key, filtered_docs)
                    logger.info(f"Cache updated for key: {cache_key}")
                except Exception as e:
                    logger.warning(f"Error al actualizar caché para key {cache_key}: {e}")

            return filtered_docs

        except Exception as e:
            logger.error(f"Error general en recuperación (retrieve): {str(e)}", exc_info=True)
            return []

    async def _mmr_search(
        self,
        query_embedding: np.ndarray,
        k: int,
        fetch_k: int,
        lambda_mult: float,
        filter: Optional[Dict] = None
    ) -> List[Tuple[Document, float]]:
        """Implementa búsqueda MMR optimizada."""
        try:
            # Obtener candidatos iniciales (Document, score)
            candidates = await self._similarity_search(query_embedding, k=fetch_k, filter=filter)
            if not candidates:
                logger.info("No hay candidatos para MMR.")
                return []
                
            # Extraer documentos y obtener/verificar embeddings como np.ndarray
            docs = []
            scores = []
            # Usaremos una lista temporal para recolectar embeddings asegurando que sean np.ndarray
            temp_embeddings_list = []
            
            for doc, score in candidates:
                docs.append(doc)
                scores.append(score)
                
                # Intentar obtener embedding de metadatos primero
                doc_emb = doc.metadata.get("embedding")
                
                if doc_emb is None:
                    # Si no está en metadatos, calcularlo. _get_document_embedding ya devuelve np.ndarray
                    try:
                         doc_emb = await self._get_document_embedding(doc.page_content)
                    except Exception as e:
                         logger.warning(f"Error al calcular embedding para documento en MMR: {e}. Omitiendo documento.")
                         # Si falla, omitir este documento de los candidatos MMR
                         continue
                
                # Asegurarse de que doc_emb es un np.ndarray antes de añadirlo
                if isinstance(doc_emb, list):
                    doc_emb = np.array(doc_emb)
                elif not isinstance(doc_emb, np.ndarray):
                    logger.warning(f"Embedding de tipo inesperado ({type(doc_emb)}) en MMR para doc: {doc.metadata.get('source', 'N/A')}. Omitiendo documento.")
                    continue # Omitir si no es lista ni ndarray
                
                temp_embeddings_list.append(doc_emb)

            # Convertir la lista de arrays a un único array 2D de NumPy
            if not temp_embeddings_list:
                 logger.info("No hay embeddings válidos después de la extracción/verificación en MMR.")
                 return []
            
            doc_embeddings = np.vstack(temp_embeddings_list)
            
            # Verificar dimensiones
            if query_embedding.ndim == 1:
                 query_embedding = query_embedding.reshape(1, -1)
            if doc_embeddings.ndim == 1:
                 doc_embeddings = doc_embeddings.reshape(1, -1)
            
            if query_embedding.shape[1] != doc_embeddings.shape[1]:
                 logger.error(f"Dimensiones de embedding no coinciden en MMR: Query {query_embedding.shape}, Docs {doc_embeddings.shape}")
                 return [(docs[i], scores[i]) for i in range(min(k, len(docs)))] # Fallback a top K por similitud si hay error de dimensión

            # Calcular MMR
            selected_indices = []
            remaining_indices = list(range(len(docs)))
            
            # Asegurar que k no excede el número de documentos válidos
            k = min(k, len(docs))

            for _ in range(k):
                if not remaining_indices:
                    break
                    
                # Calcular scores MMR
                mmr_scores = []
                for i_idx, doc_idx in enumerate(remaining_indices):
                    try:
                        # Relevancia con la consulta
                        relevance = cosine_similarity(query_embedding, doc_embeddings[doc_idx].reshape(1, -1))[0][0]
                        
                        # Diversidad respecto a documentos seleccionados
                        if selected_indices:
                            selected_embeddings = doc_embeddings[selected_indices]
                            similarities = cosine_similarity(doc_embeddings[doc_idx].reshape(1, -1), selected_embeddings)[0]
                            diversity = 1 - np.max(similarities)
                        else:
                            diversity = 1.0

                        # Combinar con lambda
                        mmr_score = lambda_mult * relevance + (1 - lambda_mult) * diversity
                        mmr_scores.append((doc_idx, mmr_score))

                    except Exception as e:
                        logger.warning(f"Error calculando score MMR para índice original {doc_idx}: {e}. Omitiendo.")
                        # Si hay error, este documento no participa en la selección de esta iteración
                        continue
                
                if not mmr_scores:
                    # Si no se pudieron calcular scores para los restantes, salimos
                    break

                # Seleccionar documento con mayor score MMR de los restantes
                # max() lanzará error si mmr_scores está vacío, manejado arriba
                selected_original_idx = max(mmr_scores, key=lambda x: x[1])[0]
                selected_indices.append(selected_original_idx)
                # Eliminar el índice original de la lista de restantes
                remaining_indices.remove(selected_original_idx)

            # Devolver documentos en orden MMR con sus scores originales
            # Solo devolvemos los 'k' documentos seleccionados
            return [(docs[i], scores[i]) for i in selected_indices]

        except Exception as e:
            logger.error(f"Error general en búsqueda MMR: {str(e)}", exc_info=True)
            # En caso de cualquier error, retornar los top K por similitud directa como fallback
            try:
                 # Re-obtener los top K candidatos iniciales si es posible
                 fallback_candidates = await self._similarity_search(query_embedding, k=k, filter=filter)
                 logger.warning(f"Fallback a top {k} por similitud debido a error en MMR.")
                 return fallback_candidates
            except Exception as fb_e:
                 logger.error(f"Error adicional en fallback a similitud: {fb_e}")
                 return [] # Retornar vacío si el fallback también falla

    async def _similarity_search(
        self,
        query_embedding: np.ndarray,
        k: int,
        filter: Optional[Dict] = None
    ) -> List[Tuple[Document, float]]:
        """Implementa búsqueda por similitud optimizada."""
        try:
            # Asegurarse de que el embedding esté en el formato correcto para Chroma
            if isinstance(query_embedding, np.ndarray):
                query_embedding = query_embedding.tolist()
            
            # Obtener el número total de documentos en la colección
            total_docs = self.store._collection.count()
            if total_docs == 0:
                logger.warning("La colección está vacía")
                return []
            
            # Ajustar k si es necesario
            k = min(k, total_docs)
            
            # Realizar la búsqueda
            results = self.store.similarity_search_by_vector_with_relevance_scores(
                embedding=query_embedding,
                k=k,
                filter=filter
            )
            
            return results
        except Exception as e:
            logger.error(f"Error en búsqueda por similitud: {str(e)}")
            return []

    async def _get_from_cache(self, key: str) -> Optional[List[Document]]:
        """Recupera resultados del caché con mejor manejo de errores."""
        if not self.cache_enabled:
            return None
        try:
            import collections.abc
            # Usar Redis si está disponible, sino usar caché en memoria
            if self.redis_client:
                try:
                    cached = self.redis_client.get(key)
                    if cached:
                        result = self._deserialize_documents(cached)
                        # Verificar si el resultado es una corutina
                        if isinstance(result, collections.abc.Awaitable):
                            logger.warning("Caché de VectorStore contenía una coroutine, eliminada.")
                            self.redis_client.delete(key)
                            return None
                        return result
                except redis.RedisError as e:
                    logger.warning(f"Error accediendo al caché Redis: {e}. Usando caché en memoria.")
                    self.redis_client = None  # Deshabilitar Redis para evitar más errores
            # Caché en memoria
            cache_entry = self._query_cache.get(key)
            if cache_entry and time.time() - cache_entry[0] < self.cache_ttl:
                result = cache_entry[1]
                # Verificar si el resultado es una corutina
                if isinstance(result, collections.abc.Awaitable):
                    logger.warning("Caché de VectorStore contenía una coroutine, eliminada.")
                    del self._query_cache[key]
                    return None
                return result
        except Exception as e:
            logger.warning(f"Error accediendo al caché: {str(e)}")
        return None

    async def _add_to_cache(self, key: str, docs: List[Document]) -> None:
        """Añade resultados al caché con mejor manejo de errores."""
        if not self.cache_enabled or not docs:
            return
        try:
            import collections.abc
            # Verificar que no estamos intentando cachear una corutina
            if isinstance(docs, collections.abc.Awaitable):
                logger.warning("Intento de almacenar una coroutine en caché del VectorStore, ignorado.")
                return
            # Usar Redis si está disponible, sino usar caché en memoria
            if self.redis_client:
                try:
                    serialized = self._serialize_documents(docs)
                    self.redis_client.setex(key, min(self.cache_ttl, 3600), serialized)  # Max 1 hora
                    return
                except redis.RedisError as e:
                    logger.warning(f"Error guardando en caché Redis: {e}. Usando caché en memoria.")
                    self.redis_client = None  # Deshabilitar Redis para evitar más errores
            # Caché en memoria como fallback
            self._query_cache[key] = (time.time(), docs)
            # Limitar tamaño del caché local
            if len(self._query_cache) > settings.max_cache_size:
                # Eliminar entradas más antiguas
                oldest_entries = sorted(
                    self._query_cache.items(),
                    key=lambda item: item[1][0]
                )[:len(self._query_cache) // 4]  # Eliminar 25% más antiguo
                for old_key, _ in oldest_entries:
                    del self._query_cache[old_key]
                logger.info(f"Caché podado: {len(oldest_entries)} entradas eliminadas")
        except Exception as e:
            logger.warning(f"Error guardando en caché: {str(e)}")

    async def _invalidate_cache(self) -> None:
        """Invalida el caché."""
        if not self.cache_enabled:
            return
            
        try:
            if self.redis_client:
                self.redis_client.flushdb()
            else:
                self._query_cache.clear()
            # Solo loguear si estamos en modo debug
            logger.debug("Caché de vector store invalidado")
        except Exception as e:
            logger.error(f"Error invalidando caché: {str(e)}")

    def _serialize_documents(self, docs: List[Document]) -> bytes:
        """Serializa documentos para caché."""
        # Simplificado para almacenar solo lo esencial
        serializable = []
        for doc in docs:
            # Eliminar embeddings de los metadatos para ahorrar espacio
            metadata = doc.metadata.copy()
            # Conservar embeddings si está habilitado en settings
            if not getattr(settings, "cache_store_embeddings", True):
                if 'embedding' in metadata:
                    del metadata['embedding']
                
            serializable.append({
                'page_content': doc.page_content,
                'metadata': metadata
            })
            
        import pickle
        return pickle.dumps(serializable)

    def _deserialize_documents(self, data: bytes) -> List[Document]:
        """Deserializa documentos desde caché."""
        import pickle
        serialized = pickle.loads(data)
        
        return [
            Document(page_content=item['page_content'], metadata=item['metadata'])
            for item in serialized
        ]

    async def delete_documents(self, filter: Optional[Dict[str, Any]] = None) -> None:
        """Elimina documentos que coinciden con el filtro. Si no hay filtro, elimina toda la colección."""
        try:
            if filter:
                matching_ids = self.store._collection.get(
                    where=filter,
                    include=[])['ids']
                if matching_ids and len(matching_ids) > 0:
                    self.store._collection.delete(ids=matching_ids)
                    logger.info(f"Se eliminaron {len(matching_ids)} documentos con filtro: {filter}")
            else:
                logger.info("No se proporcionó filtro, eliminando toda la colección.")
                await self.delete_collection()
            await self._invalidate_cache()
        except Exception as e:
            logger.error(f"Error eliminando documentos: {str(e)}")
            raise

    async def delete_collection(self) -> None:
        """Elimina completamente la colección y borra el directorio persistente."""
        try:
            persist_path = self.persist_directory

            # 🔥 Intentar borrar colección en Chroma primero, luego soltar referencias
            client = None
            try:
                if hasattr(self, "store") and self.store is not None:
                    client = getattr(self.store, "_client", None)
                    if client:
                        try:
                            client.delete_collection("rag_collection")
                            logger.info("Colección 'rag_collection' eliminada vía cliente de Chroma.")
                        except Exception as e:
                            logger.warning(f"Fallo al borrar colección vía cliente: {e}")
                    # Soltar referencias a la colección para liberar locks de sqlite
                    try:
                        if hasattr(self.store, "_collection"):
                            self.store._collection = None
                    except Exception as e:
                        logger.warning(f"No se pudo limpiar referencia a _collection: {e}")
            finally:
                # Asegurar que self.store se suelta para evitar manejadores abiertos
                try:
                    self.store = None
                except Exception:
                    pass

            # 🧹 Eliminar directorio físico
            import shutil, time
            if persist_path.exists():
                # Reintento con espera corta por si el archivo aún está bloqueado
                for attempt in range(3):
                    try:
                        shutil.rmtree(persist_path, ignore_errors=False)
                        logger.info(f"Directorio persistente eliminado: {persist_path}")
                        break
                    except PermissionError as err:
                        logger.warning(f"Intento {attempt+1}: persist directory bloqueado ({err}), reintentando...")
                        time.sleep(0.5)
                    except Exception as err:
                        logger.warning(f"Intento {attempt+1}: error al eliminar directorio ({err}), reintentando...")
                        time.sleep(0.5)
                else:
                    logger.error(f"No se pudo eliminar el directorio después de 3 intentos: {persist_path}")

            #  Reinicializar limpio
            self._initialize_store()
            await self._invalidate_cache()
            logger.info("Colección eliminada y vector store reinicializado desde cero.")

        except Exception as e:
            logger.error(f"Error eliminando colección: {str(e)}", exc_info=True)
            raise


    def __del__(self):
        """Limpieza al destruir la instancia."""
        try:
            if hasattr(self, 'store'):
                pass
        except Exception as e:
            logger.error(f"Error en limpieza de VectorStore: {str(e)}")