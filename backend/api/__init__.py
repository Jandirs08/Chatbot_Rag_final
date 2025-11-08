"""API module for the chatbot application."""

# Exportar únicamente la fábrica de la aplicación; los routers se registran en app.py
from .app import create_app

__all__ = ["create_app"]