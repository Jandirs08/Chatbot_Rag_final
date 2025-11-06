Param(
  [string]$BaseUrl = "http://localhost:8000/api/v1"
)

$ErrorActionPreference = "Stop"

$outDir = "docs/scripts/output"
New-Item -ItemType Directory -Path $outDir -Force | Out-Null
$outFile = Join-Path $outDir "e2e_results.txt"
Remove-Item -Force $outFile -ErrorAction Ignore

function Log($msg) {
  Add-Content -Path $outFile -Value ("[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $msg)
}

try {
  Log "=== E2E RAG Tests (Docker) ==="

  # Health check
  Log "Health check"
  $health = Invoke-RestMethod -Uri "$BaseUrl/health/health" -Method Get
  Log ("Health: " + ($health | ConvertTo-Json -Compress))

  # Upload sample PDF
  Log "Upload sample PDF"
  $uploadCmd = "curl -s -X POST -F `"file=@docs/scripts/sample.pdf`" $BaseUrl/pdfs/upload"
  $uploadResult = Invoke-Expression $uploadCmd
  Log ("Upload: " + $uploadResult)

  # List PDFs
  Log "List PDFs"
  $pdfs = Invoke-RestMethod -Uri "$BaseUrl/pdfs/list" -Method Get
  Log ("PDFs: " + ($pdfs | ConvertTo-Json -Compress))

  # Chat stream (SSE)
  Log "Chat stream"
  $chatPayload = '{"input":"Prueba de RAG con OpenAI embeddings","conversation_id":null}'
  $chatCmd = "curl -s -H `"Content-Type: application/json`" -d '$chatPayload' $BaseUrl/chat/stream_log"
  $chatStream = Invoke-Expression $chatCmd
  Log ("Chat stream raw: " + $chatStream)

  # Stats
  Log "Stats"
  $stats = Invoke-RestMethod -Uri "$BaseUrl/chat/stats" -Method Get
  Log ("Stats: " + ($stats | ConvertTo-Json -Compress))

  Log "=== E2E Completed ==="
}
catch {
  Log ("ERROR: " + $_.Exception.Message)
  throw
}