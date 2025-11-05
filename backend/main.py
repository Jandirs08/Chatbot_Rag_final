"""Main entry point for the chatbot application.

Arranque limpio y portable para FastAPI:
- Sin creación manual de event loop ni manejadores de señal (Uvicorn gestiona ambos).
- Sin cierres manuales; el `lifespan` de FastAPI/Starlette maneja recursos de forma correcta.
- Mantener `app` a nivel de módulo para compatibilidad con `uvicorn backend.main:app`.
"""

from pathlib import Path
from dotenv import load_dotenv

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
    uvicorn.run("backend.main:app", host="0.0.0.0", port=8000, reload=True)