import { fmtNum as fmtNumLocale } from "@/app/lib/format";
import type { Severity } from "@/app/_components/telemetry";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LatencyBucket {
  count: number;
  p50: number | null;
  p95: number | null;
  p99: number | null;
  avg: number | null;
}

export interface ThroughputBucket {
  chats: number;
  chats_per_min: number;
  error_rate: number;
}

export interface ObservabilityData {
  ts: number;
  worker_pid: number;
  uptime_seconds: number;
  samples: { in_window: number; max: number; ttl_seconds: number };
  totals: {
    chats: number; success: number; error: number;
    rag_chats: number; rag_usage_rate: number; rate_limit_hits: number;
  };
  tokens: {
    tokens_in: number; tokens_out: number;
    pending_token_callback: boolean; estimated_cost_usd?: number;
  };
  latency_ms: Record<string, LatencyBucket>;
  throughput: Record<"1m" | "5m" | "15m" | "60m", ThroughputBucket>;
  gating_reasons: Record<string, number>;
}

export interface DependencyStatus {
  status: "connected" | "degraded" | "disconnected";
  latency_ms?: number; message?: string;
  backend?: string; collection?: string; points_count?: number;
}

export interface HealthReadyData {
  status: "healthy" | "degraded" | "unhealthy";
  mongodb: DependencyStatus; redis: DependencyStatus; qdrant: DependencyStatus;
}

export interface SystemStatusData {
  status: "ok" | "degraded" | "critical";
  version: string; uptime_seconds: number;
  rag_available: boolean; cache_backend: string; cache_degraded: boolean;
  qdrant_circuit_breaker: { state: string; failures: number; is_open: boolean };
}

// ─── Constants ────────────────────────────────────────────────────────────────

export const PIPELINE_STAGES = [
  { key: "embedding_ms", label: "Vectorización",   short: "Embed"   },
  { key: "dense_ms",     label: "Búsqueda densa",  short: "Dense"   },
  { key: "lexical_ms",   label: "Búsqueda léxica", short: "Lexical" },
  { key: "hydrate_ms",   label: "Hidratación",     short: "Hydrate" },
  { key: "rerank_ms",    label: "Re-ranking",      short: "Rerank"  },
  { key: "llm_ms",       label: "Modelo LLM",      short: "LLM"     },
];

export const THROUGHPUT_WINDOWS: ("1m" | "5m" | "15m" | "60m")[] = ["1m", "5m", "15m", "60m"];

export const GATING_SUCCESS_KEYS = new Set(["agentic_rag_enabled", "cheap_gate_pass"]);

export const GATING_LABELS: Record<string, string> = {
  agentic_rag_enabled: "Agentic RAG",
  small_talk: "Saludo / charla",
  empty_query: "Consulta vacía",
  punctuation_only: "Solo puntuación",
  too_short: "Muy corta",
  cheap_gate_pass: "Pasó filtro inicial",
  embedding_failed: "Falló vectorización",
  retrieval_backend_unavailable: "Backend caído",
  no_candidates: "Sin candidatos",
  no_parent_candidates: "Sin docs padre",
  reranker_empty: "Reranker vacío",
  low_relevance_score: "Relevancia baja",
  lexical_only: "Solo léxico",
};

export const THRESHOLDS = {
  successRate:   { ok: 0.99, warn: 0.95 },
  // Metric card coloring — calibrated for OpenAI GPT-4 with RAG context
  p95Total:      { ok: 15000, warn: 25000 },   // 15s ok, 25s warn
  p95FirstToken: { ok: 8000,  warn: 15000 },   // 8s ok, 15s warn
  // Banner alert — outage level only (truly broken, not just slow)
  p95TotalAlert:      { ok: 30000, warn: 50000 },
  p95FirstTokenAlert: { ok: 20000, warn: 35000 },
  pipeline: {
    embedding_ms: { ok: 500,  warn: 1500 },
    dense_ms:     { ok: 500,  warn: 1500 },
    lexical_ms:   { ok: 500,  warn: 1500 },
    hydrate_ms:   { ok: 500,  warn: 1500 },
    rerank_ms:    { ok: 200,  warn: 500  },
    llm_ms:       { ok: 8000, warn: 15000 },
  } as Record<string, { ok: number; warn: number }>,
};

export const REFRESH_MS = 30000;

// ─── Severity helpers ─────────────────────────────────────────────────────────

export const evalSuccess = (r: number | null): Severity =>
  r == null ? "info" : r >= THRESHOLDS.successRate.ok ? "ok" : r >= THRESHOLDS.successRate.warn ? "warn" : "crit";

export const evalLatency = (ms: number | null, t: { ok: number; warn: number }): Severity =>
  ms == null ? "info" : ms <= t.ok ? "ok" : ms <= t.warn ? "warn" : "crit";

export const aggregate = (...s: Severity[]): Severity =>
  s.includes("crit") ? "crit" : s.includes("warn") ? "warn" : s.every((x) => x === "info") ? "info" : "ok";

export const depSeverity = (s: DependencyStatus | undefined): Severity =>
  !s ? "info" : s.status === "connected" ? "ok" : s.status === "degraded" ? "warn" : "crit";

// ─── Formatters ───────────────────────────────────────────────────────────────

export const fmtNum = (n: number | null | undefined) =>
  n == null ? "—" : fmtNumLocale(Math.round(n));

export const fmtMs = (n: number | null | undefined) => {
  if (n == null) return "—";
  return n < 1000 ? `${Math.round(n)} ms` : `${(n / 1000).toFixed(n < 10000 ? 2 : 1)} s`;
};

export const fmtPct = (n: number | null | undefined, d = 1) =>
  n == null ? "—" : `${(n * 100).toFixed(d)}%`;

export const fmtUsd = (n: number | null | undefined) =>
  n == null ? "—" : n < 0.0001 && n > 0 ? "<$0.0001" : `$${n.toFixed(4)}`;

export const fmtUptime = (s: number) => {
  const sec = Math.max(0, Math.floor(s));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${sec % 60}s` : `${sec}s`;
};

export const fmtClock = (d: Date) =>
  d.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
