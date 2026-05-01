COSTOS DE INFRAESTRUCTURA

Backend (el problema principal — no puede dormir)

┌──────────────────────────┬─────────────┬─────────────────────────────────────────────┬─────────────────────────┐ │ Opción │ Costo/mes │ Pros │ Contras │ ├──────────────────────────┼─────────────┼─────────────────────────────────────────────┼─────────────────────────┤ │ Railway Starter │ $5 │ Fácil deploy, siempre activo, Docker nativo │ Límite 512MB RAM │ ├──────────────────────────┼─────────────┼─────────────────────────────────────────────┼─────────────────────────┤ │ Render Starter │ $7 │ Simple, buen DX │ Un poco más caro │ ├──────────────────────────┼─────────────┼─────────────────────────────────────────────┼─────────────────────────┤ │ Hetzner VPS CAX11 │ ~$5 (€4.49) │ 2 vCPU ARM, 4GB RAM, todo en 1 │ Requiere gestión manual │ ├──────────────────────────┼─────────────┼─────────────────────────────────────────────┼─────────────────────────┤ │ DigitalOcean Droplet 2GB │ $12 │ Confiable, buena red │ Más caro que Hetzner │ ├──────────────────────────┼─────────────┼─────────────────────────────────────────────┼─────────────────────────┤ │ Fly.io │ ~$3–5 │ Muy barato │ Config más compleja │ └──────────────────────────┴─────────────┴─────────────────────────────────────────────┴─────────────────────────┘

Recomiendo: Hetzner VPS — 4GB RAM corre TODO el docker-compose (MongoDB + Qdrant + Redis + backend) en un solo servidor por $5/mes. Mejor ROI.

---

Bases de datos

┌──────────────────┬────────────────────────────┬─────────────┐ │ Servicio │ Free tier │ Pago │ ├──────────────────┼────────────────────────────┼─────────────┤ │ MongoDB Atlas M0 │ ✅ Siempre activo, 512MB │ M2 = $9/mes │ ├──────────────────┼────────────────────────────┼─────────────┤ │ Qdrant Cloud │ ✅ 1GB RAM, siempre activo │ ~$10/mes │ ├──────────────────┼────────────────────────────┼─────────────┤ │ Upstash Redis │ ✅ 256MB, 10K cmds/día │ ~$2–5/mes │ └──────────────────┴────────────────────────────┴─────────────┘

Si vas con Hetzner VPS: MongoDB, Qdrant y Redis van self-hosted incluidos. $0 adicional.

---

OpenAI

Tu stack usa gpt-4o-mini + text-embedding-3-small — muy barato.

┌──────────────────────────────┬──────────────┬────────────────┐ │ Escenario │ Tokens/mes │ Costo estimado │ ├──────────────────────────────┼──────────────┼────────────────┤ │ Testing / 200 convs │ ~500K tokens │ ~$1 │ ├──────────────────────────────┼──────────────┼────────────────┤ │ 1 cliente activo / ~1K convs │ ~2M tokens │ ~$3–5 │ ├──────────────────────────────┼──────────────┼────────────────┤ │ 5 clientes activos │ ~10M tokens │ ~$15–25 │ └──────────────────────────────┴──────────────┴────────────────┘

---

WhatsApp — ANÁLISIS CRÍTICO

Tienes código con Twilio. Hay 2 opciones reales:

Opción A: Twilio (actual)

- Setup: fácil, ya funciona
- Costo: $0.005 inbound + $0.005 outbound = ~$0.01/mensaje
- 500 mensajes/mes = ~$5
- 2000 mensajes/mes = ~$20
- Sandbox testing: gratis

Opción B: Meta WhatsApp Cloud API (directo)

- Primeras 1000 conversaciones/mes: GRATIS
- Después: $0.008–$0.084 por conversación (ventana 24h) según país
- LatAm está en tier más barato (~$0.03/conv)
- 0 comisión por mensajes dentro de conversación
- Requiere: Facebook Business Verification (días/semanas) + migración de código

Mi recomendación WhatsApp:

Corto plazo: Quédate con Twilio, funciona ahora. Mediano plazo: Migra a Meta API — ahorras $10–20/mes y es más profesional. La migración no es grande, cambias el cliente HTTP y los webhooks.

---

Frontend, Email, Monitoring

┌──────────────┬────────────────────────────┬────────────────────────┐ │ Servicio │ Tier gratis │ Suficiente? │ ├──────────────┼────────────────────────────┼────────────────────────┤ │ Vercel Hobby │ ✅ Gratis, 100GB bandwidth │ Sí para empezar │ ├──────────────┼────────────────────────────┼────────────────────────┤ │ Resend │ ✅ 3K emails/mes │ Sí, más que suficiente │ ├──────────────┼────────────────────────────┼────────────────────────┤ │ Sentry │ ✅ 5K errors/mes │ Sí │ ├──────────────┼────────────────────────────┼────────────────────────┤ │ LangSmith │ ✅ 10K traces/mes │ Sí │ └──────────────┴────────────────────────────┴────────────────────────┘

---

RESUMEN COSTOS TOTALES

Opción MVP Mínima (~$20–30/mes)

Hetzner VPS (backend + MongoDB + Qdrant + Redis) $5 OpenAI (uso moderado) $5–15 Twilio WhatsApp (1K mensajes) $10 Vercel + Resend + Sentry $0 ──────────────────────────────────────────────────── TOTAL ~$20–30/mes

Opción Cómoda para cliente real (~$40–60/mes)

Railway/Render backend $5–7 MongoDB Atlas M2 $9 Qdrant Cloud $10 Upstash Redis $3 OpenAI (cliente activo) $15–25 WhatsApp (Twilio o Meta) $5–10 Vercel + resto $0 ──────────────────────────────────────────────────── TOTAL ~$47–64/mes

---

CUÁNTO VENDER — ANÁLISIS DE NEGOCIO

1. Venta de código (one-time)

┌────────────────────────────┬──────────────┬────────────────────────────────────────────────────────┐ │ Paquete │ Precio │ Incluye │ ├────────────────────────────┼──────────────┼────────────────────────────────────────────────────────┤ │ Solo repo + setup básico │ $800–1,500 │ Código, README │ ├────────────────────────────┼──────────────┼────────────────────────────────────────────────────────┤ │ Repo + docs + deploy guide │ $2,500–4,000 │ Código, documentación, guía Hetzner/Railway │ ├────────────────────────────┼──────────────┼────────────────────────────────────────────────────────┤ │ Completo con soporte 1 mes │ $5,000–8,000 │ Todo anterior + te lo despliego yo + 4 semanas soporte │ └────────────────────────────┴──────────────┴────────────────────────────────────────────────────────┘

Mercado target para venta código: agencias de marketing, empresas de software LatAm que quieren chatbot interno.

---

2. SaaS — Opciones

A. Multi-tenant (1 instancia, N clientes)

- Infraestructura compartida: $80–120/mes total
- Precio por cliente: $49–149/mes
- Break-even: 2 clientes
- 10 clientes: $490–1490/mes bruto

B. Instancia dedicada por cliente (managed)

- Costo real por cliente: $30–50/mes (VPS pequeño)
- Precio a cliente: $150–300/mes
- Margen: $100–250/cliente
- Más fácil de soportar, no hay conflictos entre clientes

C. White-label para agencias

- Agencia paga $199–500/mes por licencia
- Agencia revende a sus propios clientes
- Tú no tocas soporte final
- 5 agencias = $1K–2.5K/mes pasivo

---

3. Verticals con mejor pago

┌─────────────────────────────┬────────────────────────────────────────┬───────────────┐ │ Vertical │ Dolor que resuelves │ Precio viable │ ├─────────────────────────────┼────────────────────────────────────────┼───────────────┤ │ Educación / Institutos │ WhatsApp soporte alumnos 24/7 │ $99–199/mes │ ├─────────────────────────────┼────────────────────────────────────────┼───────────────┤ │ E-commerce │ FAQ + seguimiento pedidos por WhatsApp │ $79–149/mes │ ├─────────────────────────────┼────────────────────────────────────────┼───────────────┤ │ Clínicas / Salud │ Citas, preguntas frecuentes │ $149–299/mes │ ├─────────────────────────────┼────────────────────────────────────────┼───────────────┤ │ Inmobiliarias │ Consultas propiedades por WhatsApp │ $199–399/mes │ ├─────────────────────────────┼────────────────────────────────────────┼───────────────┤ │ Municipios / Gobierno local │ Atención ciudadana WhatsApp │ $500–1500/mes │ └─────────────────────────────┴────────────────────────────────────────┴───────────────┘

Tu dominio campusromero.pe grita educación — ese vertical conoces, empieza ahí.

---

- 5 agencias = $1K–2.5K/mes pasivo

---

3. Verticals con mejor pago

┌─────────────────────────────┬────────────────────────────────────────┬───────────────┐ │ Vertical │ Dolor que resuelves │ Precio viable │ ├─────────────────────────────┼────────────────────────────────────────┼───────────────┤ │ Educación / Institutos │ WhatsApp soporte alumnos 24/7 │ $99–199/mes │ ├─────────────────────────────┼────────────────────────────────────────┼───────────────┤ │ E-commerce │ FAQ + seguimiento pedidos por WhatsApp │ $79–149/mes │ ├─────────────────────────────┼────────────────────────────────────────┼───────────────┤ │ Clínicas / Salud │ Citas, preguntas frecuentes │ $149–299/mes │ ├─────────────────────────────┼────────────────────────────────────────┼───────────────┤ │ Inmobiliarias │ Consultas propiedades por WhatsApp │ $199–399/mes │ ├─────────────────────────────┼────────────────────────────────────────┼───────────────┤ │ Municipios / Gobierno local │ Atención ciudadana WhatsApp │ $500–1500/mes │ └─────────────────────────────┴────────────────────────────────────────┴───────────────┘

Tu dominio campusromero.pe grita educación — ese vertical conoces, empieza ahí.

---

MI RECOMENDACIÓN COMO TECH LEAD

Inmediato (próximas 2 semanas):

- Deploy en Hetzner VPS $5 con docker-compose — todo en 1
- Quédate con Twilio mientras validas

Corto plazo (1–2 meses):

- 3 pilotos pagos en educación/institutos a $99/mes
- Valida soporte, onboarding, fricciones reales

Mediano plazo (3–6 meses):

- Migra WhatsApp a Meta Cloud API — ahorra costos
- Si pilotos funcionan → sube precio a $149–199
- Si quieres salida rápida de caja: vende el código a 1 agencia por $3,000–5,000

Número real:

- 5 clientes SaaS a $99/mes = $495/mes
- Costos infra total = $150/mes
- Margen neto: ~$345/mes para empezar

No es unicornio pero es negocio real. RAG + WhatsApp en español para LatAm tiene poca competencia seria.
