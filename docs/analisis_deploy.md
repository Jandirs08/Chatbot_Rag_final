# Análisis de Deploy (Render) — Backend FastAPI

## 1) Análisis del Dockerfile

- Archivo revisado: `backend/Dockerfile`.
- Puerto: incluye `EXPOSE 8000` correctamente.
- Comando de arranque:
  - `CMD sh -c "python -m uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"`
  - Usa `${PORT:-8000}` para respetar la variable `PORT` de la plataforma (Render) y por defecto 8000 si no está definida.
- Directorio de trabajo: `WORKDIR /app/backend`. El módulo `main.py` define `app = create_app()`, por lo que `main:app` es válido.
- Observación adicional: el `Dockerfile` de la raíz (`./Dockerfile`) también expone `8000` y usa el mismo `CMD` apuntando a `main:app`. Asegurar cuál de los dos usa Render (ruta correcta en la configuración del servicio).

Conclusión: el Dockerfile del backend está correctamente configurado para exponer el puerto 8000 y arrancar `uvicorn` con `main:app` en `0.0.0.0`.

## 2) Análisis de logs de despliegue

- Archivo de logs encontrado: `./renders_log.md` (no existe `render_logs.log`; se usó el disponible).
- Mensajes relevantes detectados:
  - `==> No open ports detected, continuing to scan...` (repetido)
  - `==> Port scan timeout reached, no open ports detected. Bind your service to at least one port.`
- Logs de la aplicación dentro del contenedor muestran:
  - "Aplicación FastAPI creada y configurada exitosamente." y registro de routers, lo que indica que el código se carga.
  - No aparecen líneas típicas de `uvicorn` como "Uvicorn running on http://0.0.0.0:XXXX", lo que sugiere que el servidor no está quedando escuchando a tiempo o no se detecta el puerto por el escáner de Render.

Posibles causas:
- El servicio de Render no está configurado como "Web Service" (sino como "Background Worker").
- El comando de inicio configurado en Render está sobreescribiendo el `CMD` del Dockerfile y no está usando `--port $PORT`.
- Arranque pesado en `lifespan/startup` (carga de modelos/recursos) bloquea la apertura del socket; Render escanea puertos antes de que el servidor escuche.
- `PORT` no está disponible/inyectado correctamente en el entorno del contenedor; el servidor escucha en 8000 pero el escaneo no lo detecta (poco probable, Render escanea múltiples puertos pero depende de que el proceso quede realmente "listening").

## 3) Recomendaciones para Render

- Verificar tipo de servicio:
  - Debe ser "Web Service" (no "Background Worker").

- Asegurar el comando de inicio correcto:
  - Si Render usa Docker: dejar vacío el "Start command" para que se use el `CMD` del Dockerfile, o especificar: `uvicorn main:app --host 0.0.0.0 --port $PORT`.
  - Si Render usa servicio nativo (sin Docker):
    - Root Directory: `backend`
    - Build Command: `pip install --no-cache-dir -r requirements.txt`
    - Start Command: `uvicorn backend.main:app --host 0.0.0.0 --port $PORT`

- Respetar `PORT`:
  - No fijar el puerto a un valor distinto del inyectado por la plataforma.
  - Mantener `--host 0.0.0.0`.

- Reducir el tiempo de arranque antes de escuchar:
  - Mover tareas pesadas de `startup/lifespan` a tareas en segundo plano (`asyncio.create_task`) o inicialización diferida.
  - Pre-descargar modelos/recursos en build para evitar cold start (ej.: embeddings `sentence-transformers/all-MiniLM-L6-v2`).
    - Ejemplo de build step: `RUN python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('sentence-transformers/all-MiniLM-L6-v2')"`

- Observabilidad del servidor:
  - Establecer `LOG_LEVEL=INFO` y confirmar que aparecen logs de `uvicorn` indicando "running on" y "ASGI application startup complete".
  - Añadir Health Check en Render apuntando a `GET /api/v1/health`.

- Comprobaciones rápidas post-ajuste:
  - Validar que en los logs del deploy aparezca la línea de `uvicorn` con el puerto `$PORT`.
  - Probar el endpoint `GET /api/v1/health` desde el navegador o cURL.

## 4) Estado final

- Dockerfile: OK (EXPOSE 8000 y `CMD` con `uvicorn main:app` usando `${PORT:-8000}`).
- Logs de Render: muestran "No open ports detected"; foco en confirmar configuración del servicio y reducir el tiempo de apertura del puerto.
- Próximo paso recomendado: revisar la configuración en Render (tipo de servicio y comando de inicio) y simplificar el `startup` para asegurar que el servidor esté escuchando antes de que venza el escaneo de puertos.