# 🧪 Informe de Diagnóstico PRO — RAG Chatbot
**Fecha:** 2025-11-20 17:03:20

## 🟩 Estado General
- API health: OK
- CPU Host: 34.5%
- RAM Host: 87.3%
- CPU proceso Python: 0.0%
- RAM proceso Python: 48.56 MB

## 🟦 Métricas de Componentes
- Latencia OpenAI (via backend): 4.129s
- Latencia MongoDB: 0.048s
- Latencia Qdrant+RAG: 1.528s

## 🟨 Mini prueba de carga (20 requests)
- Promedio: 1.149s
- p50: 0.958s
- p95: 2.264s
- p99: 2.746s
- Requests fallidas: 0

## 🟥 Event Loop — Bloqueos detectados
- Bloqueo promedio: 0.00891s
- Bloqueo máximo: 0.01307s

## 🧩 Conclusión Automática
- **OpenAI está lento → cuello principal.**

---
