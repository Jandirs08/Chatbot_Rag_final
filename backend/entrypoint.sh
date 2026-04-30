#!/bin/bash
# =============================================================================
# ENTRYPOINT - Detecta modo desarrollo o producción
# =============================================================================
# ENVIRONMENT=development → uvicorn con --reload (1 worker, hot-reload)
# ENVIRONMENT=production  → gunicorn con N workers (sin reload, optimizado).
#                            Default WORKERS=1 para coherencia de métricas
#                            in-memory (MetricsCollector). Subir a 2-4 si
#                            tu carga lo justifica (>30 chats/min sostenido).
# =============================================================================

set -e

# Valores por defecto
HOST="${HOST:-0.0.0.0}"
PORT="${PORT:-8000}"
WORKERS="${WORKERS:-1}"

echo "========================================"
echo "  CHATBOT RAG BACKEND"
echo "  Environment: ${ENVIRONMENT:-development}"
echo "  Host: $HOST | Port: $PORT"
echo "========================================"

if [ "$ENVIRONMENT" = "production" ]; then
    echo "🚀 Iniciando en modo PRODUCCIÓN con $WORKERS workers..."
    exec gunicorn main:app \
        --worker-class uvicorn.workers.UvicornWorker \
        --workers "$WORKERS" \
        --bind "$HOST:$PORT" \
        --timeout 120 \
        --keep-alive 5 \
        --access-logfile - \
        --error-logfile -
else
    echo "🔧 Iniciando en modo DESARROLLO con hot-reload..."
    exec uvicorn main:app \
        --host "$HOST" \
        --port "$PORT" \
        --reload
fi
