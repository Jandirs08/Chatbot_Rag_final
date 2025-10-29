# 🚀 Guía Completa de Docker para Chatbot RAG

Esta guía unificada explica cómo configurar y ejecutar el proyecto Chatbot RAG en un entorno de desarrollo local utilizando Docker y Docker Compose.

## ✅ Prerrequisitos

- **Docker Desktop**: Asegúrate de tener Docker Desktop instalado y ejecutándose
- **Docker Compose**: Viene incluido con Docker Desktop
- **Git**: Para clonar el repositorio

## ⚙️ Configuración Inicial

### 1. Clonar el repositorio
```bash
git clone [URL_DEL_REPO]
cd [NOMBRE_DEL_PROYECTO]
```

### 2. Configurar variables de entorno

**Backend:**
```bash
# Copiar archivo de ejemplo
copy backend\.env.example backend\.env
```

Edita `backend/.env` y configura las variables críticas:
- `OPENAI_API_KEY`: Tu clave de OpenAI
- `MONGO_URI`: Ya configurado para Docker (mongodb://mongodb:27017/chatbot)
- `PORT`: 8000 (consistente con Docker)
- `HOST`: 0.0.0.0

**Frontend:**
No requiere configuración adicional - la URL del backend se configura en `docker-compose.yml`.

## 🚀 Levantar el Entorno de Desarrollo

### Comando principal:
```bash
docker-compose up --build
```

Este comando:
- Construye las imágenes de backend y frontend
- Inicia MongoDB, backend y frontend
- Habilita hot-reloading para desarrollo
- Monta volúmenes para cambios en tiempo real

### Servicios disponibles:
- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:8000
- **API Docs**: http://localhost:8000/docs
- **MongoDB**: localhost:27018 (desde host)

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

### Características del setup:
- ✅ **Hot-reloading**: Cambios automáticos sin reconstruir
- ✅ **Red dedicada**: Servicios se comunican por nombre
- ✅ **Volúmenes persistentes**: Datos de MongoDB sobreviven restarts
- ✅ **Dependencias**: Frontend espera al backend
- ✅ **Variables de entorno**: Configuración externa

## 🛑 Gestión del Entorno

### Detener servicios:
```bash
# Solo detener (presiona Ctrl+C en terminal activa)
docker-compose down
```

### Limpiar completamente:
```bash
# Detener y eliminar contenedores + redes
docker-compose down --volumes --remove-orphans

# Limpiar imágenes no utilizadas
docker system prune -f
```

### Reiniciar servicios:
```bash
# Reconstruir y reiniciar
docker-compose up --build --force-recreate
```

## 🔧 Solución de Problemas

### Problema: "El sistema no puede encontrar el archivo especificado" (.env)
**Solución:** Copia el archivo de ejemplo:
```bash
copy backend\.env.example backend\.env
```

### Problema: "unexpected end of JSON input"
**Solución:** Limpia imágenes corruptas:
```bash
docker system prune -a -f
docker-compose up --build --no-cache
```

### Problema: Servicios no responden
**Solución:** Verifica logs:
```bash
docker-compose logs [servicio]
# Ejemplos:
docker-compose logs backend
docker-compose logs frontend
docker-compose logs mongodb
```

### Problema: Cambios no se reflejan
**Solución:** Los volúmenes están montados para hot-reloading. Si no funciona:
```bash
docker-compose restart frontend
# o
docker-compose restart backend
```

## 📊 Comandos Útiles

```bash
# Ver estado de servicios
docker-compose ps

# Ver logs en tiempo real
docker-compose logs -f

# Acceder a contenedor
docker-compose exec backend bash
docker-compose exec frontend sh

# Ver uso de recursos
docker stats

# Inspeccionar redes
docker network ls
docker network inspect chatbot-network
```

## 🔒 Variables de Entorno Críticas

Asegúrate de configurar estas variables en `backend/.env`:

```bash
# Requeridas
OPENAI_API_KEY=sk-your-key-here
MONGO_URI=mongodb://mongodb:27017/chatbot

# Opcionales pero recomendadas
LOG_LEVEL=INFO
DEBUG=True
```

## 📝 Notas de Desarrollo

- El setup está optimizado para desarrollo con hot-reloading
- Para producción, necesitarías ajustar los Dockerfiles y comandos
- Los datos de MongoDB persisten en volúmenes nombrados
- El frontend se comunica con el backend usando el nombre del servicio (`http://backend:8000`)
