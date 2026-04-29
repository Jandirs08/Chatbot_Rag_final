# Observability Roadmap

Plan de implementación de observability para Chatbot RAG. Documento de continuación: implementar Fase A + B en sesión futura.

---

## Estado actual (auditoría)

### Lo que YA está instalado / configurado

| Componente | Ubicación | Estado |
|---|---|---|
| Logging custom | `backend/utils/logging_utils.py` | ✓ Funcional con `request_id` propagation |
| Health checks | `backend/api/routes/health/health_routes.py` | ✓ `/health`, `/health/cache`, `/health/ready`, `/internal/status` |
| Stage timings interno | `backend/core/request_context.py`, `chat/manager.py`, `rag/retrieval/retriever.py` | ✓ Tracked en `RequestContext` (first_token_ms, llm_ms, rag_time, embedding_ms, dense_ms, lexical_ms, rerank_ms) |
| Circuit breaker status | `backend/utils/circuit_breaker.py` | ✓ Expuesto en `/internal/status` |
| Sentry SDK | `requirements.txt` línea 55: `sentry-sdk[fastapi]>=2.0.0,<3.0.0` | ⚠️ Instalado pero **NO inicializado** |
| Sentry settings | `config_fragments.py:196-197` | ✓ `SENTRY_DSN` y `SENTRY_TRACES_SAMPLE_RATE` declaradas |
| Cache health | `backend/cache/manager.py:get_health_status()` | ✓ Reporta `is_degraded`, backend type |

### Lo que FALTA

| Gap | Impacto |
|---|---|
| Sentry `sentry_sdk.init()` no se llama | Errors invisibles fuera de stdout |
| Logs en texto plano (no JSON) | Difícil parsear / buscar / agregar |
| Sin `/metrics` endpoint Prometheus | No RPS / p95 / error rate en vivo |
| Sin tracing distribuido (OTel) | Tiempo perdido en pipeline = misterio |
| Sin logs centralizados | Pierdes al rotar/reiniciar container |
| Sin alertas | Te enteras cuando user reclama |
| Sin dashboards | Vuelas a ciegas |
| Sin métricas LLM (tokens, cost, rate-limits) | No sabes si OpenAI te ahoga |
| Sin métricas Qdrant/Mongo/Redis | Bottleneck oculto |
| Sin uptime monitoring externo | Site puede caer y nadie sabe |

**Score actual: 4.5/10**

---

## Concepto: 2 mitades de observability

### Mitad 1 — En tu backend (código)
**Instrumentación.** El backend EMITE datos.
- Sentry SDK → captura errors, manda a Sentry.io
- Prometheus exporter → expone `/metrics` con números (RPS, latencia, etc.)
- OTel SDK → emite traces

Vive en `requirements.txt` + código (init + decoradores/middleware).

### Mitad 2 — Fuera (servicios receptores)
**Backend de observability.** Servicio que RECIBE / muestra datos.
- **Sentry.io** (SaaS) → cuenta sentry.io ve errors
- **Grafana** → dashboards
- **Prometheus server** → guarda métricas time-series
- **Loki / Datadog / CloudWatch** → guarda logs

Separados. App emite, servicio recibe. Hay que conectar ambos vía URL/key.

---

## Fase A — Activar lo gratis ya pagado (1-2h, $0)

Objetivo: errors visibles + uptime externo.

### A.1 — Inicializar Sentry

**A.1.1 Crear cuenta Sentry.io**
- Sign up: https://sentry.io/signup/
- Free tier: 5K events/mes
- Crear nuevo proyecto → tipo **Python / FastAPI**
- Copiar **DSN** (URL secreta tipo `https://abc123@o0.ingest.sentry.io/123`)

**A.1.2 Setear DSN en `.env`**
```env
SENTRY_DSN=https://abc123@o0.ingest.sentry.io/123
SENTRY_TRACES_SAMPLE_RATE=0.1
```

**A.1.3 Inicializar SDK en código**

Lugar: `backend/api/lifespan.py` arriba del `@asynccontextmanager` (antes que cualquier import pesado).

```python
# backend/api/lifespan.py — top of file
import sentry_sdk
from sentry_sdk.integrations.fastapi import FastApiIntegration
from sentry_sdk.integrations.starlette import StarletteIntegration
from sentry_sdk.integrations.logging import LoggingIntegration
import logging

if settings.sentry_dsn:
    sentry_sdk.init(
        dsn=settings.sentry_dsn,
        environment=settings.environment,
        traces_sample_rate=settings.sentry_traces_sample_rate,
        profiles_sample_rate=0.1,
        integrations=[
            FastApiIntegration(transaction_style="endpoint"),
            StarletteIntegration(transaction_style="endpoint"),
            LoggingIntegration(level=logging.INFO, event_level=logging.ERROR),
        ],
        send_default_pii=False,  # NO PII por defecto (GDPR)
        release=f"chatbot-rag@{settings.app_version}",
    )
```

**A.1.4 Validar funciona**

Endpoint test temporal:
```python
@router.get("/_debug/sentry-test")
async def sentry_test():
    raise ValueError("Sentry test error — should appear in dashboard")
```

Hit el endpoint → ver error aparecer en sentry.io dashboard en <1 min.

Eliminar endpoint después.

### A.2 — Logs JSON estructurados

**A.2.1 Agregar dep**
```
# requirements.in
python-json-logger>=2.0.0
```

```bash
pip-compile requirements.in -o requirements.txt
```

**A.2.2 Cambiar formatter en `logging_utils.py`**

Reemplazar `setup_logging()`:
```python
def setup_logging():
    log_level = os.environ.get("LOG_LEVEL", "INFO").upper()
    use_json = os.environ.get("LOG_FORMAT", "text").lower() == "json"

    handler = logging.StreamHandler()
    if use_json:
        from pythonjsonlogger import jsonlogger
        formatter = jsonlogger.JsonFormatter(
            "%(asctime)s %(levelname)s %(name)s %(request_id)s %(message)s",
            rename_fields={"asctime": "timestamp", "levelname": "level"},
        )
    else:
        formatter = logging.Formatter(
            "%(asctime)s | %(levelname)s:%(name)s:%(request_id)s%(message)s",
            datefmt="%Y-%m-%d %H:%M:%S",
        )
    handler.setFormatter(formatter)

    root = logging.getLogger()
    root.setLevel(log_level)
    root.handlers = [handler]

    _ensure_request_id_filter()
```

**A.2.3 Activar JSON en prod**
```env
LOG_FORMAT=json
```

Dev queda en text por legibilidad humana.

### A.3 — Uptime monitoring externo

**A.3.1 Better Stack / UptimeRobot (free)**

Better Stack free: https://betterstack.com (10 monitors, 3 min interval)
UptimeRobot free: https://uptimerobot.com (50 monitors, 5 min interval)

**A.3.2 Configurar checks:**
- Check 1: `GET https://your-domain.com/api/v1/health` → expect 200, contains "ok"
- Check 2: `GET https://your-domain.com/api/v1/health/ready` → expect 200, contains "healthy"
- Alert via Slack / email / SMS si 2+ failures consecutivos

### A.4 — Alerts Sentry → Slack

Sentry settings → Integrations → Slack → conectar workspace.
Alert rules:
- Error rate > 1% en 1h → notify Slack
- New issue in production → notify Slack inmediato

---

## Fase B — Métricas básicas (3-4h, $0 free tier)

Objetivo: RPS, p95, error rate en vivo + dashboard.

### B.1 — Prometheus instrumentation

**B.1.1 Agregar deps**
```
# requirements.in
prometheus-fastapi-instrumentator>=7.0.0
prometheus-client>=0.20.0
```

**B.1.2 Wire en `api/app.py` `create_app()`**

Después de `app = FastAPI(...)`:
```python
from prometheus_fastapi_instrumentator import Instrumentator

instrumentator = Instrumentator(
    should_group_status_codes=False,
    should_ignore_untemplated=True,
    should_respect_env_var=True,
    env_var_name="ENABLE_METRICS",
    excluded_handlers=["/metrics", "/_debug/.*"],
    inprogress_name="http_requests_inprogress",
    inprogress_labels=True,
)
instrumentator.instrument(app).expose(
    app,
    endpoint="/metrics",
    include_in_schema=False,
    tags=["observability"],
)
```

**B.1.3 Activar via env**
```env
ENABLE_METRICS=true
```

**B.1.4 Validar**
```bash
curl http://localhost:8000/metrics | grep http_requests_total
```

Debe mostrar contadores tipo:
```
http_requests_total{handler="/api/v1/chat/",method="POST",status="2xx"} 142.0
```

### B.2 — Grafana Cloud free tier

**B.2.1 Cuenta Grafana Cloud**
- Sign up: https://grafana.com/products/cloud/ (free tier: 10K series, 50GB logs, 50GB traces, 14 days retention)
- Crear stack
- Copiar credenciales Prometheus remote_write URL + API key

**B.2.2 Push métricas (2 opciones)**

**Opción A — Pull (Grafana Agent + Prometheus self-host):**

Agregar a `docker-compose.yml`:
```yaml
prometheus:
  image: prom/prometheus:latest
  container_name: chatbot-prometheus
  volumes:
    - ./infra/prometheus.yml:/etc/prometheus/prometheus.yml
    - prometheus_data:/prometheus
  ports:
    - "9090:9090"
  networks:
    - chatbot-network
```

`infra/prometheus.yml`:
```yaml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'chatbot-backend'
    static_configs:
      - targets: ['chatbot-backend:8000']
    metrics_path: /metrics

remote_write:
  - url: https://prometheus-prod-XX.grafana.net/api/prom/push
    basic_auth:
      username: ${GRAFANA_PROM_USER}
      password: ${GRAFANA_PROM_API_KEY}
```

**Opción B — Push directo desde app (más simple):**

`prometheus-client` con push gateway. Más complejo, **prefiero Opción A**.

**B.2.3 Importar dashboard FastAPI**
- En Grafana → Dashboards → Import
- Dashboard ID: `14282` (FastAPI Observability) o `19925`
- Datasource: tu Prometheus

Métricas auto-tracked por instrumentator:
- `http_requests_total{handler, method, status}`
- `http_request_duration_seconds{handler, method}` (histogram → p50/p95/p99)
- `http_requests_inprogress`

### B.3 — Dashboard custom RED method

Crear dashboard manual con paneles:
1. **Rate**: `sum(rate(http_requests_total[5m])) by (handler)` — RPS por endpoint
2. **Errors**: `sum(rate(http_requests_total{status=~"5.."}[5m])) by (handler) / sum(rate(http_requests_total[5m])) by (handler)` — error rate %
3. **Duration**: `histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[5m])) by (handler, le))` — p95 latencia

### B.4 — Alertas Grafana

Crear alert rules:
- p95 chat endpoint > 10s durante 5 min → notify Slack
- error rate > 5% durante 5 min → notify Slack
- RPS chat = 0 durante 5 min (inesperado) → notify Slack

---

## Fase C (futuro) — Métricas custom críticas (3-4h)

Para detectar bottlenecks específicos LLM / Qdrant / Mongo.

### C.1 — Wrapper LLM calls

Métricas a emitir:
```python
# backend/utils/llm_metrics.py (nuevo archivo)
from prometheus_client import Counter, Histogram, Gauge

llm_requests_total = Counter(
    "llm_requests_total",
    "Total LLM requests",
    ["provider", "model", "status"],
)
llm_request_duration = Histogram(
    "llm_request_duration_seconds",
    "LLM request duration",
    ["provider", "model"],
    buckets=(0.1, 0.5, 1, 2, 5, 10, 30, 60),
)
llm_tokens_total = Counter(
    "llm_tokens_total",
    "Total LLM tokens consumed",
    ["provider", "model", "type"],  # type=input|output
)
llm_rate_limit_hits = Counter(
    "llm_rate_limit_hits_total",
    "LLM rate limit responses (HTTP 429)",
    ["provider", "model"],
)
llm_circuit_breaker_state = Gauge(
    "llm_circuit_breaker_state",
    "Circuit breaker state (0=closed, 1=open, 0.5=half-open)",
    ["provider"],
)
```

Wire en `core/chain.py` y `chat/verifier.py` alrededor de `llm.ainvoke` / `llm.astream`:
```python
import time
from utils.llm_metrics import llm_requests_total, llm_request_duration, llm_tokens_total

start = time.perf_counter()
status = "success"
try:
    response = await llm.ainvoke(prompt)
    # extract tokens si están disponibles
    usage = getattr(response, "usage_metadata", None)
    if usage:
        llm_tokens_total.labels(provider="openai", model=model_name, type="input").inc(usage.get("input_tokens", 0))
        llm_tokens_total.labels(provider="openai", model=model_name, type="output").inc(usage.get("output_tokens", 0))
except RateLimitError:
    status = "rate_limited"
    llm_rate_limit_hits.labels(provider="openai", model=model_name).inc()
    raise
except Exception:
    status = "error"
    raise
finally:
    elapsed = time.perf_counter() - start
    llm_request_duration.labels(provider="openai", model=model_name).observe(elapsed)
    llm_requests_total.labels(provider="openai", model=model_name, status=status).inc()
```

### C.2 — Wrapper Qdrant

```python
qdrant_query_duration = Histogram(...)
qdrant_query_errors = Counter(...)
```

Wire en `rag/vector_store/vector_store.py` alrededor de `client.query_points`.

### C.3 — Wrapper Mongo

Pymongo provee command monitoring:
```python
from pymongo import monitoring

class MongoCommandLogger(monitoring.CommandListener):
    def succeeded(self, event):
        mongo_query_duration.labels(command=event.command_name).observe(event.duration_micros / 1e6)
    def failed(self, event):
        mongo_query_errors.labels(command=event.command_name).inc()

monitoring.register(MongoCommandLogger())
```

### C.4 — Cost tracking LLM

Calcular USD spent en tiempo real:
```python
PRICES = {  # USD per 1M tokens
    ("openai", "gpt-4o-mini"): {"input": 0.15, "output": 0.60},
    ("openai", "gpt-4o"): {"input": 2.50, "output": 10.00},
    # ...
}

llm_cost_usd_total = Counter(
    "llm_cost_usd_total",
    "Cumulative LLM cost in USD",
    ["provider", "model"],
)

def record_cost(provider, model, input_tokens, output_tokens):
    pricing = PRICES.get((provider, model))
    if pricing:
        cost = (input_tokens * pricing["input"] + output_tokens * pricing["output"]) / 1_000_000
        llm_cost_usd_total.labels(provider=provider, model=model).inc(cost)
```

Dashboard panel: `sum(rate(llm_cost_usd_total[1h])) * 24 * 30` → proyección mensual.

### C.5 — Indicadores OpenAI ahogándote

Alertas a configurar:
- `histogram_quantile(0.95, rate(llm_request_duration_seconds_bucket[5m])) > 5` → saturación
- `rate(llm_rate_limit_hits_total[5m]) > 0.1` → tier limit
- `llm_circuit_breaker_state == 1` → OpenAI down / problema persistente
- `rate(llm_cost_usd_total[1h]) * 24 * 30 > 1000` → cost runaway

---

## Fase D (futuro) — Alertas robustas (2-3h)

### D.1 — PagerDuty / OpsGenie (si crítico)
Para alerts críticas (caída total) que despierten on-call.
Free tiers limitados; PagerDuty $19/usuario/mes para SaaS pro.

### D.2 — Runbooks en alerts
Cada alert debe linkear a un runbook (markdown) que diga:
1. Qué significa
2. Cómo investigar
3. Cómo mitigar

Ejemplo: `docs/runbooks/llm-rate-limit.md`.

---

## Fase E (futuro, $200+/mes) — Tracing distribuido OTel

Cuando crezcas y necesites ver pipeline completo (FE → BE → Qdrant → OpenAI → Mongo).

### E.1 — Deps
```
opentelemetry-api
opentelemetry-sdk
opentelemetry-instrumentation-fastapi
opentelemetry-instrumentation-pymongo
opentelemetry-instrumentation-redis
opentelemetry-instrumentation-httpx
opentelemetry-exporter-otlp
```

### E.2 — Init en `lifespan.py` antes de app create
```python
from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
from opentelemetry.sdk.resources import Resource

resource = Resource.create({"service.name": "chatbot-backend"})
provider = TracerProvider(resource=resource)
provider.add_span_processor(
    BatchSpanProcessor(OTLPSpanExporter(endpoint="http://tempo:4317", insecure=True))
)
trace.set_tracer_provider(provider)

# Auto-instrument
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
FastAPIInstrumentor.instrument_app(app)
```

### E.3 — Backend traces
Grafana Tempo (free tier) o Jaeger self-host o Datadog APM ($31/host/mes).

---

## Resumen ejecutivo

### Plan inmediato (esta sesión futura)

**Hora 1-2: Fase A**
1. Crear cuenta Sentry.io free
2. Pegar DSN en `.env`
3. `sentry_sdk.init()` en `lifespan.py`
4. Test endpoint sentry-test → validar
5. Logs JSON via `python-json-logger` + setting `LOG_FORMAT=json` en prod
6. UptimeRobot/Better Stack ping `/health` cada 5 min
7. Sentry → Slack integration

**Hora 3-6: Fase B**
1. `prometheus-fastapi-instrumentator` instalado
2. `/metrics` expuesto + `ENABLE_METRICS=true`
3. Cuenta Grafana Cloud free
4. Prometheus container en `docker-compose.yml` con `remote_write` a Grafana Cloud
5. Importar dashboard 14282 (FastAPI)
6. Crear dashboard custom RED por endpoint
7. Alert rules p95 > 10s y error_rate > 5%

### Costos
- **Fase A:** $0 (Sentry free + UptimeRobot free)
- **Fase B:** $0 (Grafana Cloud free tier 10K series)
- **Fase C:** $0 (mismo Grafana free)
- **Fase D:** $0-19/mes (PagerDuty opcional)
- **Fase E:** $0-200+/mes (OTel free, Tempo free tier o Datadog APM)

### Score esperado tras implementar

| Fase | Score | Comentario |
|---|---|---|
| Actual | 4.5 / 10 | Sentry instalado pero dormido |
| Tras A | 6.0 / 10 | Errors visibles, uptime externo |
| Tras A+B | 7.5 / 10 | Estándar industria PYME |
| Tras A+B+C | 8.5 / 10 | SaaS profesional |
| Tras A-E | 9.5 / 10 | Enterprise-grade |

---

## Archivos a tocar (referencia rápida)

| Fase | Archivo | Cambio |
|---|---|---|
| A.1 | `backend/api/lifespan.py` | `sentry_sdk.init()` arriba |
| A.2 | `backend/utils/logging_utils.py` | Add JSON formatter opcional |
| A.2 | `backend/requirements.in` + `.txt` | `python-json-logger` |
| A.3 | (externo) | UptimeRobot/Better Stack config |
| B.1 | `backend/api/app.py` | Instrumentator wire en `create_app()` |
| B.1 | `backend/requirements.in` + `.txt` | `prometheus-fastapi-instrumentator` |
| B.2 | `docker-compose.yml` | Servicio `prometheus` |
| B.2 | `infra/prometheus.yml` (nuevo) | Config scrape + remote_write |
| B.2 | `.env` | `GRAFANA_PROM_USER`, `GRAFANA_PROM_API_KEY` |
| B.3 | (externo) | Grafana dashboards |
| C.1 | `backend/utils/llm_metrics.py` (nuevo) | Métricas custom LLM |
| C.1 | `backend/core/chain.py`, `chat/verifier.py` | Wire métricas alrededor LLM calls |
| C.2 | `backend/rag/vector_store/vector_store.py` | Wire métricas Qdrant |
| C.3 | `backend/database/mongodb.py` | Mongo command monitoring |
| C.4 | `backend/utils/llm_metrics.py` | `record_cost` helper + `PRICES` dict |

---

## Pregunta para retomar

> Antes de implementar, definir:
> 1. ¿Tienes ya cuenta Sentry.io? Si sí, DSN listo.
> 2. ¿Quieres Grafana Cloud (managed) o self-host Prometheus + Grafana en docker-compose?
> 3. ¿Qué Slack workspace para alerts?
> 4. ¿LLM provider único (OpenAI) o multi-provider (Groq/Anthropic) para diseñar labels métricas?

---

_Generado durante audit performance/observability — sesión 2026-04-29._
