Walkthrough: Unit Tests del Backend
Resultado Final
======================== 91 passed in 3.55s ========================
91/91 tests pasaron dentro de Docker. Exit code 0. ✅

Archivos Creados / Modificados
Archivo	Descripción
pyproject.toml
Config pytest + asyncio auto mode
conftest.py
Fixtures + fix de import circular
test_gating.py
27 tests — trivial query + gating logic
test_retriever_utils.py
19 tests — vectors, content type, formatting
test_reranking.py
11 tests — semantic reranking + MMR
test_hashing.py
15 tests — dedup hash + cache key hash
test_memory_profile.py
14 tests — regex profile extraction
Cómo Ejecutar
bash
docker exec chatbot-backend python -m pytest tests/ -v --tb=short
Hallazgos Durante la Implementación
WARNING

Import circular descubierto: cache.manager → utils.logging_utils → utils/__init__ → chain_cache → cache.manager. Se resolvió en 
conftest.py
 con pre-import via importlib, pero es un bug latente del codebase a corregir en una futura refactorización.

NOTE

Gating pipeline order: El test 
test_small_corpus_sin_pregunta_pocos_tokens
 reveló que el filtro 
low_intent
 se evalúa antes que 
small_corpus
. Queries con ≤3 tokens sin interrogativo siempre resultan en 
low_intent
, independientemente del tamaño del corpus.