He añadido un script end‑to‑end para validar el flujo RAG: login, estado, subir/borrar PDFs, limpiar el vector store y auditar retrieve.

Qué hace

- Autentica y verifica que el usuario sea admin.
- Lista PDFs y muestra el estado del RAG ( /rag-status ).
- Opcionalmente limpia todo ( /clear-rag ) al inicio.
- Opcionalmente sube un PDF (multipart), espera a que aparezca en /pdfs/list y fuerza reindexación síncrona.
- Ejecuta /rag/retrieve-debug con y sin filtro por source para ver si hay “esquirlas”.
- Borra el PDF, espera a que el retrieve filtrado quede vacío, y vuelve a limpiar el vector store para asegurar que no queden restos.
- Imprime un resumen final (con o sin documentos).
Archivo creado

- utils/rag/validate_rag_flow.py
Uso

- Variables de entorno opcionales: BASE_URL , AUTH_EMAIL , AUTH_PASSWORD .
- Ejemplos:
  - Solo validar estado y retrieve sin tocar nada:
    - python utils/rag/validate_rag_flow.py --email tu@admin.com --password ******
  - Limpiar todo al inicio y luego probar retrieve:
    - python utils/rag/validate_rag_flow.py --clear-first --email tu@admin.com --password ******
  - Subir un PDF, probar retrieve, borrar y verificar que no quedan esquirlas:
    - python utils/rag/validate_rag_flow.py --pdf ./docs/ejemplo.pdf --email tu@admin.com --password ******
- Opciones:
  - --base-url por defecto http://localhost:8000
  - --query texto para retrieve-debug (por defecto “Prueba de recuperación”)
  - --timeout segundos de espera para indexación/borrado (por defecto 45)
  - --clear-first limpia vector store y PDFs al inicio
Detalles técnicos relevantes

- Subida de PDF con multipart/form-data usando estándar de la librería urllib (sin dependencias externas).
- Tras subir, se hace polling hasta que el archivo aparece en /api/v1/pdfs/list .
- Se intenta reindexar síncronamente el PDF con /api/v1/rag/reindex-pdf para asegurar chunks.
- Borrado: DELETE /api/v1/pdfs/{filename} y polling en retrieve-debug con filtro {"source": filename} hasta que no existan resultados; luego clear-rag para garantizar limpieza total.
- El vector store usa metadata source: <filename> y el borrado con filtro elimina por ese campo; el script verifica este comportamiento.
Cómo comprobar si hay “esquirlas”

- Con un PDF subido:
  - retrieve-debug sin filtro debería retornar documentos; con filtro source=<tu_pdf> verás específicamente chunks del PDF.
- Tras borrar el PDF y limpiar:
  - retrieve-debug filtrado por source=<tu_pdf> debe retornar 0.
  - retrieve-debug general idealmente retorna 0; si no, quedaría otro contenido (p.e. el dummy inicial se elimina y se re‑crea solo si la colección queda vacía, pero no debería aparecer en retrieve filtrado por tu source ).
- El resumen final muestra rag_status_final con pdfs y vector_store .
Si sigue respondiendo como si el PDF existiera

- Ejecuta el script con --pdf y observa:
  - Resultados de retrieve-debug filtrado tras el borrado.
  - clear-rag y polling hasta vacío.
- Si después de borrar y limpiar aún hay resultados:
  - Puede ser caché de RAG (el script invalida al eliminar, pero si hay Redis activo y TTL, podría persistir brevemente).
  - Puede existir otro PDF con contenido similar. Revisa list_pdfs y rag-status .
  - Comparte el output del script para revisar qué endpoints siguen reportando contenido