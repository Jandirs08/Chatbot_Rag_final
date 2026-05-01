# negocio2026 — Análisis de Costos, Modelo de Negocio y Estrategia

Fecha: 2026-04-30  
Stack: FastAPI + MongoDB + Qdrant + Redis + OpenAI + Twilio + Next.js

---

## 1. Stack del Proyecto

| Capa | Tecnología |
|------|-----------|
| Backend | FastAPI, LangChain, Python 3.11 |
| LLM | OpenAI GPT-4o-mini, text-embedding-3-small |
| Vector DB | Qdrant 1.12.5 |
| Base de datos | MongoDB 8.2 |
| Cache / Sesiones | Redis 7 |
| Frontend | Next.js 14, Tailwind, TypeScript |
| WhatsApp | Twilio API |
| Email | Resend |
| Monitoreo | Sentry, LangSmith |
| Deploy frontend | Vercel |

---

## 2. Costos de Infraestructura

### Regla principal
Los planes free que "duermen" (Render Free, Railway Dev) no sirven para un bot de WhatsApp activo. El backend necesita estar siempre encendido.

### Backend — opciones viables

| Opción | Costo/mes | Specs | Notas |
|--------|-----------|-------|-------|
| Railway Starter | $5 | 512MB RAM, 1 vCPU | Fácil deploy Docker |
| Render Starter | $7 | Similar | Buen DX |
| **Hetzner CAX11** | ~$5 (€4.49) | 4GB RAM, 2 vCPU ARM | Mejor ROI — corre todo el stack |
| DigitalOcean 2GB | $12 | 2GB RAM | Confiable pero más caro |
| Fly.io | ~$3–5 | Variable | Config más compleja |

**Recomendado: Hetzner VPS** — 4GB RAM permite correr MongoDB + Qdrant + Redis + Backend en un solo docker-compose por $5/mes.

### Bases de datos

| Servicio | Free tier | Plan pago |
|----------|-----------|-----------|
| MongoDB Atlas M0 | ✅ 512MB, siempre activo | M2 = $9/mes |
| Qdrant Cloud | ✅ 1GB RAM, siempre activo | ~$10/mes |
| Upstash Redis | ✅ 256MB, 10K cmds/día | ~$2–5/mes |

En Hetzner VPS: los tres corren self-hosted incluidos en el precio del VPS.

### OpenAI — estimado de uso

GPT-4o-mini es muy barato. text-embedding-3-small aún más.

| Escenario | Tokens/mes | Costo |
|-----------|-----------|-------|
| Testing / 200 conversaciones | ~500K | ~$1 |
| 1 cliente activo / ~1K convs | ~2M | ~$3–5 |
| 5 clientes activos | ~10M | ~$15–25 |

### Servicios gratuitos suficientes para empezar

| Servicio | Free tier | Límite | ¿Suficiente? |
|----------|-----------|--------|--------------|
| Vercel Hobby | ✅ | 100GB bandwidth | Sí |
| Resend | ✅ | 3K emails/mes | Sí |
| Sentry | ✅ | 5K errors/mes | Sí |
| LangSmith | ✅ | 10K traces/mes | Sí |

---

## 3. WhatsApp — Análisis de Opciones

### Opción A: Twilio (actual en el código)
- Costo: ~$0.01/mensaje (inbound + outbound)
- 500 mensajes/mes = ~$5
- 2,000 mensajes/mes = ~$20
- Ventaja: ya funciona, cero código nuevo
- Sandbox de testing: gratis

### Opción B: Meta WhatsApp Cloud API (directo)
- Primeras 1,000 conversaciones/mes: **GRATIS**
- Después: ~$0.03/conversación en LatAm (ventana 24h)
- Sin comisión por mensajes dentro de una conversación
- Requiere: Facebook Business Verification (días/semanas) + migración de código

### Recomendación WhatsApp
- **Corto plazo**: quedarse con Twilio, funciona ahora
- **Mediano plazo**: migrar a Meta Cloud API — ahorra $10–20/mes, más profesional, mejor para escala

---

## 4. Resumen de Costos Totales

### MVP mínima (~$20–30/mes)
```
Hetzner VPS (backend + MongoDB + Qdrant + Redis)   $5
OpenAI (uso moderado)                               $5–15
Twilio WhatsApp (~1K mensajes)                      $10
Vercel + Resend + Sentry                            $0
─────────────────────────────────────────────────────
TOTAL                                               ~$20–30/mes
```

### Setup cómodo para cliente real (~$47–64/mes)
```
Railway/Render backend                              $5–7
MongoDB Atlas M2                                    $9
Qdrant Cloud                                        $10
Upstash Redis                                       $3
OpenAI (cliente activo)                             $15–25
WhatsApp (Twilio o Meta)                            $5–10
Vercel + resto                                      $0
─────────────────────────────────────────────────────
TOTAL                                               ~$47–64/mes
```

---

## 5. Modelos de Venta

### 5.1 Venta de código (one-time)

| Paquete | Precio | Incluye |
|---------|--------|---------|
| Solo repo | $800–1,500 | Código, README básico |
| Repo + docs + guía deploy | $2,500–4,000 | Documentación, guía Hetzner/Railway |
| Completo con soporte | $5,000–8,000 | Todo anterior + deploy incluido + 4 semanas soporte |

Target: agencias de marketing, empresas de software LatAm.

### 5.2 SaaS — modelos

**A. Multi-instancia (1 servidor por cliente)**
- Costo real por cliente: ~$30–50/mes (VPS pequeño)
- Precio a cliente: $99–200/mes
- Margen: $50–150/cliente
- Ventaja: aislamiento perfecto, fácil soporte
- Limitación: gestión manual, no hay panel superadmin

**B. Multi-tenant (1 servidor, N clientes)**
- Infra compartida: $80–120/mes total
- Precio por cliente: $49–149/mes
- Break-even: 2 clientes
- 10 clientes: $490–1,490/mes bruto
- Requiere: ~45–55 días de migración de código

**C. White-label para agencias**
- Agencia paga $199–500/mes por licencia
- Agencia revende a sus clientes
- Tú no tocas soporte final
- 5 agencias = $1K–2.5K/mes

---

## 6. Verticales con Mejor ROI

| Vertical | Dolor que resuelves | Precio viable/mes |
|----------|---------------------|-------------------|
| Educación / Institutos | Soporte alumnos 24/7 por WhatsApp | $99–199 |
| E-commerce | FAQ + seguimiento pedidos WhatsApp | $79–149 |
| Clínicas / Salud | Citas, preguntas frecuentes | $149–299 |
| Inmobiliarias | Consultas propiedades por WhatsApp | $199–399 |
| Municipios / Gobierno local | Atención ciudadana WhatsApp | $500–1,500 |

El dominio campusromero.pe indica contexto educativo — ese vertical es el más natural para empezar.

---

## 7. Multi-tenancy — Diagnóstico del Código

### Estado actual: 15% multi-tenant ready

El proyecto es single-tenant por diseño. Toda la data comparte espacio sin aislamiento entre clientes.

| Área | % listo | Días de migración |
|------|---------|------------------|
| Redis keys | 30% | 1 |
| Rate limiting | 0% | 0.5 |
| CORS | 40% | 1 |
| Auth / JWT + Roles | 15% | 4 |
| Bot Config | 0% | 2 |
| MongoDB (todos los repos) | 0% | 7 |
| Qdrant colecciones | 0% | 6 |
| PDF Storage | 0% | 6 |
| WhatsApp Routing | 50% | 6 |
| Tests + QA | — | +30% |
| **TOTAL** | | **~45–55 días** |

### Qué significa cada modelo

**Multi-instancia:** 1 servidor por cliente. Sin cambios de código. Ya funciona hoy.
```
cliente-a.tudominio.com  →  servidor A (docker-compose propio)
cliente-b.tudominio.com  →  servidor B (docker-compose propio)
```

**Multi-tenant:** 1 servidor, N clientes aislados por tenant_id en todos los datos.
```
tudominio.com/login  →  autenticación detecta tenant
                     →  Clínica X ve solo sus datos
                     →  Colegio Y ve solo sus datos
```

**SaaS self-service:** multi-tenant + registro automático + billing + panel de configuración del bot.

---

## 8. Comparación con Competencia (Chatbase)

Chatbase no es la competencia directa. Es un producto genérico para desarrolladores en mercado USA/EU.

| Feature | Chatbase Standard ($120/mes) | Tu solución ($99–150/mes) |
|---------|------------------------------|--------------------------|
| WhatsApp nativo | Básico | ✅ Integrado |
| Español LatAm | Genérico | ✅ Tu contexto |
| Soporte local | Ticket genérico | ✅ Directo |
| Precio en moneda local | USD fijo | Negociable |
| Personalización completa | Limitado por plan | ✅ Control total |
| Mensajes ilimitados | 4,000 créditos/mes | ✅ Solo pagas OpenAI |

Costo real de Chatbase Standard: $120/mes al cliente.  
Tu costo de infra por cliente: $30–50/mes.  
Tu precio: $99–150/mes.  
**Tu margen: $50–120/cliente.**

Chatbase necesita miles de clientes para ser rentable.  
Tú necesitas 5.

---

## 9. Hoja de Ruta Recomendada

### Inmediato (próximas 2 semanas)
- Deploy en Hetzner VPS $5 con docker-compose completo
- Quedarse con Twilio mientras se valida el mercado

### Corto plazo (1–2 meses)
- 3 pilotos pagos en educación/institutos a $99/mes
- Modelo: multi-instancia (1 VPS por cliente)
- Validar: soporte, onboarding, fricciones reales

### Mediano plazo (3–6 meses)
- Si pilotos funcionan → subir precio a $149–199/mes
- Migrar WhatsApp a Meta Cloud API (ahorro de costos)
- Si se quiere salida rápida de caja → vender código a 1 agencia por $3,000–5,000

### Largo plazo (6–12 meses)
- Con $1K+/mes de revenue → financiar migración multi-tenant real (~45 días)
- Agregar self-service (registro automático), billing Stripe, widget configurable
- Target: ser el Chatbase de LatAm para sectores específicos

### Números reales
```
5 clientes a $99/mes  =  $495/mes revenue
Costos infra total    =  $150/mes
Margen neto           =  ~$345/mes
```

No inviertas 8 semanas de desarrollo antes de tener validación de mercado.  
El mercado te dice si vale la pena construir el paso siguiente.
