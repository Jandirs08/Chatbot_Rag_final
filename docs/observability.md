# Observability

Stack implementado: tres capas complementarias. Cada una activa de forma independiente.

---

## 1. Endpoints de salud (activos ahora, sin configuración)

Tres endpoints disponibles en el backend:

### `GET /api/v1/health` — liveness
App viva → 200. App muerta → sin respuesta. Sin dependencias externas.

```json
{ "status": "ok", "version": "1.0.0", "environment": "production" }
```

### `GET /api/v1/health/ready` — readiness
Valida MongoDB, Redis y Qdrant con timeouts de 3 s cada uno.

| Estado     | HTTP | Cuándo                                          |
|------------|------|-------------------------------------------------|
| `healthy`  | 200  | Todas las dependencias conectadas               |
| `degraded` | 200  | Redis caído (usando fallback InMemory)          |
| `unhealthy`| 503  | MongoDB o Qdrant desconectados                  |

```json
{
  "status": "healthy",
  "mongodb": { "status": "connected", "latency_ms": 12.4 },
  "redis":   { "status": "connected" },
  "qdrant":  { "status": "connected", "latency_ms": 8.1, "points_count": 4200 }
}
```

### `GET /api/v1/internal/status` — estado operacional
Estado interno: circuit breaker de Qdrant, disponibilidad RAG, backend de caché, uptime.
Siempre retorna 200 — el campo `status` indica la severidad.

| `status`    | Cuándo                                                     |
|-------------|------------------------------------------------------------|
| `ok`        | Todo nominal                                               |
| `degraded`  | Circuit breaker abierto, RAG no inicializado, o caché degradado |
| `critical`  | Circuit breaker abierto **y** caché degradado simultáneamente |

```json
{
  "status": "ok",
  "version": "1.0.0",
  "uptime_seconds": 86420.3,
  "rag_available": true,
  "cache_backend": "RedisCache",
  "cache_degraded": false,
  "qdrant_circuit_breaker": {
    "state": "closed",
    "failures": 0,
    "is_open": false
  }
}
```

**Ejemplo con Qdrant caído** (circuit abierto tras 5 fallos):
```json
{
  "status": "degraded",
  "rag_available": false,
  "qdrant_circuit_breaker": {
    "state": "open",
    "failures": 5,
    "is_open": true
  }
}
```

---

## 2. UptimeRobot (tier gratuito suficiente)

Crea tres monitores en [uptimerobot.com](https://uptimerobot.com):

### Monitor 1 — Liveness (app viva)
```
Tipo:        HTTP(S)
URL:         https://TU-APP.onrender.com/api/v1/health
Intervalo:   5 minutos
Alert:       cualquier código != 200
```

### Monitor 2 — Readiness (dependencias)
```
Tipo:        HTTP(S)
URL:         https://TU-APP.onrender.com/api/v1/health/ready
Intervalo:   5 minutos
Alert:       código 503
```
Este alerta cuando MongoDB o Qdrant están caídos.

### Monitor 3 — Estado interno (opcional, keyword)
```
Tipo:        Keyword
URL:         https://TU-APP.onrender.com/api/v1/internal/status
Keyword:     "critical"      ← alerta si aparece en la respuesta
Intervalo:   5 minutos
```
> Keyword monitoring requiere plan Pro en UptimeRobot. Alternativa gratuita: usar Monitor 2 que ya cubre los casos críticos.

**Qué notificaciones configurar:** email es suficiente para empezar. Telegram/Slack disponibles en el plan gratuito también.

---

## 3. Sentry — captura de errores (activar con variable de entorno)

### Activación en Render

1. Crear cuenta en [sentry.io](https://sentry.io) (tier gratuito: 5.000 errores/mes)
2. Crear proyecto → plataforma **Python** → copiar el DSN
3. En Render → Environment Variables:

```
SENTRY_DSN=https://xxxxxx@xxxxxxx.ingest.sentry.io/xxxxxxx
SENTRY_TRACES_SAMPLE_RATE=0.1
```

4. Redeploy → Sentry activo.

Sin `SENTRY_DSN` configurado → Sentry no se inicializa, cero overhead.

### Qué captura automáticamente

- Todas las excepciones no manejadas (500s)
- Stack trace completo con contexto de request (método, path, headers)
- Environment tag (`production` / `development`)
- Release tag (versión de la app)
- PII desactivado (`send_default_pii=False`)

### Cómo se ve en Sentry

Cada error aparece agrupado por tipo + stack trace. Ejemplo:

```
TimeoutError: LLM request exceeded 60.0s
  File "core/bot.py", line 88, in __call__
    result = await asyncio.wait_for(...)

  Request: POST /api/v1/chat/send
  Environment: production
  Release: 1.0.0
```

### Variable opcional

| Variable                    | Default | Descripción                                              |
|-----------------------------|---------|----------------------------------------------------------|
| `SENTRY_DSN`                | —       | DSN de Sentry. Sin esto, Sentry no se activa             |
| `SENTRY_TRACES_SAMPLE_RATE` | `0.1`   | Fracción de requests con tracing (0.0–1.0). Mantener bajo en free tier |

---

## Resumen: qué cubre cada capa

| Escenario                          | /health | /health/ready | /internal/status | Sentry |
|------------------------------------|---------|---------------|------------------|--------|
| App no responde (Render crash)     | ✓       | ✓             | ✓                |        |
| MongoDB caído                      |         | ✓ (503)       |                  |        |
| Qdrant caído (circuit open)        |         | ✓ (503)       | ✓ (degraded)     |        |
| Redis caído (usando InMemory)      |         | ✓ (degraded)  | ✓ (degraded)     |        |
| Excepción no manejada en runtime   |         |               |                  | ✓      |
| Timeout LLM                        |         |               |                  | ✓      |
| Error de validación / bug en código|         |               |                  | ✓      |
| Uptime histórico + SLA             | ✓       |               |                  |        |


  Tu acción: agregar SENTRY_DSN en Render                                                                                                                               
                                                                                                                                                                        
  1. Ve a https://sentry.io → crea cuenta gratis → New Project → Python                                                                                                 
  2. Copia el DSN (formato: https://xxx@oyyy.ingest.sentry.io/zzz)
  3. En Render → tu servicio → Environment → agrega:
  SENTRY_DSN = https://tu-dsn-aqui
  SENTRY_TRACES_SAMPLE_RATE = 0.1
  4. Redeplo