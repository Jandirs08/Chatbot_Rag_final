"""Main entry point for the chatbot application."""
import os
import signal
import sys
from dotenv import load_dotenv
import uvicorn
import logging
from pathlib import Path
import asyncio

# Configurar logging básico temprano para mensajes de inicialización
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
temp_logger = logging.getLogger(__name__)

# Cargar variables de entorno PRIMERO
env_path = Path(__file__).resolve().parent / '.env' # .resolve() para mayor robustez
if env_path.exists():
    load_dotenv(env_path)
    temp_logger.info(f"[INIT] Variables de entorno cargadas desde: {env_path}")
else:
    temp_logger.warning(f"[INIT] Archivo .env no encontrado en: {env_path}. Asegúrate de que las variables de entorno están configuradas externamente si es necesario.")

# Importar create_app después de cargar .env, ya que config.py podría usar las variables.
from api.app import create_app  # Importar desde paquete raíz dentro de /app en Docker
from config import settings  # Ajuste de import para entorno Docker

# La configuración de logging, la verificación de API key y el registro de routers
# se han movido a api/app.py dentro de create_app().

# Inicializar el logger para este módulo después de que basicConfig haya sido llamado en create_app
# Esto significa que create_app() debe ser llamado antes de que este logger se use extensivamente.
# O, si es necesario loguear antes, el formato será el default de Python.

def handle_exit(signum, frame):
    """Manejador de señales para una limpieza ordenada."""
    temp_logger.info("[SHUTDOWN] Cerrando servidor...")
    sys.exit(0)

# Registrar manejadores de señales
signal.signal(signal.SIGINT, handle_exit)
signal.signal(signal.SIGTERM, handle_exit)

# Crear la aplicación FastAPI
# Cualquier error crítico de inicialización (como API keys faltantes) debería ocurrir dentro de create_app()
# y detener el proceso allí si es necesario.
try:
    app = create_app()
    # Solo ahora el logger de la aplicación está completamente configurado.
    logger = logging.getLogger(__name__) # Obtener logger después de la inicialización en create_app
    logger.info("[INIT] Aplicación FastAPI creada exitosamente desde main.py.")
except ValueError as e:
    # Capturar errores de configuración críticos como ValueError de la API Key
    temp_logger.error(f"[ERROR] Error CRÍTICO al crear la aplicación FastAPI: {e}. El servidor no puede iniciar.")
    # Salir si la app no se pudo crear debido a un error fatal de configuración.
    sys.exit(1)
except Exception as e:
    temp_logger.error(f"[ERROR] Una excepción inesperada ocurrió al crear la aplicación FastAPI: {e}. El servidor no puede iniciar.")
    sys.exit(1)

if __name__ == "__main__":
    # El logger aquí ya debería estar configurado por create_app()
    if 'logger' not in locals(): # En caso de que create_app falle antes de definir su logger
        logging.basicConfig(level=logging.INFO) # Fallback básico
        logger = logging.getLogger(__name__)
        
    # *** DEBUG: Limpiar Vector Store al inicio si una variable de entorno está configurada ***
    if os.environ.get("CLEAR_VECTOR_STORE") == "true":
        logger.warning("[DEBUG] CLEAR_VECTOR_STORE=true detectado. Limpiando Vector Store antes de iniciar.")
        logger.warning("[DEBUG] La limpieza async al inicio requiere cambios en create_app o una ejecución separada.")
        logger.warning("[DEBUG] Por favor, considere añadir la lógica de limpieza condicional dentro de create_app o ejecutarla manualmente con un script async.")
    
    # Configurar el bucle de eventos de asyncio
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    
    try:
        logger.info(f"[SERVER] Iniciando servidor Uvicorn en http://{settings.host}:{settings.port}")
        uvicorn.run(
            app,
            host=settings.host,
            port=settings.port,
            log_level=settings.log_level.lower(),
            loop=loop
        )
    except KeyboardInterrupt:
        logger.info("[SERVER] Servidor detenido por interrupción del usuario")
    except Exception as e:
        logger.error(f"[SERVER] Error al iniciar el servidor: {e}")
    finally:
        # Limpiar recursos
        try:
            loop.run_until_complete(app.state.chat_manager.close())
            loop.close()
            logger.info("[CLEANUP] Recursos limpiados exitosamente")
        except Exception as e:
            logger.error(f"[CLEANUP] Error al limpiar recursos: {e}")