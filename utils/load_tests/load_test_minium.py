import asyncio
import aiohttp
import time
from uuid import uuid4
import os
from datetime import datetime
import statistics
import math

# CONFIG
SESSIONS = 10
MESSAGES_PER_SESSION = 3
API_URL = os.getenv("API_URL", "http://localhost:8000/api/v1")
ENDPOINT = f"{API_URL}/chat/"

REPORT_PATH = os.path.join("utils", "load_tests", "report.md")


async def send_message(client: aiohttp.ClientSession, conversation_id: str, text: str):
    start = time.perf_counter()
    status = "ok"

    try:
        async with client.post(
            ENDPOINT,
            json={"input": text, "conversation_id": conversation_id},
            headers={"Accept": "text/event-stream", "Content-Type": "application/json"},
        ) as resp:

            if resp.status != 200:
                status = f"http_{resp.status}"
                await resp.text()
            else:
                end_event_seen = False
                async for chunk in resp.content:
                    if not chunk:
                        continue
                    line = chunk.decode("utf-8", errors="ignore").strip()
                    if line.startswith("event: end"):
                        end_event_seen = True
                        break

                if not end_event_seen:
                    status = "stream_incomplete"

    except asyncio.TimeoutError:
        status = "timeout"
    except aiohttp.ClientConnectionError:
        status = "connection_error"
    except Exception:
        status = "unknown_error"

    latency = time.perf_counter() - start
    return latency, status


async def session_worker(sid: int, client: aiohttp.ClientSession):
    cid = str(uuid4())
    latencies = []
    failures = []

    for i in range(1, MESSAGES_PER_SESSION + 1):
        text = f"Mensaje {i} de sesión {sid}"
        latency, status = await send_message(client, cid, text)
        latencies.append(latency)

        if status != "ok":
            failures.append(status)

        print(f"Sesión {sid} mensaje {i} -> {status.upper()} {latency:.3f}s")

    return latencies, failures


def percentile(values, p):
    if not values:
        return None
    s = sorted(values)
    k = math.ceil((p / 100) * len(s)) - 1
    return s[max(0, k)]


def fmt(v):
    return "N/A" if v is None else f"{v:.3f}s"


def build_report(total_requests, error_counts, latencies, duration):
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    avg = statistics.mean(latencies) if latencies else None
    p50 = statistics.median(latencies) if latencies else None
    p90 = percentile(latencies, 90)
    p95 = percentile(latencies, 95)
    p99 = percentile(latencies, 99)
    mx = max(latencies) if latencies else None
    mn = min(latencies) if latencies else None

    rps = total_requests / duration

    total_errors = sum(error_counts.values())

    if p95 is None:
        concl = "No se pudo evaluar"
        rec = "Sin datos"
    elif p95 < 1.5:
        concl = "Excelente estabilidad y velocidad."
        rec = "Apto para producción."
    elif p95 <= 3:
        concl = "Rendimiento aceptable."
        rec = "Considerar optimizaciones."
    else:
        concl = "El sistema presenta latencias altas."
        rec = "Detectar y corregir cuellos de botella."

    error_table = "\n".join(
        [f"- **{k}**: {v}" for k, v in error_counts.items()]
    ) or "Sin errores."

    md = f"""
# Informe de Pruebas de Carga — Chatbot RAG

**Fecha:** {now}  
**Duración total:** {duration:.2f}s  
**Throughput (RPS):** {rps:.2f} req/s

---

## Configuración
- Sesiones: {SESSIONS}
- Mensajes por sesión: {MESSAGES_PER_SESSION}
- Total requests: {total_requests}
- Endpoint: {ENDPOINT}

---

## Errores detectados
{error_table}

---

## Métricas de latencia
- Promedio: {fmt(avg)}
- p50: {fmt(p50)}
- p90: {fmt(p90)}
- p95: {fmt(p95)}
- p99: {fmt(p99)}
- Máximo: {fmt(mx)}
- Mínimo: {fmt(mn)}

---

## Conclusión
{concl}

## Recomendación
{rec}
"""
    return md


async def main():
    timeout = aiohttp.ClientTimeout(total=None, sock_connect=30, sock_read=120)
    connector = aiohttp.TCPConnector(limit=0)

    async with aiohttp.ClientSession(timeout=timeout, connector=connector) as client:
        print(f"Iniciando test: {SESSIONS} sesiones × {MESSAGES_PER_SESSION} mensajes...")

        t0 = time.perf_counter()

        tasks = [session_worker(sid, client) for sid in range(1, SESSIONS + 1)]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        duration = time.perf_counter() - t0

    latencies = []
    error_counts = {}

    for result in results:
        if isinstance(result, Exception):
            error_counts["worker_crash"] = error_counts.get("worker_crash", 0) + 1
            continue

        lats, errors = result
        latencies.extend(lats)
        for e in errors:
            error_counts[e] = error_counts.get(e, 0) + 1

    total_requests = SESSIONS * MESSAGES_PER_SESSION

    report = build_report(total_requests, error_counts, latencies, duration)

    os.makedirs(os.path.dirname(REPORT_PATH), exist_ok=True)

    with open(REPORT_PATH, "w", encoding="utf-8") as f:
        f.write(report)

    print(f"\n📄 Reporte generado en: {REPORT_PATH}\n")


if __name__ == "__main__":
    asyncio.run(main())
