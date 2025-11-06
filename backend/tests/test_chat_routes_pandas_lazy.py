import re
from pathlib import Path


def test_pandas_lazy_import_via_source_inspection():
    """
    Verifica por inspección del código fuente que:
    - No hay `import pandas` a nivel de módulo.
    - El `import pandas as pd` ocurre dentro de la función `export_conversations`.
    """
    repo_root = Path(__file__).resolve().parents[2]
    chat_routes_path = repo_root / "backend" / "api" / "routes" / "chat" / "chat_routes.py"
    lines = chat_routes_path.read_text(encoding="utf-8").splitlines()

    # 1) No debe existir un import pandas sin indentación (nivel de módulo)
    top_level_imports = [i for i, line in enumerate(lines) if line.startswith("import pandas")]
    assert len(top_level_imports) == 0, "No debe haber import pandas a nivel de módulo"

    # 2) Encontrar la línea de definición de la función
    func_idx = None
    for i, line in enumerate(lines):
        if line.lstrip().startswith("async def export_conversations("):
            func_idx = i
            break
    assert func_idx is not None, "No se encontró la definición de export_conversations"

    # 3) Debe existir un import pandas con indentación dentro del cuerpo de la función
    in_body_import = False
    for line in lines[func_idx + 1:]:
        if line.startswith("def ") or line.startswith("async def "):
            # Fin del cuerpo si aparece otra definición al mismo nivel (heurística simple)
            break
        if (line.startswith(" ") or line.startswith("\t")) and "import pandas as pd" in line:
            in_body_import = True
            break

    assert in_body_import, "El import de pandas debe ocurrir dentro de export_conversations()"