# Playbook de Despliegue: Chatbot v1.0

## 1. Resumen de Cambios Críticos
- Seguridad: se eliminó una contraseña por defecto hardcodeada en `docs/scripts/runtime_validation.py` (ahora requiere `ADMIN_PASSWORD`).
- Backend: se añadió soporte para `CLIENT_ORIGIN_URL` y se endureció CORS en producción.
- Backend: `MONGO_URI` migra a `MONGODB_URI` con fallback para compatibilidad.
- Backend: `uvicorn` ahora lee `PORT` desde entorno y usa `host="0.0.0.0"`.
- Frontend: se unificaron las llamadas a la API para usar `NEXT_PUBLIC_API_URL` (refactor en `app/lib/services/ragService.ts`).
- Frontend: `app/lib/constants.ts` reexporta desde `app/lib/config.ts` para mantener una única fuente de verdad.

## 2. Plan de Acción (Variables de Entorno)

### Backend (Para Render)
- `MONGODB_URI`: Cadena de conexión de MongoDB Atlas.
- `CLIENT_ORIGIN_URL`: URL pública de tu frontend en Vercel (ej: `https://mi-chat.vercel.app`).
- `PORT`: Render la inyecta automáticamente; el código la utiliza al arrancar.
- `ENVIRONMENT`: Establecer en `production` para entorno productivo.
- `OPENAI_API_KEY`: Clave de API del proveedor LLM (obligatoria si `MODEL_TYPE=OPENAI`).
- `JWT_SECRET`: Secreto para firmar JWT (obligatorio en producción).
- Opcionales según necesidad:
  - `CORS_ORIGINS`, `CORS_ORIGINS_WIDGET`, `CORS_ORIGINS_ADMIN`: listas de orígenes adicionales.
  - `MODEL_TYPE`, `BASE_MODEL_NAME`, `MAX_TOKENS`, `TEMPERATURE`: parámetros del modelo.

### Frontend (Para Vercel)
- `NEXT_PUBLIC_API_URL`: URL pública del backend en Render (ej: `https://mi-api.onrender.com/api/v1`).
- Opcional: `NEXT_PUBLIC_WIDGET_URL` si se usa el widget embebido.

## 3. Checklist de Despliegue

1. [ ] Crear clúster en MongoDB Atlas, obtener la `MONGODB_URI` y poner mi IP actual en la lista de acceso.
2. [ ] Desplegar Backend en Render, añadir las variables de entorno de la lista anterior.
3. [ ] Obtener la URL pública de Render (ej. `mi-api.onrender.com`).
4. [ ] Desplegar Frontend en Vercel, añadir la variable `NEXT_PUBLIC_API_URL` con la URL de Render (incluye `/api/v1`).
5. [ ] Obtener la URL pública de Vercel (ej. `mi-chat.vercel.app`).
6. [ ] (Importante) Volver a Render y actualizar la variable `CLIENT_ORIGIN_URL` con la URL de Vercel para que CORS funcione.
7. [ ] En MongoDB Atlas, cambiar la lista de acceso de "Mi IP" a "Permitir acceso desde cualquier lugar" (`0.0.0.0/0`) para que Render pueda conectarse.

## 4. Puntos Críticos a Optimizar (Próximos Pasos)
- Índices adicionales: añadir índice en la colección `messages` por `user_id` si se realizan consultas filtradas por usuario.
- Docker: optimizar `Dockerfile` del backend con multi-stage builds y caching de dependencias.
- Errores en endpoints: fortalecer manejo de errores en `/chat/stream_log` y rutas de PDF (validación y respuestas consistentes).