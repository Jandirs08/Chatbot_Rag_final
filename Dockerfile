FROM python:3.11-slim

ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV HOST=0.0.0.0

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    pkg-config \
    libpoppler-cpp-dev \
    libgl1 \
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

WORKDIR /app/backend

COPY backend/requirements.txt ./requirements.txt

RUN pip install --no-cache-dir --upgrade pip setuptools wheel \
    && pip install --no-cache-dir -r requirements.txt

COPY backend/ .

RUN useradd --system --no-create-home --shell /bin/false appuser \
    && chown -R appuser:appuser /app

USER appuser

EXPOSE 8000

CMD sh -c "python -m uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"
