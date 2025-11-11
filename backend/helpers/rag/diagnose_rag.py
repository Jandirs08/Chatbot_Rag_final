import os
import sys
import traceback
from datetime import datetime
from pathlib import Path


def main() -> None:
    errors = []
    vector_store = None
    embedding_fn = None
    persist_dir = None

    # Intentar importar VectorStore y EmbeddingManager de forma independiente
    VectorStore = None  # type: ignore
    EmbeddingManager = None  # type: ignore
    try:
        from rag.vector_store.vector_store import VectorStore  # type: ignore
    except Exception as e:
        errors.append(f"Error importando VectorStore (primer intento): {e}")
        # Ajustar sys.path para entornos locales y docker donde 'backend' contiene el paquete 'rag'
        candidate_paths = [
            "/app/backend",
            str(Path(__file__).resolve().parents[2]),  # .../backend
            str(Path(__file__).resolve().parents[3] / "backend"),  # .../repo_root/backend
        ]
        for p in candidate_paths:
            try:
                if p and p not in sys.path and os.path.isdir(p):
                    sys.path.append(p)
            except Exception as path_err:
                errors.append(f"Error ajustando sys.path con '{p}': {path_err}")
        try:
            from rag.vector_store.vector_store import VectorStore  # type: ignore
        except Exception as e2:
            errors.append(f"Error importando VectorStore (segundo intento): {e2}")
            VectorStore = None  # type: ignore

    # EmbeddingManager puede fallar si langchain no está instalado; usar fallback
    try:
        from rag.embeddings.embedding_manager import EmbeddingManager  # type: ignore
    except Exception as e:
        errors.append(f"Error importando EmbeddingManager: {e}")
        EmbeddingManager = None  # type: ignore

    # Intentar importar settings para obtener rutas configuradas
    s = None
    try:
        from config import settings as s  # type: ignore
    except Exception as e:
        errors.append(f"Error importando settings: {e}")

    # Resolver dinámicamente el persist_directory usando settings si está disponible
    if s is not None:
        try:
            persist_dir = str(Path(s.vector_store_dir).resolve())
        except Exception as e:
            errors.append(f"Error resolviendo vector_store_dir desde settings: {e}")

    # Fallbacks locales si no se obtuvo de settings
    if not persist_dir:
        fallback_dirs = [
            str(Path(__file__).resolve().parents[2] / "storage" / "vector_store"),
            str(Path(__file__).resolve().parents[3] / "backend" / "storage" / "vector_store"),
        ]
        for d in fallback_dirs:
            try:
                if os.path.isdir(d):
                    persist_dir = d
                    break
            except Exception as e:
                errors.append(f"Error verificando directorio fallback '{d}': {e}")

    # Crear carpeta de reportes basada en settings.storage_dir si está disponible
    if s is not None:
        try:
            diagnostics_dir = str(Path(s.storage_dir).resolve() / "diagnostics")
        except Exception as e:
            errors.append(f"Error resolviendo storage_dir para diagnósticos: {e}")
            diagnostics_dir = str(Path(__file__).resolve().parents[2] / "storage" / "diagnostics")
    else:
        diagnostics_dir = str(Path(__file__).resolve().parents[2] / "storage" / "diagnostics")
    try:
        os.makedirs(diagnostics_dir, exist_ok=True)
    except Exception as e:
        errors.append(f"No se pudo crear el directorio de diagnósticos '{diagnostics_dir}': {e}")
        # Si no podemos crear la carpeta, usar un fallback en /tmp
        tmp_dir = "/tmp/diagnostics"
        try:
            os.makedirs(tmp_dir, exist_ok=True)
            diagnostics_dir = tmp_dir
        except Exception as e2:
            # Como último recurso, usar el cwd
            errors.append(f"No se pudo crear fallback en /tmp: {e2}. Usando cwd.")
            diagnostics_dir = os.getcwd()

    # Nombre de archivo de reporte
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    report_path = os.path.join(diagnostics_dir, f"diagnose_rag_{ts}.txt")

    def write_report(lines: list[str]) -> None:
        try:
            with open(report_path, "w", encoding="utf-8") as f:
                for line in lines:
                    f.write(line + "\n")
        except Exception:
            # Intentar escribir en un fallback si falla
            fallback = os.path.join(os.getcwd(), f"diagnose_rag_{ts}.txt")
            with open(fallback, "w", encoding="utf-8") as f:
                for line in lines:
                    f.write(line + "\n")
            print(f"Reporte (fallback) generado en: {fallback}")
            return
        print(f"Reporte generado en: {report_path}")

    # Si no se pudo importar VectorStore, no podemos continuar
    if VectorStore is None:
        lines = [
            f"Fecha/Hora: {datetime.now().isoformat()}",
            "Diagnóstico: Fallo al importar VectorStore.",
        ]
        if persist_dir:
            lines.append(f"Directorio de persistencia detectado: {persist_dir}")
        else:
            lines.append("Directorio de persistencia: NO ENCONTRADO")
        lines.append("Errores:")
        for err in errors:
            lines.append(f"- {err}")
        write_report(lines)
        return

    # Validar directorio de persistencia
    if not persist_dir:
        errors.append("No se encontró ningún persist_directory válido en las rutas configuradas.")
        lines = [
            f"Fecha/Hora: {datetime.now().isoformat()}",
            "Diagnóstico: No se encontró persist_directory.",
            "Directorio de persistencia: NO ENCONTRADO",
            "Errores:",
        ]
        lines += [f"- {e}" for e in errors]
        write_report(lines)
        return

    # Inicializar EmbeddingManager
    if EmbeddingManager is not None:
        try:
            embedding_manager = EmbeddingManager()
            embedding_fn = embedding_manager  # EmbeddingManager expone 'embed_query'
        except Exception as e:
            errors.append(f"No se pudo inicializar EmbeddingManager: {e}")
            embedding_fn = None
    # Fallback de emergencia si no hay EmbeddingManager
    if embedding_fn is None:
        class ZeroEmbedding:
            def __init__(self, dim: int = 1536):
                self.dim = dim

            def embed_query(self, _q: str):
                return [0.0] * self.dim

        embedding_fn = ZeroEmbedding()

    # Inicializar VectorStore
    try:
        vector_store = VectorStore(
            persist_directory=persist_dir,
            embedding_function=embedding_fn,
            distance_strategy="cosine",
            cache_enabled=False,
        )
    except Exception as e:
        errors.append(f"Error inicializando VectorStore: {e}\n{traceback.format_exc()}")
        lines = [
            f"Fecha/Hora: {datetime.now().isoformat()}",
            f"Directorio de persistencia: {persist_dir}",
            "Diagnóstico: Error al inicializar VectorStore.",
            "Errores:",
        ]
        lines += [f"- {err}" for err in errors]
        write_report(lines)
        return

    # Ejecutar retrieve("Sepia-Tide", k=3)
    results = []
    try:
        import asyncio
        results = asyncio.run(vector_store.retrieve("Sepia-Tide", k=3))
    except Exception as e:
        errors.append(f"Error ejecutando retrieve: {e}\n{traceback.format_exc()}")

    # Preparar reporte
    lines = [
        f"Fecha/Hora: {datetime.now().isoformat()}",
        f"Directorio de persistencia usado: {persist_dir}",
        f"Número de resultados para 'Sepia-Tide' (k=3): {len(results) if results else 0}",
    ]

    if errors:
        lines.append("Errores detectados durante el diagnóstico:")
        for err in errors:
            lines.append(f"- {err}")

    # Añadir detalle de cada documento
    try:
        if results:
            for idx, doc in enumerate(results, start=1):
                try:
                    meta = getattr(doc, "metadata", {}) or {}
                    content = getattr(doc, "page_content", "") or ""
                    snippet = content[:500].replace("\n", " ")
                    lines.append("")
                    lines.append(f"Resultado #{idx}:")
                    lines.append(f"  Metadata: {meta}")
                    lines.append(f"  Contenido (primeros 500 chars): {snippet}")
                except Exception as per_doc_err:
                    lines.append(f"  Error procesando documento #{idx}: {per_doc_err}")
        else:
            lines.append("No se recuperaron documentos o la colección está vacía.")
    except Exception as e:
        lines.append(f"Error formateando resultados: {e}")

    # Guardar reporte y anunciar ruta
    write_report(lines)


if __name__ == "__main__":
    main()