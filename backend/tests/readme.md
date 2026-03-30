Backend tests
=============

Objetivo
--------
- Mantener una suite unitaria rápida y estable.
- Probar lógica pura y orquestación local sin depender de Qdrant, Redis, MongoDB u OpenAI.
- Dejar la integración real para otro nivel de pruebas.

Estructura
----------
- `conftest.py`: stubs de entorno e infraestructura, fixtures compartidas.
- `test_hashing.py`: hashing y utilidades puras.
- `test_memory_profile.py`: extracción de perfil por regex.
- `test_gating.py`: lógica de gating.
- `test_retriever_utils.py`: helpers puros del retriever.
- `test_reranking.py`: reranking y MMR.
- `test_corpus_state.py`: invalidación de estado derivado del corpus.

Cómo ejecutar
-------------
Desde `backend/`:

```bash
python -m pytest
```

Principios
----------
- Un test unitario no debe requerir servicios externos.
- Si una dependencia de infraestructura rompe imports en unit tests, se stubbea en `conftest.py`.
- Los tests async usan `pytest-anyio`, no configuración específica de `pytest-asyncio`.
