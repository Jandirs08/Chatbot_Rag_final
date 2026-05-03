"""API package.

Keep this module side-effect free. Importing `api.schemas` must not initialize
the FastAPI app, otherwise lower-level modules can hit circular imports.
Import `create_app` from `api.app` directly.
"""

__all__: list[str] = []
