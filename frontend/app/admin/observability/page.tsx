"use client";

import React, { useCallback, useMemo, useState } from "react";
import useSWR from "swr";
import { RefreshCw, AlertCircle, AlertTriangle } from "lucide-react";
import { useRequireAdmin } from "@/app/hooks/useAuthGuard";
import { useRingBuffer } from "@/app/hooks/useRingBuffer";
import { API_URL } from "@/app/lib/config";
import { authenticatedJsonFetcher } from "@/app/lib/services/authService";
import { Switch } from "@/app/components/ui/switch";
import { Skeleton } from "@/app/components/ui/skeleton";
import { TooltipProvider } from "@/app/components/ui/tooltip";
import {
  HealthLabel,
  HelpTooltip,
  PipelineWaterfall,
  ServiceTile,
  TelemetryMetric,
  GatingBars,
  Sparkline,
  type Severity,
  type WaterfallStage,
  type GatingItem,
} from "@/app/_components/telemetry";

// ─── Types ────────────────────────────────────────────────────────────────────

interface LatencyBucket {
  count: number;
  p50: number | null;
  p95: number | null;
  p99: number | null;
  avg: number | null;
}

interface ThroughputBucket {
  chats: number;
  chats_per_min: number;
  error_rate: number;
}

interface ObservabilityData {
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

interface DependencyStatus {
  status: "connected" | "degraded" | "disconnected";
  latency_ms?: number; message?: string;
  backend?: string; collection?: string; points_count?: number;
}

interface HealthReadyData {
  status: "healthy" | "degraded" | "unhealthy";
  mongodb: DependencyStatus; redis: DependencyStatus; qdrant: DependencyStatus;
}

interface SystemStatusData {
  status: "ok" | "degraded" | "critical";
  version: string; uptime_seconds: number;
  rag_available: boolean; cache_backend: string; cache_degraded: boolean;
  qdrant_circuit_breaker: { state: string; failures: number; is_open: boolean };
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PIPELINE_STAGES = [
  { key: "embedding_ms", label: "Vectorización",   short: "Embed"   },
  { key: "dense_ms",     label: "Búsqueda densa",  short: "Dense"   },
  { key: "lexical_ms",   label: "Búsqueda léxica", short: "Lexical" },
  { key: "hydrate_ms",   label: "Hidratación",     short: "Hydrate" },
  { key: "rerank_ms",    label: "Re-ranking",      short: "Rerank"  },
  { key: "llm_ms",       label: "Modelo LLM",      short: "LLM"     },
];

const THROUGHPUT_WINDOWS: ("1m" | "5m" | "15m" | "60m")[] = ["1m", "5m", "15m", "60m"];

const GATING_LABELS: Record<string, string> = {
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

const THRESHOLDS = {
  successRate:   { ok: 0.99, warn: 0.95 },
  p95Total:      { ok: 5000, warn: 10000 },
  p95FirstToken: { ok: 3000, warn: 6000 },
  pipeline: {
    embedding_ms: { ok: 500,  warn: 1500 },
    dense_ms:     { ok: 500,  warn: 1500 },
    lexical_ms:   { ok: 500,  warn: 1500 },
    hydrate_ms:   { ok: 500,  warn: 1500 },
    rerank_ms:    { ok: 200,  warn: 500  },
    llm_ms:       { ok: 4500, warn: 8000 },
  } as Record<string, { ok: number; warn: number }>,
};

const REFRESH_MS = 30000;

// ─── Severity helpers ─────────────────────────────────────────────────────────

const evalSuccess = (r: number | null): Severity =>
  r == null ? "info" : r >= THRESHOLDS.successRate.ok ? "ok" : r >= THRESHOLDS.successRate.warn ? "warn" : "crit";

const evalLatency = (ms: number | null, t: { ok: number; warn: number }): Severity =>
  ms == null ? "info" : ms <= t.ok ? "ok" : ms <= t.warn ? "warn" : "crit";

const aggregate = (...s: Severity[]): Severity =>
  s.includes("crit") ? "crit" : s.includes("warn") ? "warn" : s.every((x) => x === "info") ? "info" : "ok";

const depSeverity = (s: DependencyStatus | undefined): Severity =>
  !s ? "info" : s.status === "connected" ? "ok" : s.status === "degraded" ? "warn" : "crit";

// ─── Formatters ───────────────────────────────────────────────────────────────

const fmtNum = (n: number | null | undefined) => (n == null ? "—" : Math.round(n).toLocaleString("es-PE"));
const fmtMs = (n: number | null | undefined) => {
  if (n == null) return "—";
  return n < 1000 ? `${Math.round(n)} ms` : `${(n / 1000).toFixed(n < 10000 ? 2 : 1)} s`;
};
const fmtPct = (n: number | null | undefined, d = 1) => (n == null ? "—" : `${(n * 100).toFixed(d)}%`);
const fmtUsd = (n: number | null | undefined) => (n == null ? "—" : `$${n.toFixed(4)}`);
const fmtUptime = (s: number) => {
  const sec = Math.max(0, Math.floor(s));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${sec % 60}s` : `${sec}s`;
};
const fmtClock = (d: Date) =>
  d.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="space-y-12">
      <Skeleton className="h-24 w-full max-w-md" />
      <Skeleton className="h-20 w-full" />
      <Skeleton className="h-48 w-full" />
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ObservabilityPage() {
  const { isAuthorized, isChecking } = useRequireAdmin();
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(new Date());

  const { data, isLoading, error, mutate, isValidating } = useSWR<ObservabilityData>(
    isAuthorized ? `${API_URL}/dashboard/observability` : null,
    authenticatedJsonFetcher,
    { refreshInterval: autoRefresh ? REFRESH_MS : 0, onSuccess: () => setLastRefresh(new Date()) },
  );

  const { data: healthData } = useSWR<HealthReadyData>(
    isAuthorized ? `${API_URL}/health/ready` : null,
    authenticatedJsonFetcher,
    { refreshInterval: 15000 },
  );
  const { data: statusData } = useSWR<SystemStatusData>(
    isAuthorized ? `${API_URL}/internal/status` : null,
    authenticatedJsonFetcher,
    { refreshInterval: 15000 },
  );

  const handleRefresh = useCallback(() => mutate(), [mutate]);

  // Telemetry buffers — push current snapshot each tick
  const t60 = data?.throughput?.["60m"];
  const successRate60 = t60 && t60.chats > 0 ? 1 - t60.error_rate : null;
  const totalP95 = data?.latency_ms?.total_ms?.p95 ?? null;
  const ftP95 = data?.latency_ms?.first_token_ms?.p95 ?? null;

  const successBuf = useRingBuffer(successRate60 != null ? successRate60 * 100 : null, {
    capacity: 60, storageKey: "success60",
  });
  const chatsPerMinBuf = useRingBuffer(t60?.chats_per_min ?? null, {
    capacity: 60, storageKey: "chats_per_min",
  });
  const ftBuf = useRingBuffer(ftP95, { capacity: 60, storageKey: "ft_p95" });
  const totalBuf = useRingBuffer(totalP95, { capacity: 60, storageKey: "total_p95" });

  const mongoLatBuf = useRingBuffer(healthData?.mongodb?.latency_ms ?? null, {
    capacity: 60, storageKey: "mongo_lat",
  });
  const qdrantLatBuf = useRingBuffer(healthData?.qdrant?.latency_ms ?? null, {
    capacity: 60, storageKey: "qdrant_lat",
  });

  const { overall, severities } = useMemo(() => {
    const successSev: Severity = t60?.chats === 0 ? "info" : evalSuccess(successRate60);
    const totalSev = evalLatency(totalP95, THRESHOLDS.p95Total);
    const ftSev = evalLatency(ftP95, THRESHOLDS.p95FirstToken);
    return { severities: { successSev, totalSev, ftSev }, overall: aggregate(successSev, totalSev, ftSev) };
  }, [t60, successRate60, totalP95, ftP95]);

  const stages: WaterfallStage[] = useMemo(() => {
    if (!data) return [];
    return PIPELINE_STAGES
      .map((stage) => {
        const bucket = data.latency_ms[stage.key];
        if (!bucket || bucket.count === 0) return null;
        const t = THRESHOLDS.pipeline[stage.key] ?? { ok: 1000, warn: 3000 };
        return {
          key: stage.key,
          label: stage.label,
          short: stage.short,
          p50: bucket.p50,
          p95: bucket.p95,
          count: bucket.count,
          severity: evalLatency(bucket.p95, t),
        };
      })
      .filter(Boolean) as WaterfallStage[];
  }, [data]);

  const gatingItems: GatingItem[] = useMemo(() => {
    if (!data) return [];
    return Object.entries(data.gating_reasons || {}).map(([key, count]) => ({
      key,
      label: GATING_LABELS[key] ?? key,
      count,
    }));
  }, [data]);

  const gatingTotal = gatingItems.reduce((acc, it) => acc + it.count, 0);

  if (isChecking || !isAuthorized) return null;

  return (
    <TooltipProvider>
      <div data-surface="telemetry" className="min-h-full -m-6 p-8 md:p-12 lg:p-14">
        <div className="mx-auto max-w-[1100px]">

          {/* ── Header ──────────────────────────────────────────────────────── */}
          <header className="flex items-start justify-between gap-8 pb-8 mb-8 border-b" style={{ borderColor: "var(--t-surface-edge)" }}>
            <div>
              <div className="flex items-center gap-2 mb-4">
                <span className="text-xs font-mono uppercase tracking-wide" style={{ color: "var(--t-ink-soft)" }}>Sistema</span>
                <HealthLabel severity={overall} />
              </div>
              <h1 className="t-title text-4xl font-bold mb-3">Estado del sistema</h1>
              <p className="t-body max-w-2xl">
                Métricas en vivo del backend. Actualiza cada 30 segundos.
              </p>
            </div>

            <div className="flex flex-col items-end gap-4">
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <Switch checked={autoRefresh} onCheckedChange={setAutoRefresh} className="h-4 w-8 [&>span]:h-3 [&>span]:w-3 [&>span[data-state=checked]]:translate-x-4" />
                  <span className="t-label">Auto-actualizar</span>
                </label>
                <button
                  type="button"
                  onClick={handleRefresh}
                  disabled={isValidating}
                  className="t-mono-sm inline-flex items-center gap-1.5 px-3 py-1.5 rounded-sm border transition-colors hover:bg-[var(--t-surface)]"
                  style={{ borderColor: "var(--t-surface-edge)", color: "var(--t-ink-mid)" }}
                >
                  <RefreshCw className={`h-3 w-3 ${isValidating ? "animate-spin" : ""}`} />
                  {fmtClock(lastRefresh)}
                </button>
              </div>
            </div>
          </header>

          {/* ── Critical/Warning Alert Banner ────────────────────────────── */}
          {overall === 'crit' && (
            <div className="t-crit-banner flex items-start gap-3 mb-8">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" style={{ color: "var(--t-signal-deep)" }} />
              <div>
                <p className="t-section-title" style={{ color: "var(--t-signal-deep)" }}>Sistema en estado crítico</p>
                <p className="t-small mt-1">Revisa la sección de Servicios Externos y los Indicadores Clave para identificar el problema.</p>
              </div>
            </div>
          )}
          {overall === 'warn' && (
            <div className="t-warn-banner flex items-start gap-3 mb-8">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" style={{ color: "var(--t-signal)" }} />
              <div>
                <p className="t-section-title" style={{ color: "var(--t-signal)" }}>Atención requerida</p>
                <p className="t-small mt-1">Una o más métricas están fuera de sus objetivos normales.</p>
              </div>
            </div>
          )}

          {error && !data && (
            <div className="flex items-center gap-3 mb-12 px-4 py-3 rounded-sm" style={{ background: "var(--t-signal-soft)", color: "var(--t-signal-deep)" }}>
              <AlertCircle className="h-4 w-4" />
              <span className="t-small" style={{ color: "var(--t-signal-deep)" }}>
                No se pudo cargar las métricas. Verifica tu conexión.
              </span>
            </div>
          )}

          {isLoading && !data ? (
            <LoadingSkeleton />
          ) : data ? (
            <div className="space-y-8">

              {/* ── KPIs Card ───────────────────────────────────────────────── */}
              <section className="t-section-card" data-severity={severities.successSev}>
                <div className="flex items-center gap-2 mb-6">
                  <p className="t-section-title">Indicadores Clave</p>
                  <HelpTooltip content="Métricas críticas que indican la salud operacional. Verde = dentro del objetivo. Amarillo = revisar. Rojo = acción inmediata." />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                  <TelemetryMetric
                    hero
                    label="Tasa de éxito (60 min)"
                    value={fmtPct(successRate60, 2)}
                    sub={t60 ? `${fmtPct(t60.error_rate, 2)} con error` : undefined}
                    severity={severities.successSev}
                    samples={successBuf}
                    tooltip="Porcentaje de chats completados sin error. Objetivo: >99%."
                  />
                  <TelemetryMetric
                    hero
                    label="Primer Token (p95)"
                    value={fmtMs(ftP95)}
                    sub={ftP95 != null ? "objetivo < 3 s" : undefined}
                    severity={severities.ftSev}
                    samples={ftBuf}
                    tooltip="Tiempo hasta que el LLM produce el primer token. Afecta la percepción de velocidad del usuario."
                  />
                  <TelemetryMetric
                    hero
                    label="Latencia Total (p95)"
                    value={fmtMs(totalP95)}
                    sub={totalP95 != null ? "objetivo < 5 s" : undefined}
                    severity={severities.totalSev}
                    samples={totalBuf}
                    tooltip="Tiempo completo desde consulta hasta respuesta final. SLA típico: <5s para 95% de requests."
                  />
                </div>

                {t60 && (
                  <div className="pt-4 mt-4 border-t" style={{ borderColor: "var(--t-surface-edge)" }}>
                    <p className="t-small"><span className="font-semibold">Throughput actual:</span> {t60.chats_per_min.toFixed(1)} chats/min · {t60.chats.toLocaleString("es-PE")} en última hora</p>
                  </div>
                )}
              </section>

              {/* ── Servicios Externos Card ─────────────────────────────────── */}
              <section className="t-section-card">
                <div className="flex items-center gap-2 mb-5">
                  <p className="t-section-title">Servicios Externos — Estado Actual</p>
                  <HelpTooltip content="Dependencias críticas que el backend necesita para funcionar. Si alguno cae (rojo), afecta al chat." />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <ServiceTile
                    name="MongoDB"
                    variant="db"
                    severity={depSeverity(healthData?.mongodb)}
                    primary={healthData?.mongodb?.latency_ms != null ? `${healthData.mongodb.latency_ms} ms` : "—"}
                    secondary={healthData?.mongodb?.status}
                    samples={mongoLatBuf}
                    tooltip="Base de datos principal. Si cae, usuarios no pueden guardar conversaciones."
                  />
                  <ServiceTile
                    name="Redis"
                    variant="cache"
                    severity={depSeverity(healthData?.redis)}
                    primary={healthData?.redis?.backend ?? healthData?.redis?.status ?? "—"}
                    secondary={depSeverity(healthData?.redis) === "warn" ? "fallback memoria" : undefined}
                    tooltip="Cache en memoria. Si falla, fallback a memoria del sistema."
                  />
                  <ServiceTile
                    name="Qdrant"
                    variant="vector"
                    severity={depSeverity(healthData?.qdrant)}
                    primary={healthData?.qdrant?.latency_ms != null ? `${healthData.qdrant.latency_ms} ms` : "—"}
                    secondary={
                      statusData?.qdrant_circuit_breaker
                        ? `CB ${statusData.qdrant_circuit_breaker.state}`
                        : healthData?.qdrant?.points_count != null
                        ? `${healthData.qdrant.points_count.toLocaleString("es-PE")} vectores`
                        : undefined
                    }
                    samples={qdrantLatBuf}
                    tooltip="Motor de búsqueda vectorial. Si cae, no hay búsqueda semántica."
                  />
                  <ServiceTile
                    name="RAG Engine"
                    variant="engine"
                    severity={statusData?.rag_available ? "ok" : statusData ? "warn" : "info"}
                    primary={statusData ? (statusData.rag_available ? "disponible" : "no disponible") : "—"}
                    secondary={statusData ? `v${statusData.version}` : undefined}
                    tooltip="Motor de recuperación aumentada por generación. Orquesta búsqueda + LLM."
                  />
                </div>
              </section>

              {/* ── Pipeline RAG Card ───────────────────────────────────────── */}
              <section className="t-section-card">
                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center gap-2">
                    <p className="t-section-title">Pipeline RAG — Tiempo por Etapa</p>
                    <HelpTooltip content="Cuánto tarda cada fase del pipeline. p50 = mediana, p95 = el 95% más lento. Identifica cuellos de botella." />
                  </div>
                  {data.latency_ms.total_ms?.p50 != null && (
                    <span className="t-mono-sm">
                      p50 {fmtMs(data.latency_ms.total_ms.p50)} · p95 {fmtMs(totalP95)}
                    </span>
                  )}
                </div>
                {stages.length === 0 ? (
                  <p className="t-small">Sin muestras en la ventana actual.</p>
                ) : (
                  <PipelineWaterfall stages={stages} total={data.latency_ms.total_ms?.p50 ?? null} />
                )}
              </section>

              {/* ── Throughput + Gating (2-col) ───────────────────────────── */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Throughput */}
                <section className="t-section-card">
                  <div className="flex items-center gap-2 mb-5">
                    <p className="t-section-title">Volumen de Tráfico</p>
                    <HelpTooltip content="Chats procesados en diferentes ventanas temporales. Error rate muestra problemas operacionales." />
                  </div>
                  <div className="space-y-3">
                    {THROUGHPUT_WINDOWS.map((win) => {
                      const row = data.throughput[win];
                      if (!row) return null;
                      const errPct = row.error_rate * 100;
                      const sev: Severity = errPct >= 5 ? "crit" : errPct > 0 ? "warn" : "ok";
                      return (
                        <div key={win} className="flex flex-col gap-2 p-3 rounded-md" style={{ background: "var(--t-surface-deep)" }}>
                          <div className="flex items-center justify-between">
                            <span className="t-label">Últimos {win}</span>
                            <span className="t-mono-sm">{row.chats.toLocaleString("es-PE")} chats</span>
                          </div>
                          <div className="flex items-center justify-between text-xs">
                            <span className="t-mono-sm">{row.chats_per_min.toFixed(1)}/min</span>
                            <span className="t-mono-sm" data-severity={sev}>
                              Error: {errPct.toFixed(2)}%
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>

                {/* Gating */}
                <section className="t-section-card">
                  <div className="flex items-center justify-between mb-5">
                    <div className="flex items-center gap-2">
                      <p className="t-section-title">¿Por Qué se Filtraron?</p>
                      <HelpTooltip content="Razones por las que una consulta no pasó por RAG completo. Útil para entender tráfico." />
                    </div>
                    {gatingTotal > 0 && (
                      <span className="t-mono-sm">{gatingTotal} eventos</span>
                    )}
                  </div>
                  <GatingBars items={gatingItems} total={gatingTotal} />
                </section>
              </div>

              {/* ── Economía de Tokens Card ────────────────────────────────── */}
              <section className="t-section-card">
                <div className="flex items-center gap-2 mb-5">
                  <p className="t-section-title">Economía de Tokens — Desde Arranque</p>
                  <HelpTooltip content="Consumo acumulado de LLM tokens. Útil para estimar costos mensuales y tendencias de uso." />
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-8 gap-y-6">
                  <div className="flex flex-col gap-2">
                    <span className="t-label">Costo Aproximado</span>
                    <span className="t-display text-3xl font-bold">
                      {data.tokens.pending_token_callback ? "—" : fmtUsd(data.tokens.estimated_cost_usd)}
                    </span>
                    {data.tokens.pending_token_callback && (
                      <span className="t-small">esperando primer chat</span>
                    )}
                  </div>
                  <div className="flex flex-col gap-2">
                    <span className="t-label">Tokens Entrada</span>
                    <span className="t-mono-xl">{fmtNum(data.tokens.tokens_in)}</span>
                  </div>
                  <div className="flex flex-col gap-2">
                    <span className="t-label">Tokens Salida</span>
                    <span className="t-mono-xl">{fmtNum(data.tokens.tokens_out)}</span>
                  </div>
                  <div className="flex flex-col gap-2">
                    <span className="t-label">Ratio Salida/Entrada</span>
                    <span className="t-mono-xl">
                      {data.tokens.tokens_in > 0
                        ? (data.tokens.tokens_out / data.tokens.tokens_in).toFixed(2)
                        : "—"}
                    </span>
                  </div>
                </div>
              </section>

              {/* ── Meta Footer ─────────────────────────────────────────────── */}
              <footer className="pt-6 mt-2 border-t" style={{ borderColor: "var(--t-surface-edge)" }}>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-8 gap-y-3">
                  <div className="flex flex-col gap-1">
                    <span className="t-label">Worker PID</span>
                    <span className="t-mono">{data.worker_pid}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="t-label">Muestras</span>
                    <span className="t-mono">{data.samples.in_window}/{data.samples.max}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="t-label">Ventana TTL</span>
                    <span className="t-mono">{Math.round(data.samples.ttl_seconds / 60)} min</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="t-label">Uptime</span>
                    <span className="t-mono">{fmtUptime(data.uptime_seconds)}</span>
                  </div>
                </div>
              </footer>

            </div>
          ) : null}
        </div>
      </div>
    </TooltipProvider>
  );
}
