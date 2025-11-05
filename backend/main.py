"""Main entry point for the chatbot application.

Arranque limpio y portable para FastAPI:
- Sin creación manual de event loop ni manejadores de señal (Uvicorn gestiona ambos).
- Sin cierres manuales; el `lifespan` de FastAPI/Starlette maneja recursos de forma correcta.
- Mantener `app` a nivel de módulo para compatibilidad con `uvicorn backend.main:app`.
"""

from pathlib import Path
from dotenv import load_dotenv
import os
import warnings

# Cargar variables de entorno temprano para entornos locales.
# En cloud (Render/Railway), las variables suelen inyectarse automáticamente.
env_path = Path(__file__).resolve().parent / '.env'
if env_path.exists():
    load_dotenv(env_path)

# Importar la fábrica de la aplicación y crear la instancia.
from api.app import create_app

# Crear la aplicación a nivel de módulo para compatibilidad con `uvicorn backend.main:app`.
app = create_app()

if __name__ == "__main__":
    # Arranque simple para desarrollo local. Uvicorn gestiona señales y ciclo de vida.
    import uvicorn
    # Suprimir warnings deprecados ruidosos (p.ej. LangChain) en el proceso del reloader
    try:
        from langchain._api.module_import import LangChainDeprecationWarning
        warnings.filterwarnings("ignore", category=LangChainDeprecationWarning)
    except Exception:
        warnings.filterwarnings("ignore", category=DeprecationWarning)
    port = int(os.getenv("PORT", 8000))
    # Recargar solo en desarrollo
    reload = os.getenv("ENVIRONMENT", "development").lower() != "production"

    # En Docker, el contexto es la carpeta `backend`, por lo que el módulo es `main`.
    # Localmente, se corre desde la raíz, por lo que es `backend.main`.
    app_module = "main:app" if os.getenv("IN_DOCKER") else "backend.main:app"
    
    uvicorn.run(app_module, host="0.0.0.0", port=port, reload=reload)