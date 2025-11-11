import os
import sys
from pathlib import Path
from datetime import datetime

def main() -> None:
    errors = []
    cleaned = 0
    persist_dir = None
    collection_name = "rag_collection"

    # Asegurar que la raíz del proyecto (/app) esté en sys.path
    try:
        project_root = Path(__file__).resolve().parents[2]
        if str(project_root) not in sys.path:
            sys.path.append(str(project_root))
    except Exception:
        pass

    # Import settings
    try:
        from config import settings as s  # type: ignore
        print("Settings importado correctamente")
    except Exception as e:
        errors.append(f"Error importando settings: {e}")
        print(f"Fallo importando settings: {e}")
        s = None  # type: ignore

    # Resolver persist directory
    try:
        base_dir = Path(__file__).resolve().parents[2]  # normalmente /app
        if s is not None:
            cfg_path = Path(s.vector_store_dir)
            print(f"vector_store_dir (settings): {s.vector_store_dir}")
            if cfg_path.is_absolute():
                persist_dir = str(cfg_path)
            else:
                persist_dir = str((base_dir / cfg_path).resolve())
        else:
            # Fallback local
            persist_dir = str((base_dir / "storage" / "vector_store").resolve())
    except Exception as e:
        errors.append(f"Error resolviendo persist_directory: {e}")

    # Importar chromadb
    try:
        import chromadb  # type: ignore
    except Exception as e:
        errors.append(f"chromadb no disponible: {e}")
        chromadb = None  # type: ignore

    if chromadb is None or persist_dir is None:
        print("No se puede continuar: falta chromadb o persist_directory.")
        for err in errors:
            print(f"- {err}")
        return

    try:
        print(f"Usando persist_directory: {persist_dir}")
        client = chromadb.PersistentClient(path=persist_dir)
        coll = client.get_or_create_collection(collection_name)
        print(f"Colección: {collection_name}")
        # Obtener documentos dummy
        docs = coll.get(where={"is_dummy": True}, include=["metadatas"])
        ids = []
        for i, meta in enumerate(docs.get("metadatas", []) or []):
            if meta and meta.get("is_dummy") is True:
                ids.append(docs["ids"][i])
        if ids:
            coll.delete(ids=ids)
            cleaned = len(ids)
        # Informe
        total = coll.count()
        print(f"Limpieza de dummy completada. Eliminados: {cleaned}. Conteo actual: {total}.")
    except Exception as e:
        print(f"Error durante limpieza de dummy: {e}")


if __name__ == "__main__":
    main()