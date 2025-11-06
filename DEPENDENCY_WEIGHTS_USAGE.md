# Informe de pesos y uso de dependencias (Render)

Este informe consolida el tamaño en disco de las principales dependencias instaladas en el entorno virtual del backend y evalúa si se usan realmente en el código. El objetivo es ayudar a reducir errores de "Port scan timeout", "health check timeout" y posibles OOMKill en Render (plan gratuito 512MB RAM) minimizando carga y memoria al arranque.

## Resumen rápido

- Más pesadas en `site-packages`:
  - `torch` — ~431.2 MB
  - `scipy` — ~116.97 MB
  - `transformers` — ~105.64 MB
  - `sympy` — ~71.71 MB
  - `pandas` — ~66.36 MB (+ `pandas.libs` ~0.55 MB)
  - `sklearn` — ~42.44 MB
  - `onnxruntime` — ~41.37 MB
  - `kubernetes` — ~32.36 MB
  - `numpy` — ~31.67 MB (+ `numpy.libs` ~36.4 MB)
  - `sqlalchemy` — ~17.57 MB
  - `grpc` — ~11.41 MB
  - `tokenizers` — ~7.56 MB
  - `chromadb` — ~2.7 MB

- Importadas al arranque de la app (impactan memoria inicial):
  - `pandas` (ruta `export-conversations`) y `xlsxwriter`.
  - `numpy` y `sklearn` (usadas en RAG `vector_store` y `retriever`).
  - `chromadb` vía `langchain_community.vectorstores.Chroma` (inicialización de VectorStore).

- Importadas de forma diferida (lazy):
  - `sentence-transformers` y su cadena (`torch`, `transformers`, `tokenizers`) se cargan solo cuando se invoca la primera operación de embeddings locales.

- No usadas directamente en el código del backend:
  - `onnxruntime`, `kubernetes`, `sqlalchemy`, `grpc`, `PIL/Pillow`, `sympy` (instaladas, pero sin import explícito en el código fuente del backend). Algunas pueden cargarse indirectamente por `chromadb` o librerías relacionadas.

Fuente de tamaños: `docs/dependency_sizes.txt` (generado en el entorno local).

## Evidencia de uso en el código

- `pandas`: import en `backend/api/routes/chat/chat_routes.py`, usado para exportar conversaciones a Excel.
  - Archivo: `backend/api/routes/chat/chat_routes.py` — líneas 1–222.
  - Uso: `pd.ExcelWriter(...)`, `DataFrame`, formateo y exportación.

- `numpy` y `sklearn`:
  - `backend/rag/vector_store/vector_store.py`: import `numpy as np` y `from sklearn.metrics.pairwise import cosine_similarity`. Usados en similitud y MMR.
  - `backend/rag/retrieval/retriever.py`: import `numpy as np` y `cosine_similarity`.

- `chromadb` (vía LangChain Chroma):
  - `backend/rag/vector_store/vector_store.py`: `from langchain_community.vectorstores import Chroma` y operaciones sobre colección persistente.
  - `backend/api/app.py`: telemetry desactivada (`CHROMA_TELEMETRY_ENABLED=FALSE`) y ciclo de vida crea el VectorStore.

- `sentence-transformers` (carga diferida):
  - `backend/rag/embeddings/embedding_manager.py`: se importa dentro de `_load_st()` al primer uso; `_st_model` solo se instancia al invocar `embed_*`.

- No se encontraron importaciones directas en el backend para:
  - `torch`, `transformers`, `onnxruntime`, `kubernetes`, `sqlalchemy`, `grpc`, `PIL/Pillow`, `sympy`.

## Tabla de decisión: peso vs uso

- `torch` (~431 MB): no importado en arranque; se cargaría si se usa `SentenceTransformer` local. Riesgo de OOM al primer embedding en plan 512MB.
- `transformers` (~106 MB): similar a `torch`, no importado en arranque, se suma al costo al usar embeddings locales.
- `sentence-transformers` (~1.13 MB): import diferido; su uso dispara carga de `torch`/`transformers`.
- `pandas` (~66 MB): importado al arranque por rutas; impacto inmediato. Útil solo para `/export-conversations`.
- `sklearn` (~42 MB) y `numpy` (~31 MB + libs): importados al arranque; necesarios para similitud/MMR.
- `chromadb` (~2.7 MB): import al arranque; transitive deps pueden aumentar memoria si se inicializan.
- `onnxruntime` (~41 MB), `kubernetes` (~32 MB), `sqlalchemy` (~18 MB), `grpc` (~11 MB), `PIL` (~15 MB), `sympy` (~72 MB): no usados directamente; revisar si son arrastrados por deps y evitar import al arranque.

## Implicaciones para Render (512MB RAM)

- Arranque inicial ya incluye `pandas`, `numpy`, `sklearn`, `chromadb` → consumo significativo antes de que el health check responda.
- Primer embedding local con `sentence-transformers` disparará carga de `torch`/`transformers` → probable OOMKill en plan gratuito.
- Transitive deps (p. ej. `onnxruntime`, `kubernetes`) incrementan tamaño del entorno pero no deberían cargarse salvo que se importen.

## Recomendaciones

- Reducir importaciones al arranque:
  - Mover `import pandas as pd` y `xlsxwriter` dentro de la función `export_conversations()` (lazy import). Alternativa: encapsular la ruta en un router cargado condicionalmente por entorno.
  - Mantener carga diferida de `SentenceTransformer` como está; no importar `torch`/`transformers` en módulos de arranque.

- Evitar embeddings locales en Render free:
  - Preferir `OpenAIEmbeddings` o servicios remotos (env var para elegir `OPENAI`), eliminando la necesidad de `torch`/`transformers` en producción.
  - Si se requiere offline: usar modelo de embeddings mucho más ligero (por ejemplo `all-MiniLM-L6-v2`) y considerar un plan con más RAM.

- Revisión de dependencias no usadas directamente:
  - Evaluar remover de `requirements.txt` si no son obligatorias en producción: `onnxruntime`, `kubernetes`, `sqlalchemy`, `grpc`, `sympy`, `PIL`.
  - Mantenerlas solo si son transitive y realmente necesarias por `chromadb`; en ese caso, evitar su import explícito al arranque.

- VectorStore/Chroma:
  - Mantener `CHROMA_TELEMETRY_ENABLED=FALSE`.
  - Asegurar persistencia de directorios fuera de `/tmp` si el servicio reindexa al arrancar.

- Comando de inicio en Render (sin `--reload`, 1 worker):
  - Python nativo: `uvicorn backend.main:app --host 0.0.0.0 --port $PORT --workers 1`
  - Docker: `CMD sh -c "python -m uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"`

## Notas de medición

- Los tamaños son del entorno local (`docs/dependency_sizes.txt`) y reflejan el peso en disco, no el uso exacto de memoria en runtime. Sin embargo, paquetes grandes tienden a aumentar el tiempo y memoria de importación.
- Importaciones al arranque (en módulos de rutas, app y RAG) afectan directamente el tiempo del health check y la probabilidad de OOM.

## Próximos pasos sugeridos

- Hacer lazy-import de `pandas` en `/export-conversations` y probar el arranque en Render.
- Activar `OpenAIEmbeddings` en producción y confirmar que no se importe `torch/transformers`.
- Si el arranque sigue lento: desacoplar inicialización de Chroma hasta primera petición de RAG (lazy init), o usar servicio vectorial remoto.