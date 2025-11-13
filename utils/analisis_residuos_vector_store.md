# Análisis: “Residuos” en el Vector Store tras eliminar PDF o hacer `clear-rag`

Este documento explica por qué, después de eliminar un PDF desde la UI o ejecutar el endpoint de limpieza (`clear-rag`), el endpoint de estado (`rag-status`) sigue reportando que hay “residuos” en el vector store. Incluye causas raíz, qué sí está funcionando, riesgos y recomendaciones concretas de corrección.

## Resumen del comportamiento observado

- Tras `DELETE /pdf/{filename}` o `POST /rag/clear-rag`, la eliminación lógica de los embeddings se realiza correctamente.
- Sin embargo, `GET /rag-status` sigue mostrando que el vector store “existe” y con un tamaño de bytes mayor que 0.
- Esto es interpretado como residuos, pero en realidad es una consecuencia del enfoque usado para medir el estado del vector store.

## Causas raíz

1) Métrica de estado basada en tamaño físico del directorio
- En `backend/api/app.py`, el adaptador usado por `rag-status` calcula:
  - `path`: `self.vector_store.persist_directory`
  - `exists`: si el directorio existe
  - `size`: suma de todos los archivos en el directorio
- Esta métrica no refleja el número de documentos indexados, solo el tamaño del sistema de persistencia de Chroma.
- Chroma crea/usa `chroma.sqlite3` y otros archivos de sistema aunque no haya documentos.
- Por tanto, tras una limpieza, el tamaño nunca es estrictamente cero.

2) Documento “dummy” de inicialización
- En `backend/rag/vector_store/vector_store.py`, durante `_initialize_store()` si la colección está vacía se añade un documento dummy:
  - `metadatas=[{"source": "system", "is_dummy": true}]`
  - `ids=["system_dummy_doc"]`
- Se intenta eliminar un dummy previo al inicio, pero si la colección queda vacía se vuelve a añadir para evitar errores en búsquedas.
- Esto puede hacer que el `count()` sea 1 hasta que se agreguen documentos reales; además, el directorio de persistencia contiene archivos.

3) Validación post-limpieza basada en “size”
- En `backend/api/routes/rag/rag_routes.py` (endpoint `clear-rag`), el estado “parcial” se determina por:
  - `remaining_pdfs_count > 0` o `vector_store_size_after_clear > 0`
- Dado que el directorio de Chroma casi nunca queda con tamaño 0, este chequeo puede dar “warning” aunque la colección esté lógicamente vacía.

4) Eliminación de PDF por `source` funciona, pero no afecta al tamaño del sysdb
- `DELETE /pdf/{filename}` borra físicamente el archivo y luego llama:
  - `await rag_ingestor.vector_store.delete_documents(filter={"source": filename})`
- La ingesta establece `metadata['source'] = pdf_path.name` (ver `pdf_loader._postprocess_chunks`), por lo que el borrado lógico es correcto.
- Aun así, el sysdb de Chroma persiste y no reduce su tamaño a cero.

## Qué sí está funcionando

- El borrado lógico por `source` elimina todos los chunks del PDF objetivo:
  - `backend/api/routes/pdf/pdf_routes.py` → `delete_documents(filter={"source": filename})`.
- La limpieza total (`delete_collection`) borra la colección y el directorio y re‑inicializa el store:
  - `backend/rag/vector_store/vector_store.py` → `delete_collection()` llama a `client.delete_collection("rag_collection")`, borra el directorio, y luego `_initialize_store()`.
- La invalidación de caché se ejecuta en ambas rutas:
  - `_invalidate_cache()` limpia Redis (si está) o `_query_cache` en memoria.

## Riesgos y casos límite

- Concurrencia: si un PDF se está ingiriendo en segundo plano y se borra mientras tanto, podría haber re‑ingestas parciales. El endpoint de borrado elimina por `source`, pero no cancela tareas en curso.
- Sensibilidad a mayúsculas/minúsculas: el filtro `where={"source": filename}` necesita que el `filename` coincida exactamente con el usado en ingesta (`pdf_path.name`). En Windows la UI suele respetar el nombre exacto; si la UI altera el casing o añade rutas, podrían quedar entradas.
- Backups del sysdb: `_initialize_store()` puede mover el directorio a `..._backup_YYYYMMDD_hhmmss` si detecta incompatibilidad de esquema. Esos backups ocupan espacio físico fuera del directorio activo pero no afectan al conteo lógico.

## Recomendaciones de corrección (enfoque sugerido)

1) Cambiar `rag-status` para medir “documentos”, no “tamaño”
- En `PDFProcessorAdapter.get_vector_store_info()` devolver además:
  - `document_count`: `self.vector_store.store._collection.count()`
  - `dummy_present`: true/false si existe `is_dummy`
  - `is_empty`: `document_count == 0` o `document_count <= 1` excluyendo dummy
- En la respuesta de `rag-status`, usar `document_count` para UI y lógicas, no `size`.

2) Ajustar la validación de `clear-rag`
- Sustituir `vector_store_size_after_clear > 0` por `document_count_after_clear > 0` (excluyendo dummy).
- Esto evita falsos “warning” por el tamaño del sysdb de Chroma.

3) Opcional: eliminar el “dummy” en inicialización
- Si las rutas de recuperación ya manejan colección vacía correctamente, se puede retirar el dummy.
- Alternativamente, mantenerlo pero excluirlo explícitamente de conteos/visualizaciones.

4) Verificación con la utilidad incluida
- Ejecutar `backend/utils/inspect_vector_store.py` para auditar:
  - Muestra `Total de documentos` y omite el dummy en el listado.
  - Confirma vacíos lógicos incluso si hay archivos físicos.

## Referencias puntuales en el código

- `backend/api/app.py` → `PDFProcessorAdapter.get_vector_store_info()` usa `exists` y `size` del directorio.
- `backend/api/routes/rag/rag_routes.py` → `rag-status` y `clear-rag` (chequeo por tamaño).
- `backend/rag/vector_store/vector_store.py` → `_initialize_store()` (dummy y sysdb), `delete_collection()` (reinicialización física y lógica), `delete_documents()` (borrado por filtro).
- `backend/rag/pdf_processor/pdf_loader.py` → `_postprocess_chunks()` establece `metadata['source'] = pdf_path.name`.

## Comprobaciones rápidas

- Tras `POST /rag/clear-rag`, ejecutar la utilidad:
  - `python backend/utils/inspect_vector_store.py`
  - Esperado: `Total de documentos en la colección: 0` o 1 si hay dummy; listado vacío (se omite dummy).
- Tras `DELETE /pdf/{filename}` verificar:
  - `collection.get(where={"source": filename}).get("ids")` devuelve lista vacía.

## Conclusión

No hay un fallo de eliminación; el enfoque de estado se basa en el tamaño físico del directorio de Chroma, que nunca refleja “vacío” de manera fiable. Cambiando a una métrica de conteo lógico de documentos en la colección (y excluyendo el dummy) se alineará el `rag-status` con lo que el usuario espera ver y se eliminarán los falsos positivos de “residuos”.

---

### Anexo: snippet de cambio sugerido (conceptual)

En `backend/api/app.py`, dentro de `PDFProcessorAdapter`:

```python
class PDFProcessorAdapter:
    def __init__(self, pdf_manager, vector_store):
        self.pdf_manager = pdf_manager
        self.vector_store = vector_store

    def get_vector_store_info(self):
        path = str(self.vector_store.persist_directory)
        exists = self.vector_store.persist_directory.exists()
        size = 0
        if exists:
            try:
                size = sum(f.stat().st_size for f in self.vector_store.persist_directory.glob('**/*') if f.is_file())
            except Exception:
                pass
        # Nuevo: conteo lógico
        document_count = 0
        dummy_present = False
        try:
            collection = getattr(self.vector_store.store, '_collection', None)
            if collection:
                document_count = collection.count()
                docs = collection.get(where={"is_dummy": True})
                dummy_present = bool(docs.get("ids"))
        except Exception:
            pass
        return {
            "path": path,
            "exists": exists,
            "size": size,
            "document_count": document_count,
            "dummy_present": dummy_present,
            "is_empty": (document_count == 0) or (dummy_present and document_count <= 1)
        }
```

> Nota: el snippet es ilustrativo; no cambia el código en este commit.