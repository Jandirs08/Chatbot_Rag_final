import asyncio
import aiohttp
import time
import os
import psutil
import json
from datetime import datetime
from uuid import uuid4
from statistics import mean
import math

API_URL = os.getenv("API_URL", "http://localhost:8000/api/v1")
CHAT_ENDPOINT = f"{API_URL}/chat/"
PING_ENDPOINT = f"{API_URL}/health"
REPORT_DIR = "utils/diagnostics"
REPORT_MD = f"{REPORT_DIR}/diagnostic_report.md"
REPORT_JSON = f"{REPORT_DIR}/diagnostic_report.json"

# -------------- UTILITIES --------------------------------------------------

def percentile(values, p):
    if not values:
        return None
    s = sorted(values)
    k = max(1, math.ceil((p / 100) * len(s)))
    return s[k - 1]

def fmt(v):
    return "N/A" if v is None else f"{v:.3f}s"

async def eventloop_block_detector(interval=0.1):
    """
    Detecta si el event loop se bloquea por CPU o I/O.
    """
    delays = []
    while True:
        start = time.perf_counter()
        await asyncio.sleep(interval)
        end = time.perf_counter()
        drift = end - start - interval
        delays.append(drift)
        if len(delays) > 500:
            delays.pop(0)
        yield drift

async def measure_openai_latency(client):
    """
    Mide latencia de la primera respuesta generada por el modelo vía tu backend.
    """
    cid = str(uuid4())
    start = time.perf_counter()

    try:
        async with client.post(
            CHAT_ENDPOINT,
            json={"conversation_id": cid, "input": "Hola, prueba de latencia OpenAI."},
        ) as r:
            await r.text()
    except Exception:
        return None

    return time.perf_counter() - start

async def measure_mongo_latency(client):
    """
    Toca el endpoint de history para medir latencia Mongo+Backend.
    """
    cid = str(uuid4())
    hist_url = f"{API_URL}/chat/history/{cid}"
    start = time.perf_counter()
    try:
        async with client.get(hist_url) as r:
            await r.text()
    except Exception:
        return None
    return time.perf_counter() - start

async def measure_qdrant_latency(client):
    """
    Lanza un query simple al RAG retriever a través del backend.
    """
    cid = str(uuid4())
    start = time.perf_counter()
    try:
        async with client.post(
            CHAT_ENDPOINT,
            json={"conversation_id": cid, "input": "¿Qué información tienes sobre los cursos?"},
        ) as r:
            await r.text()
    except Exception:
        return None
    return time.perf_counter() - start

async def send_test_message(client, cid):
    start = time.perf_counter()
    try:
        async with client.post(
            CHAT_ENDPOINT,
            json={"conversation_id": cid, "input": "Test de carga."},
        ) as r:
            await r.text()
        return time.perf_counter() - start, True
    except Exception:
        return None, False

# -------------- MAIN --------------------------------------------------

async def run_diagnostics():
    os.makedirs(REPORT_DIR, exist_ok=True)

    timeout = aiohttp.ClientTimeout(total=120)
    connector = aiohttp.TCPConnector(limit=0)

    eventloop_delays = []

    async with aiohttp.ClientSession(timeout=timeout, connector=connector) as client:
        # --------------------- CHECK BASE HEALTH --------------------------
        try:
            async with client.get(PING_ENDPOINT) as r:
                ok = r.status == 200
        except:
            ok = False

        # --------------------- BASELINE LATENCIES -------------------------
        openai_lat = await measure_openai_latency(client)
        mongo_lat = await measure_mongo_latency(client)
        qdrant_lat = await measure_qdrant_latency(client)

        # --------------------- LOAD TEST LIGERO ---------------------------
        latencies = []
        failures = 0
        print("\nIniciando 20 requests de prueba…")
        for _ in range(20):
            cid = str(uuid4())
            l, ok2 = await send_test_message(client, cid)
            if ok2:
                latencies.append(l)
            else:
                failures += 1
            print(f"Req -> {'OK' if ok2 else 'FAIL'} {fmt(l)}")

        # ---------------- EVENT LOOP BLOCK MEASURE -----------------------
        print("\nMidiendo event loop durante 3 segundos…")
        for _ in range(30):
            start = time.perf_counter()
            await asyncio.sleep(0.1)
            drift = time.perf_counter() - start - 0.1
            eventloop_delays.append(drift)

    # ---------- SYSTEM METRICS -------------------
    cpu_percent = psutil.cpu_percent(interval=1)
    ram_used = psutil.virtual_memory().percent
    proc = psutil.Process(os.getpid())
    proc_cpu = proc.cpu_percent(interval=1)
    proc_ram = proc.memory_info().rss / (1024**2)

    # ---------- STATS -------------------
    avg = mean(latencies) if latencies else None
    p50 = percentile(latencies, 50)
    p95 = percentile(latencies, 95)
    p99 = percentile(latencies, 99)

    loop_block_avg = mean(eventloop_delays)
    loop_block_max = max(eventloop_delays)

    # ---------- REPORT (Markdown) -------------------
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    md = []
    md.append("# 🧪 Informe de Diagnóstico PRO — RAG Chatbot")
    md.append(f"**Fecha:** {now}\n")
    md.append("## 🟩 Estado General")
    md.append(f"- API health: {'OK' if ok else 'FAIL'}")
    md.append(f"- CPU Host: {cpu_percent}%")
    md.append(f"- RAM Host: {ram_used}%")
    md.append(f"- CPU proceso Python: {proc_cpu}%")
    md.append(f"- RAM proceso Python: {proc_ram:.2f} MB\n")

    md.append("## 🟦 Métricas de Componentes")
    md.append(f"- Latencia OpenAI (via backend): {fmt(openai_lat)}")
    md.append(f"- Latencia MongoDB: {fmt(mongo_lat)}")
    md.append(f"- Latencia Qdrant+RAG: {fmt(qdrant_lat)}\n")

    md.append("## 🟨 Mini prueba de carga (20 requests)")
    md.append(f"- Promedio: {fmt(avg)}")
    md.append(f"- p50: {fmt(p50)}")
    md.append(f"- p95: {fmt(p95)}")
    md.append(f"- p99: {fmt(p99)}")
    md.append(f"- Requests fallidas: {failures}\n")

    md.append("## 🟥 Event Loop — Bloqueos detectados")
    md.append(f"- Bloqueo promedio: {loop_block_avg:.5f}s")
    md.append(f"- Bloqueo máximo: {loop_block_max:.5f}s\n")

    md.append("## 🧩 Conclusión Automática")
    if openai_lat and openai_lat > 3:
        md.append("- **OpenAI está lento → cuello principal.**")
    elif mongo_lat and mongo_lat > 0.5:
        md.append("- **MongoDB está lento → revisar IO del contenedor.**")
    elif qdrant_lat and qdrant_lat > 2:
        md.append("- **RAG está tardando → chunks grandes o Qdrant lento.**")
    elif avg and avg > 3:
        md.append("- **Backend está saturado → CPU o event loop bloqueado.**")
    else:
        md.append("- **Rendimiento general aceptable.**")

    md.append("\n---\n")

    with open(REPORT_MD, "w", encoding="utf-8") as f:
        f.write("\n".join(md))

    # ---------- REPORT JSON -------------------
    data = {
        "datetime": now,
        "cpu_host": cpu_percent,
        "ram_host": ram_used,
        "cpu_python": proc_cpu,
        "ram_python_mb": proc_ram,
        "latency_openai": openai_lat,
        "latency_mongo": mongo_lat,
        "latency_qdrant": qdrant_lat,
        "latencies": latencies,
        "failures": failures,
        "eventloop_avg_block": loop_block_avg,
        "eventloop_max_block": loop_block_max,
        "stats": {
            "avg": avg,
            "p50": p50,
            "p95": p95,
            "p99": p99
        }
    }

    with open(REPORT_JSON, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=4)

    print(f"\n✅ Reporte PRO generado:\n- {REPORT_MD}\n- {REPORT_JSON}")

if __name__ == "__main__":
    asyncio.run(run_diagnostics())
