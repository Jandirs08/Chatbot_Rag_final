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

# Copiar script de entrada al PATH y normalizar finales de línea
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN sed -i 's/\r$//' /usr/local/bin/entrypoint.sh && chmod +x /usr/local/bin/entrypoint.sh

# 🔧 Crear carpetas necesarias y dar permisos de escritura
RUN mkdir -p /app/storage/vector_store /app/storage/documents/pdfs && \
    chmod -R 777 /app/storage

# Exponer puerto
EXPOSE 8000

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
