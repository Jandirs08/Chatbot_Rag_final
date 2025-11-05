# Levantar contenedores con Docker

## Requisitos
- Docker Desktop y Docker Compose v2 (comando `docker compose`).
- Puertos libres: `3000` (frontend), `8000` (backend), `27018` (MongoDB host).

## Preparación
- Backend: copia `backend/.env.example` a `backend/.env` y completa variables (p. ej. claves API, `MONGO_URI`).
- Frontend: si usas variables en cliente, crea `frontend/.env` con al menos:
  - `NEXT_PUBLIC_API_BASE_URL=http://localhost:8000`
  - `NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1`

## Servicios y puertos
- Frontend (Next.js dev): `http://localhost:3000`
- Backend (FastAPI): `http://localhost:8000`
  - Documentación OpenAPI: `http://localhost:8000/docs`
- MongoDB en host: `localhost:27018` (mapea al `27017` del contenedor)

## Arranque rápido
Desde la raíz del repo (`c:\Chatbot-final-jandir\Chatbot_Rag_final`):

```bash
docker compose up -d --build
```

Ver estado y logs:

```bash
docker compose ps
docker compose logs -f backend
docker compose logs -f frontend
docker compose logs -f mongodb
```

## Ciclo de vida
- Reiniciar con reconstrucción:

```bash
docker compose up -d --build
```

- Parar contenedores (conservar volúmenes):

```bash
docker compose down
```

- Parar y borrar volúmenes (resetea datos):

```bash
docker compose down -v
```

- Reconstruir/levantar un servicio específico:

```bash
docker compose build backend
docker compose up -d backend
```

## Notas
- El backend se inicia con Uvicorn en `0.0.0.0:8000` con recarga (`--reload`).
- El frontend usa variables `NEXT_PUBLIC_*` para apuntar al backend; asegúrate de que correspondan a los puertos expuestos.
- Si `3000` o `8000` están ocupados en tu máquina, ajusta los mapeos en `docker-compose.yml`.