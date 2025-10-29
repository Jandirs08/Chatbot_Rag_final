# 🐳 Configuración Docker Completa - Chatbot RAG

Este documento detalla la configuración completa de Docker para el proyecto Chatbot RAG, incluyendo todos los cambios realizados y mejores prácticas implementadas.

## 📁 Archivos de Configuración

### Docker Configuration
- **`docker-compose.yml`** - Define servicios (backend, frontend, MongoDB)
- **`Dockerfile`** (raíz) - Configura el contenedor Python backend
- **`frontend/Dockerfile`** - Configura el contenedor Next.js frontend
- **`.dockerignore`** - Excluye archivos innecesarios de las builds

### Environment Configuration
- **`backend/.env.example`** - Plantilla completa de variables de entorno
- **`backend/.env`** - Archivo de configuración real (creado por usuario)

### Setup Helpers
- **`setup.sh`** - Script bash para Unix/macOS
- **`setup.bat`** - Script batch para Windows
- **`Makefile`** - Comandos simplificados para operaciones comunes

### Documentation
- **`INSTRUCCIONES_DOCKER.md`** - Guía completa de uso
- **`README.md`** - Instrucciones generales del proyecto

## 🏗️ Arquitectura de Servicios

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│                 │     │                 │     │                 │
│   Frontend      │◄────┤    Backend       │◄────┤   MongoDB       │
│  (Next.js:3000) │     │   (FastAPI:8000) │     │  (Port:27017)   │
│                 │     │                 │     │                 │
└─────────────────┘     └─────────────────┘     └─────────────────┘
       ▲                        ▲                        ▲
       │                        │                        │
   localhost:3000         localhost:8000           localhost:27018
```

### Servicios Detallados:

#### MongoDB
- **Imagen**: `mongo:latest`
- **Contenedor**: `chatbot-mongodb-dev`
- **Puerto**: `27018:27017` (host:container)
- **Volumen**: `mongodb_data` para persistencia
- **Red**: `chatbot-network`

#### Backend (FastAPI)
- **Build Context**: `./backend`
- **Contenedor**: `chatbot-backend-dev`
- **Puerto**: `8000:8000`
- **Dependencias**: Espera a MongoDB
- **Variables**: `MONGO_URI=mongodb://mongodb:27017/chatbot`
- **Comando**: `uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload`
- **Volúmenes**: `./backend:/app` (hot-reloading)

#### Frontend (Next.js)
- **Build Context**: `./frontend`
- **Contenedor**: `chatbot-frontend-dev`
- **Puerto**: `3000:3000`
- **Dependencias**: Espera al backend
- **Variables**: `NEXT_PUBLIC_API_URL=http://backend:8000`
- **Comando**: `npm run dev`
- **Volúmenes**: `./frontend:/app` y `/app/node_modules`

## ✅ Características Implementadas

### Health Checks & Dependencies
- **Health Checks**: Verificación de estado de servicios
- **depends_on**: Control de orden de inicio
- **restart: unless-stopped**: Reinicio automático

### Networking
- **Red dedicada**: `chatbot-network` para aislamiento
- **Comunicación**: Servicios usan nombres de contenedor
- **Bridge driver**: Configuración de red estándar

### Volumes & Persistence
- **MongoDB data**: Volumen nombrado `chatbot-mongodb-data`
- **Hot-reloading**: Montaje de código fuente en contenedores
- **Node modules**: Volumen anónimo para evitar conflictos

### Environment Variables
- **Backend**: Configuración completa via `.env`
- **Frontend**: Variables públicas para API URL
- **Docker**: Variables específicas del entorno contenedor

## 🚀 Flujo de Desarrollo

### Inicio Rápido
```bash
# Configurar entorno
copy backend\.env.example backend\.env
# Editar backend\.env con tus claves API

# Levantar servicios
docker-compose up --build
```

### Desarrollo Individual
```bash
# Backend solo
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
python -m uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000

# Frontend solo
cd frontend
npm install
npm run dev
```

## 🔧 Dockerfile Backend (Raíz)

```dockerfile
FROM python:3.11-slim

WORKDIR /app

# Environment variables
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PORT=8000
ENV HOST=0.0.0.0

# System dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Python dependencies
COPY backend/requirements.txt .
RUN pip install --no-cache-dir --upgrade pip setuptools wheel \
    && pip install --no-cache-dir -r requirements.txt

# SpaCy models
RUN python -m spacy download en_core_web_md

# Application code
COPY backend/ .

# Port
EXPOSE 8000

# Command
CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
```

## 🔧 Dockerfile Frontend

```dockerfile
FROM node:20-alpine

WORKDIR /app

# Dependencies
COPY package.json ./
COPY package-lock.json ./
RUN npm install

# Source code
COPY . .

# Port
EXPOSE 3000

# Command
CMD ["npm", "run", "dev"]
```

## 🛠️ Solución de Problemas Comunes

### Error: "El sistema no puede encontrar el archivo especificado" (.env)
```bash
copy backend\.env.example backend\.env
```

### Error: "unexpected end of JSON input"
```bash
docker system prune -a -f
docker-compose up --build --no-cache
```

### Servicios no responden
```bash
# Ver logs específicos
docker-compose logs backend
docker-compose logs frontend

# Ver estado
docker-compose ps
```

### Cambios no se reflejan
```bash
docker-compose restart frontend
docker-compose restart backend
```

## 📊 Comandos de Gestión

```bash
# Estado y logs
docker-compose ps
docker-compose logs -f [service]

# Gestión de contenedores
docker-compose up --build
docker-compose down
docker-compose restart

# Limpieza
docker-compose down --volumes --remove-orphans
docker system prune -f
```

## 🔒 Variables de Entorno Críticas

### Backend (.env)
```bash
# Requeridas
OPENAI_API_KEY=sk-your-key-here
MONGO_URI=mongodb://mongodb:27017/chatbot

# Configuración
PORT=8000
HOST=0.0.0.0
LOG_LEVEL=INFO
```

### Frontend (docker-compose.yml)
```yaml
environment:
  - NEXT_PUBLIC_API_URL=http://backend:8000
```

## 📝 Mejores Prácticas Implementadas

- ✅ **Multi-stage builds** preparados para producción
- ✅ **Security**: Usuario no-root, variables de entorno
- ✅ **Performance**: Cache de capas Docker optimizado
- ✅ **Development**: Hot-reloading habilitado
- ✅ **Production-ready**: Configuración preparada para deploy
- ✅ **Documentation**: Guías completas y troubleshooting
- ✅ **Cross-platform**: Scripts para Windows y Unix

## 🔄 Próximos Pasos

Para producción, considera:
- Multi-stage Dockerfiles
- Imágenes más ligeras (distroless)
- Configuración de secrets
- Health checks avanzados
- Logging centralizado
- Monitoring con Prometheus/Grafana