FROM python:3.11

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Instala dependencias
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copia el resto del código
COPY . .

# 🔧 Crear carpetas necesarias y dar permisos de escritura
RUN mkdir -p /app/storage/vector_store /app/storage/documents/pdfs && \
    chmod -R 777 /app/storage

# Exponer puerto
EXPOSE 8000

# Comando de ejecución
CMD ["sh", "-c", "python -m uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
