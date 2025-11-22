# 🧪 Informe de Diagnóstico PRO — RAG Chatbot
**Fecha:** 2025-11-21 20:06:30

## 🟩 Estado General
- API health: OK
- CPU Host: 25.6%
- RAM Host: 92.9%
- CPU proceso Python: 0.0%
- RAM proceso Python: 40.83 MB

## 🟦 Métricas de Componentes
- Latencia OpenAI (via backend): 1.611s
- Latencia MongoDB: 0.046s
- Latencia Qdrant+RAG: 3.367s

## 🟨 Mini prueba de carga (20 requests)
- Promedio: 2.305s
- p50: 2.250s
- p95: 2.667s
- p99: 2.974s
- Requests fallidas: 0

## 🟥 Event Loop — Bloqueos detectados
- Bloqueo promedio: 0.00923s
- Bloqueo máximo: 0.01159s

## 🧩 Conclusión Automática
- **RAG está tardando → chunks grandes o Qdrant lento.**

---
