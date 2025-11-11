import os
import sys

# Asegura las rutas donde puede estar el módulo 'rag'
for p in ["/app", "/app/backend", "/app/src", "/app/chat", "/app/common"]:
    if os.path.isdir(p) and p not in sys.path:
        sys.path.insert(0, p)

try:
    from rag.vector_store.vector_store import VectorStore
    print("✅ Import exitoso de VectorStore\n")
except Exception as e:
    print("❌ Error al importar VectorStore:", e)
    print("Contenido de /app:", os.listdir("/app"))
    if os.path.isdir("/app/backend"):
        print("Contenido de /app/backend:", os.listdir("/app/backend"))
    sys.exit(1)

# Inicializa el store
try:
    store = VectorStore()
    print("🧠 VectorStore inicializado correctamente\n")
except Exception as e:
    print("❌ Error al inicializar VectorStore:", e)
    sys.exit(1)

# Busca el término 'Sepia-Tide'
print("🔍 Buscando 'Sepia-Tide' en el vector store...\n")
try:
    results = store.retrieve("Sepia-Tide", k=3)
    if not results:
        print("⚠️ No se encontraron resultados.")
    else:
        for i, doc in enumerate(results, 1):
            meta = getattr(doc, "metadata", {})
            text = getattr(doc, "page_content", "")[:400]
            print(f"--- Documento {i} ---")
            print("Metadata:", meta)
            print("Texto:", text)
            print("-" * 60)
except Exception as e:
    print("⚠️ Error ejecutando retrieve():", repr(e))

print("\n✅ Diagnóstico terminado.")
