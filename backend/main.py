"""Main entry point for the chatbot application."""
import os
import signal
import sys
from dotenv import load_dotenv
import uvicorn
import logging
from pathlib import Path
import asyncio

# Cargar variables de entorno PRIMERO
env_path = Path(__file__).resolve().parent / '.env' # .resolve() para mayor robustez
if env_path.exists():
    load_dotenv(env_path)
    # El logger aquí aún no está configurado con el formato de la app,
    # así que un print puede ser más fiable para este punto temprano.
    print(f"Variables de entorno cargadas desde: {env_path}")
else:
    print(f"Archivo .env no encontrado en: {env_path}. Asegúrate de que las variables de entorno están configuradas externamente si es necesario.")

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
    print("\nCerrando servidor...")
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
    logger.info("Aplicación FastAPI creada exitosamente desde main.py.")
except ValueError as e:
    # Capturar errores de configuración críticos como ValueError de la API Key
    # El logger aquí podría no estar formateado como se espera si create_app falló muy temprano.
    print(f"Error CRÍTICO al crear la aplicación FastAPI: {e}. El servidor no puede iniciar.")
    # Salir si la app no se pudo crear debido a un error fatal de configuración.
    sys.exit(1)
except Exception as e:
    print(f"Una excepción inesperada ocurrió al crear la aplicación FastAPI: {e}. El servidor no puede iniciar.")
    sys.exit(1)

if __name__ == "__main__":
    # El logger aquí ya debería estar configurado por create_app()
    if 'logger' not in locals(): # En caso de que create_app falle antes de definir su logger
        logging.basicConfig(level=logging.INFO) # Fallback básico
        logger = logging.getLogger(__name__)
        
    # *** DEBUG: Limpiar Vector Store al inicio si una variable de entorno está configurada ***
    if os.environ.get("CLEAR_VECTOR_STORE") == "true":
        logger.warning("CLEAR_VECTOR_STORE=true detectado. Limpiando Vector Store antes de iniciar.")
        # Necesitamos ejecutar esto en un bucle de eventos async
        async def _clear_store_and_start():
            try:
                # Asumimos que app.state.rag_ingestor ya está disponible después de create_app
                # Podríamos necesitar ajustar si create_app falla antes de inicializarlo
                if hasattr(app.state, 'rag_ingestor') and hasattr(app.state.rag_ingestor, 'clear_vector_store_content'):
                    await app.state.rag_ingestor.clear_vector_store_content()
                    logger.info("Vector Store limpiado exitosamente por script de inicio.")
                else:
                    logger.error("No se pudo acceder a rag_ingestor para limpiar el vector store.")
            except Exception as e:
                logger.error(f"Error durante la limpieza del vector store al inicio: {e}", exc_info=True)
            
            # Luego iniciar el servidor Uvicorn (esto ya no se ejecutará si usamos asyncio.run para la limpieza)
            # La limpieza debe ocurrir *antes* de uvicorn.run
            # Una forma es ejecutar la limpieza en su propio bucle de eventos si es un script standalone, o integrarla en la inicialización de la app
            # Dado que ya estamos en __main__ y uvicorn.run es blocking, una limpieza async aquí es compleja.
            # La mejor forma es llamar a create_app que inicializa todo, y luego llamar al método de limpieza si existe.
            # Vamos a refactorizar ligeramente para hacerlo posible: create_app puede retornar el ingestor.
            pass # Placeholder, la lógica real estará después de create_app si se refactoriza, o llamando a clear_vector_store_content desde aquí si es síncrona.
        
        # Para ejecutar la limpieza async antes de uvicorn.run, necesitamos un bucle de eventos.
        # Esto es un poco tricky porque uvicorn.run tiene su propio bucle.
        # Alternativa simple: si clear_vector_store_content se pudiera llamar sync...
        # PERO es async. La mejor forma es integrarlo *dentro* de la inicialización de FastAPI si la bandera está presente.
        logger.warning("La limpieza async al inicio requiere cambios en create_app o una ejecución separada.")
        logger.warning("Por favor, considere añadir la lógica de limpieza condicional dentro de create_app o ejecutarla manualmente con un script async.")
        # raise SystemExit("Por favor, implemente la lógica de limpieza async en la inicialización de la app.") # O detener si es crítico
        
    # La limpieza async requiere ajustes en la estructura de inicialización.
    # Mientras tanto, puedes intentar llamar a la ruta DELETE varias veces o implementar un script de limpieza async separado.
    
    # Configurar el bucle de eventos de asyncio
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    
    try:
        logger.info(f"Iniciando servidor Uvicorn en http://{settings.host}:{settings.port}")
        uvicorn.run(
            app,
            host=settings.host,
            port=settings.port,
            log_level=settings.log_level.lower(),
            loop=loop
        )
    except KeyboardInterrupt:
        logger.info("Servidor detenido por interrupción del usuario")
    except Exception as e:
        logger.error(f"Error al iniciar el servidor: {e}")
    finally:
        # Limpiar recursos
        try:
            loop.run_until_complete(app.state.chat_manager.close())
            loop.close()
        except Exception as e:
            logger.error(f"Error al limpiar recursos: {e}")