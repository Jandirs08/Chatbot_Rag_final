"""Load test para validar latencia con muestra significativa.

Tandas automatizadas (script):
  - Tanda 1: 15 chats secuenciales (1 cada ~5s) — warmup, cold start visible
  - Tanda 2: 10 chats burst paralelo (asyncio.gather, conv_id distintos)
  - Tanda 4: 30 chats sostenido (1 cada 3-5s) — throughput realista

Tanda manual (entre T2 y T4, el script pausa):
  - Tanda 3: 5 conversaciones × 5 turnos cada una (25 chats multi-turn).
    Hecha por el operador en la UI real. Guion en docs/MULTITURN_SCRIPT.md.

Total: ~80 chats con mix realista. Suficiente para que p95 estabilice.

Uso:
    cd C:/Jandir2026/DesarrolloJandir/Chatbot_Rag_final
    python scripts/loadtest_observability.py

Requisitos: backend corriendo en http://localhost:8000, BD limpia, httpx instalado.
"""
from __future__ import annotations

import asyncio
import random
import time
import uuid

import httpx

API = "http://localhost:8000/api/v1/chat/"
SOURCE = "loadtest"

# ─── Queries por categoría ────────────────────────────────────────────────────

QUERIES_RAG = [
    "Qué dosis de Algarium Semilla SC uso para arroz",
    "Productos para nutrición de soya",
    "Composición del bioestimulante Ánimo",
    "Recomienda algo para cultivo de maíz",
    "Qué foliares tienen para frutales",
    "Granulados para hortalizas",
    "Bioestimulantes contra estrés hídrico",
    "Aplicación foliar en arroz",
    "Qué productos tienen para café",
    "Productos con nitrógeno y potasio",
    "Dosis recomendada para una hectárea de maíz",
    "Algarium para soya en floración",
    "Nutrición vegetal en papa",
    "Qué tienen contra deficiencia de hierro",
    "Bioestimulante para germinación",
    "Ubicación de la planta de producción de Equilibra",
    "Cómo contactar a un asesor",
    "Catálogo completo de productos",
    "Productos para cultivo de tomate",
    "Qué aplico contra clorosis en frutales",
]

QUERIES_SMALL_TALK = [
    "Hola",
    "Buenos días",
    "Buenas tardes",
    "Gracias",
    "Listo",
    "Perfecto",
    "Ok entendido",
    "Hola, ¿cómo estás?",
]

QUERIES_OFFTOPIC = [
    "Estoy estudiando inglés, dame un producto para resistir largas jornadas",
    "Qué le doy a mi gato que está triste",
    "Necesito vitaminas para mi mamá",
    "Qué tomo si tengo dolor de cabeza",
    "Recomienda un libro de programación",
]

QUERIES_EDGE = [
    "?",
    "ayuda",
    "necesito información detallada y específica de todos los productos del catálogo con dosis exactas para cada cultivo y composición química completa",
    "asdf",
    "y eso?",
]

# ─── HTTP helpers ─────────────────────────────────────────────────────────────

async def send_chat(
    client: httpx.AsyncClient,
    query: str,
    conv_id: str | None = None,
) -> tuple[bool, float, int]:
    """Envía 1 chat vía SSE, consume el stream completo. Retorna (ok, ms, status)."""
    body = {
        "input": query,
        "conversation_id": conv_id or str(uuid.uuid4()),
        "source": SOURCE,
    }
    start = time.perf_counter()
    try:
        async with client.stream("POST", API, json=body, timeout=120.0) as r:
            status = r.status_code
            if status != 200:
                return False, (time.perf_counter() - start) * 1000, status
            # Drenar stream entero — el chat no termina hasta que el server cierra
            async for _ in r.aiter_bytes():
                pass
        return True, (time.perf_counter() - start) * 1000, status
    except Exception as exc:
        elapsed = (time.perf_counter() - start) * 1000
        print(f"  [error] {type(exc).__name__}: {exc}")
        return False, elapsed, 0


def fmt_line(label: str, n: int, total: int, dt: float, ok: bool, status: int, q: str) -> str:
    mark = "OK" if ok else f"FAIL({status})"
    return f"[{label} {n:>2}/{total}] {dt:>6.0f}ms {mark:<8} | {q[:64]}"


# ─── Tandas ───────────────────────────────────────────────────────────────────

def build_warmup_mix() -> list[str]:
    """15 queries: 8 RAG + 3 small talk + 2 off-topic + 2 edge."""
    pool = (
        random.sample(QUERIES_RAG, 8)
        + random.sample(QUERIES_SMALL_TALK, 3)
        + random.sample(QUERIES_OFFTOPIC, 2)
        + random.sample(QUERIES_EDGE, 2)
    )
    random.shuffle(pool)
    return pool


def build_sustained_mix() -> list[str]:
    """30 queries: 18 RAG + 6 small talk + 4 off-topic + 2 edge."""
    pool = (
        random.sample(QUERIES_RAG * 2, 18)
        + random.sample(QUERIES_SMALL_TALK * 2, 6)
        + random.sample(QUERIES_OFFTOPIC * 2, 4)
        + random.sample(QUERIES_EDGE * 2, 2)
    )
    random.shuffle(pool)
    return pool


async def run_warmup(client: httpx.AsyncClient) -> None:
    queries = build_warmup_mix()
    total = len(queries)
    print(f"\n=== Tanda 1 — Warmup ({total} secuenciales, 1 cada ~5s) ===\n")
    for i, q in enumerate(queries, 1):
        ok, dt, status = await send_chat(client, q)
        print(fmt_line("T1", i, total, dt, ok, status, q))
        if i < total:
            await asyncio.sleep(5)


async def run_burst(client: httpx.AsyncClient) -> None:
    """10 chats simultáneos vía asyncio.gather. Conv_id distinto cada uno
    para evitar serialización por ConversationLockManager — paralelo real.
    """
    queries = (
        random.sample(QUERIES_RAG, 5)
        + random.sample(QUERIES_SMALL_TALK, 3)
        + random.sample(QUERIES_OFFTOPIC, 2)
    )
    random.shuffle(queries)
    total = len(queries)
    print(f"\n=== Tanda 2 — Burst paralelo ({total} simultáneos, conv_id distintos) ===\n")

    burst_started = time.perf_counter()

    async def one(idx: int, q: str) -> tuple[int, str, bool, float, int]:
        ok, dt, status = await send_chat(client, q)
        return idx, q, ok, dt, status

    tasks = [asyncio.create_task(one(i, q)) for i, q in enumerate(queries, 1)]
    results = await asyncio.gather(*tasks)

    burst_total = (time.perf_counter() - burst_started) * 1000
    for idx, q, ok, dt, status in sorted(results, key=lambda r: r[0]):
        print(fmt_line("T2", idx, total, dt, ok, status, q))
    print(f"\n[T2 wall-clock total del burst]: {burst_total:.0f}ms")


async def run_sustained(client: httpx.AsyncClient) -> None:
    queries = build_sustained_mix()
    total = len(queries)
    print(f"\n=== Tanda 4 — Sostenido ({total} chats, 1 cada 3-5s) ===\n")
    for i, q in enumerate(queries, 1):
        ok, dt, status = await send_chat(client, q)
        print(fmt_line("T4", i, total, dt, ok, status, q))
        if i < total:
            await asyncio.sleep(random.uniform(3.0, 5.0))


# ─── Main ─────────────────────────────────────────────────────────────────────

PAUSE_BANNER_T3 = """
╔══════════════════════════════════════════════════════════════════════╗
║  PAUSA — Tanda 3 manual (multi-turn, 5 convs × 5 turnos = 25 chats)  ║
║                                                                       ║
║  Abre la UI del chat web. En cada conversación nueva manda los       ║
║  5 mensajes EN ORDEN, esperando respuesta entre cada uno.            ║
║                                                                       ║
║  Guion completo: docs/MULTITURN_SCRIPT.md                            ║
║                                                                       ║
║  Cuando termines las 5 conversaciones, presiona ENTER aquí           ║
║  para arrancar la Tanda 4 sostenida.                                 ║
╚══════════════════════════════════════════════════════════════════════╝
"""

DONE_BANNER = """
╔══════════════════════════════════════════════════════════════════════╗
║  Listo. ~80 chats inyectados (15 + 10 + 25 + 30).                    ║
║                                                                       ║
║  Abre /admin/observability — debería mostrar:                        ║
║    • ~80 muestras en ventana                                         ║
║    • p95 estabilizado                                                ║
║    • Distribución de gating reasons real                             ║
║    • Costo aproximado total                                          ║
╚══════════════════════════════════════════════════════════════════════╝
"""


async def main() -> None:
    print("Loadtest observability — preparate para ~20 min de prueba.")
    print(f"Endpoint: {API}")
    print("Asegurate que: BD limpia, backend corriendo, /admin/observability abierto.\n")
    input("Presiona ENTER cuando estés listo para arrancar...")

    async with httpx.AsyncClient() as client:
        await run_warmup(client)

        # Pequeña pausa entre auto-tandas para que Redis/Mongo respiren
        print("\n--- pausa 60s antes de burst ---")
        await asyncio.sleep(60)

        await run_burst(client)

        print(PAUSE_BANNER_T3)
        input("ENTER tras completar Tanda 3 multi-turn manual...")

        await run_sustained(client)
        print(DONE_BANNER)


if __name__ == "__main__":
    random.seed()  # mix variado cada ejecución
    asyncio.run(main())
