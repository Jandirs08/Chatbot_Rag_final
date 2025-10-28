# Reporte de Uso de Hugging Face en el Proyecto

## Resumen

Tras un análisis del código fuente del proyecto, **se confirma que sí se utilizan librerías y modelos de Hugging Face** en varias partes del sistema, principalmente para la generación de embeddings y procesamiento de lenguaje natural.

## Evidencias Encontradas

### 1. Dependencias en `requirements.txt`

```
langchain-huggingface==0.0.1
```

Esta dependencia permite la integración de modelos de Hugging Face con el framework LangChain.

### 2. Uso de Sentence Transformers

El proyecto utiliza la librería `sentence-transformers` de Hugging Face para generar embeddings:

```python
# En backend/rag/embeddings/embedding_manager.py
from sentence_transformers import SentenceTransformer

class EmbeddingManager:
    def __init__(self, model_name: str = "all-MiniLM-L6-v2"):
        """Inicializa el gestor de embeddings."""
        self.model = SentenceTransformer(model_name)
```

El modelo predeterminado utilizado es `all-MiniLM-L6-v2`, que es un modelo de Hugging Face.

### 3. Configuración del Modelo de Embeddings

En `backend/config.py` se configura el modelo de embeddings de Hugging Face:

```python
embedding_model: str = Field(default="sentence-transformers/all-MiniLM-L6-v2")
```

### 4. Importación de HuggingFaceEmbeddings

En varios archivos se importa y utiliza la clase `HuggingFaceEmbeddings` de LangChain:

```python
# En backend/rag/retrieval/retriever.py
from langchain_huggingface import HuggingFaceEmbeddings

# En backend/dev/performance_test.py
from langchain_community.embeddings import HuggingFaceEmbeddings
embedding_model = HuggingFaceEmbeddings(model_name=settings.embedding_model)

# En backend/dev/add_test_docs.py
from langchain_community.embeddings import HuggingFaceEmbeddings
embedding_model = HuggingFaceEmbeddings(model_name=settings.embedding_model)
```

### 5. Documentación en `inventario.md`

El archivo `Docs/inventario.md` menciona explícitamente el uso de Hugging Face:

```
| HuggingFace Hub | Descarga de modelo sentence-transformers (`backend/rag/embeddings/embedding_manager.py:12`) | Permitir salida a internet o cachear modelo en imagen. |
```

## Conclusión

El proyecto hace un uso significativo de tecnologías de Hugging Face, específicamente:

1. **Sentence Transformers** para la generación de embeddings
2. **Modelos preentrenados** del Hub de Hugging Face (all-MiniLM-L6-v2)
3. **Integración con LangChain** a través de langchain-huggingface

Por lo tanto, la mención de Hugging Face en el README.md es correcta y debe mantenerse.