# PR1 — Sesión de Traza de Recuperación (Docker)

Este documento presenta una ejecución real del endpoint `retrieve-debug` en el entorno Docker, evidenciando la traza de recuperación, el contexto generado y las métricas de rendimiento.

## Entorno
- Backend: `http://localhost:8000/api/v1`
- Autenticación: usuario admin provisionado (`admin2@example.com`)

## Comandos ejecutados
- Login admin y llamada al endpoint:
```
$base = "http://localhost:8000/api/v1"
$login = Invoke-RestMethod -Uri "$base/auth/login" -Method Post -ContentType "application/json" -Body '{"email":"admin2@example.com","password":"Admin123!"}'
$token = $login.access_token
$headers = @{ Authorization = "Bearer $token" }
$payload = @{ query = "Prueba de RAG con OpenAI embeddings"; k = 4; include_context = $true } | ConvertTo-Json -Depth 3
Invoke-RestMethod -Uri "$base/rag/retrieve-debug" -Method Post -ContentType "application/json" -Headers $headers -Body $payload | ConvertTo-Json -Depth 4
```

## Respuesta (extracto JSON)
```
{
  "query": "Prueba de RAG con OpenAI embeddings",
  "k": 4,
  "retrieved": [
    {
      "score": 0.7850,
      "source": "rag-doc.pdf",
      "file_path": "/app/backend/storage/documents/pdfs/rag-doc.pdf",
      "content_hash": "c3aa7755c78adfbd7548b2a6c355f044",
      "chunk_type": "numbered_list",
      "word_count": 112,
      "preview": "1. Actualización de Proyectos Clave ..."
    },
    {
      "score": 0.8040,
      "source": "rag-doc.pdf",
      "file_path": "/app/backend/storage/documents/pdfs/rag-doc.pdf",
      "content_hash": "7a8a193892e891ac678537333b884f8e",
      "chunk_type": "text",
      "word_count": 52,
      "preview": "Los gastos de comida no deben exceder ..."
    },
    {
      "score": 0.8014,
      "source": "rag-doc.pdf",
      "file_path": "/app/backend/storage/documents/pdfs/rag-doc.pdf",
      "content_hash": "0b64d3ae5ca55bd63f90d264378a9ac2",
      "chunk_type": "text",
      "word_count": 116,
      "preview": "El proyecto se reanudará tentativamente ..."
    }
  ],
  "context": "Información relevante encontrada: ...",
  "timings": {
    "vector_retrieval": { "min": 1.56, "max": 2.68, "avg": 2.05, "median": 1.90, "count": 3 }
  }
}
```

## Hallazgos
- El endpoint devuelve:
  - Lista de chunks con metadatos clave (`score`, `source`, `hash`, `chunk_type`, `word_count`, `preview`).
  - `context` formateado listo para inyección al LLM.
  - `timings` consolidando métricas de recuperación.
- La codificación de caracteres en `preview/context` puede mostrar sustituciones si el cliente no renderiza UTF-8; el contenido base se conserva correctamente en el backend.

## Conclusión
- La traza de recuperación real confirma que PR1 está operativo en Docker.
- La información es suficiente para auditoría y validación posterior: se puede evaluar relevancia y calidad por chunk, y el contexto utilizado por el LLM.