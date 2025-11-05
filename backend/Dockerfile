# Usa imagen base de Python con herramientas de compilación incluidas
# python:3.11 (no slim) ya incluye herramientas de compilación básicas
FROM python:3.11

# Establece el directorio de trabajo dentro del contenedor
WORKDIR /app

# Establece variables de entorno para Python
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Copia solo el archivo de requerimientos para aprovechar el cache de Docker
COPY requirements.txt .

# Instala las dependencias de Python
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copiar el código de la aplicación (necesario en Render; en docker-compose local se monta como volumen)
COPY . .

# Expone el puerto que usará la aplicación
EXPOSE 8000

# Comando para arrancar la aplicación
# Render inyectará el valor de PORT aquí.
CMD ["python", "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "${PORT:-8000}"]