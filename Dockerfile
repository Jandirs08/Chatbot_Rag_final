# Usa Ubuntu 22.04 LTS como base - completamente estable
FROM ubuntu:22.04

# Evita prompts interactivos durante la instalación
ENV DEBIAN_FRONTEND=noninteractive

# Establece el directorio de trabajo dentro del contenedor
WORKDIR /app

# Instala Python 3.11 y pip
RUN apt-get update && apt-get install -y --no-install-recommends \
    software-properties-common \
    && add-apt-repository ppa:deadsnakes/ppa \
    && apt-get update && apt-get install -y --no-install-recommends \
    python3.11 \
    python3.11-dev \
    python3.11-venv \
    python3-pip \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Crea un enlace simbólico para python
RUN ln -s /usr/bin/python3.11 /usr/bin/python

# Instala dependencias del sistema necesarias para las librerías Python
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    pkg-config \
    libpoppler-cpp-dev \
    libgl1-mesa-glx \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    libgomp1 \
    libgthread-2.0-0 \
    libjpeg-dev \
    libpng-dev \
    libtiff-dev \
    libfreetype6-dev \
    liblcms2-dev \
    libwebp-dev \
    zlib1g-dev \
    libharfbuzz-dev \
    libfribidi-dev \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Establece variables de entorno para Python
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PORT=8000
ENV HOST=0.0.0.0

# Copia solo el archivo de requerimientos para aprovechar el cache de Docker
COPY backend/requirements.txt .

# Instala las dependencias de Python
RUN pip install --no-cache-dir --upgrade pip setuptools wheel \
    && pip install --no-cache-dir -r requirements.txt

# spaCy deshabilitado: no instalar modelos por ahora

# El código de la aplicación se montará como un volumen en docker-compose
# Expone el puerto que usará la aplicación
EXPOSE 8000

# Comando por defecto (puede ser sobreescrito por docker-compose)
CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]