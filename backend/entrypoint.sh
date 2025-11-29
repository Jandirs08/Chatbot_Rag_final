#!/bin/sh
# Si PORT no está definido, usar 8000
PORT="${PORT:-8000}"
if [ "$ENVIRONMENT" = "production" ]; then
    echo "🚀 Iniciando en modo PRODUCCIÓN con Gunicorn..."
    # Usar Gunicorn con Uvicorn workers para concurrencia real
    exec gunicorn main:app --workers 4 --worker-class uvicorn.workers.UvicornWorker --bind 0.0.0.0:$PORT
else
    echo "🛠️ Iniciando en modo DESARROLLO con Reload..."
    # Usar Uvicorn directo con reload para desarrollo
    exec python -m uvicorn main:app --host 0.0.0.0 --port $PORT --reload
fi
