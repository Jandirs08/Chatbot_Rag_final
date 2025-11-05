# Levantar en local (sin Docker)

Esta guía explica cómo arrancar el backend (FastAPI/Uvicorn) y el frontend (Next.js) directamente en tu máquina.

## Puertos
- Frontend dev: `http://localhost:3000`
- Backend dev: `http://localhost:8000` (recomendado para alinearse con el frontend)
  - Documentación OpenAPI: `http://localhost:8000/docs`

> Nota: si prefieres `8080`, ajusta las variables del frontend para apuntar a `http://localhost:8080`.

## Prerrequisitos
- Python 3.11 (o compatible) y `pip`.
- Node.js 18+ y `npm` (o `yarn`).
- MongoDB local (opcional) o un URI válido en `backend/.env`.

## Backend (FastAPI)
1. Copia y configura variables de entorno:
   - `cd backend`
   - Copia `backend/.env.example` a `backend/.env`
   - Asegúrate de definir `MONGO_URI` (p. ej. `mongodb://localhost:27017/chatbot_rag_db`) y tus claves API.
2. Crea y activa un entorno virtual:
   - Windows:
     - `python -m venv venv`
     - `venv\Scripts\activate`
   - macOS/Linux:
     - `python -m venv venv`
     - `source venv/bin/activate`
3. Instala dependencias:
   - `pip install -r requirements.txt`
4. Arranca el servidor en `8000`:
   - `python -m uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000`

> Alternativa (si usas 8080): `python -m uvicorn backend.main:app --reload --host 0.0.0.0 --port 8080`

## Frontend (Next.js)
1. Configura variables de entorno del cliente (si aplican):
   - En `frontend/.env` (o `.env.local`), define:
     - `NEXT_PUBLIC_API_BASE_URL=http://localhost:8000`
     - `NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1`
   - Si el backend corre en `8080`, usa `http://localhost:8080` en ambas.
2. Instala dependencias y arranca:
   - `cd frontend`
   - `npm install`  (o `yarn install`)
   - `npm run dev`  (o `yarn dev`)

El frontend quedará accesible en `http://localhost:3000`.

## Verificación rápida
- Backend: abre `http://localhost:8000/docs` y prueba un endpoint.
- Frontend: carga `http://localhost:3000` y verifica que las llamadas apunten al backend correcto.

## Problemas comunes
- Puertos ocupados: cambia `--port` en Uvicorn o usa `NEXT_PUBLIC_*` con el puerto nuevo.
- Variables faltantes: revisa `backend/.env` y `frontend/.env`/`.env.local`.
- MongoDB no disponible: ajusta `MONGO_URI` a una instancia accesible (local o remota).