# Evaluacion E2E del RAG

Esta carpeta contiene una suite E2E que usa el backend real:

1. Hace login por API.
2. Limpia el corpus RAG actual.
3. Genera un PDF de prueba a partir del corpus Markdown.
4. Sube el PDF al endpoint real de ingesta.
5. Espera confirmacion de disponibilidad.
6. Ejecuta preguntas del dataset contra el endpoint real de chat.
7. Audita retrieval con el endpoint `retrieve-debug`.
8. Emite un reporte JSON y un resumen por consola.

## Archivos

- `corpus/manual_eval_rag.md`: corpus base editable.
- `datasets/rag_e2e_cases.json`: preguntas y expectativas.
- `prepare_eval_corpus.py`: convierte el Markdown en PDF.
- `run_rag_e2e_eval.py`: runner principal.
- `pdf_text_writer.py`: generador PDF sin dependencias externas.
- `sse_client.py`: parser de SSE para el endpoint de chat.
- `scorers.py`: reglas de evaluacion.

## Variables de entorno recomendadas

```powershell
$env:RAG_EVAL_BASE_URL="http://127.0.0.1:8000"
$env:RAG_EVAL_EMAIL="tu_correo"
$env:RAG_EVAL_PASSWORD="tu_password"
```

## Preparar el PDF

```powershell
python backend/tests/evals/prepare_eval_corpus.py
```

Esto genera:

- `backend/tests/evals/generated/manual_eval_rag.pdf`

## Ejecutar la evaluacion completa

```powershell
python backend/tests/evals/run_rag_e2e_eval.py
```

## Habilitar Ragas

Instala las dependencias opcionales:

```powershell
python -m pip install -r backend/requirements-evals.txt
```

Luego ejecuta:

```powershell
python backend/tests/evals/run_rag_e2e_eval.py --with-ragas
```

Ragas usara `OPENAI_API_KEY`. Si tu clave vive en `backend/.env`, el integrador intenta cargarla automaticamente.

## Opciones utiles

```powershell
python backend/tests/evals/run_rag_e2e_eval.py --help
python backend/tests/evals/run_rag_e2e_eval.py --keep-corpus
python backend/tests/evals/run_rag_e2e_eval.py --skip-clear-before
python backend/tests/evals/run_rag_e2e_eval.py --case c018
python backend/tests/evals/run_rag_e2e_eval.py --limit 5
python backend/tests/evals/run_rag_e2e_eval.py --skip-retrieval-audit
python backend/tests/evals/run_rag_e2e_eval.py --with-ragas --ragas-model gpt-4o-mini
```

## Requisitos operativos

- El backend debe estar levantado y accesible.
- El usuario debe poder autenticarse.
- Qdrant y MongoDB deben estar disponibles.
- El bot debe estar activo.

## Notas

- El runner limpia el RAG antes de cargar el corpus, salvo que uses `--skip-clear-before`.
- Por defecto limpia de nuevo al terminar, salvo que uses `--keep-corpus`.
- Los reportes se generan en `backend/tests/evals/reports/`.
