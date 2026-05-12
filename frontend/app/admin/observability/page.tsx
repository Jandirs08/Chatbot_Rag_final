"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { RefreshCw, AlertCircle, AlertTriangle, Timer } from "lucide-react";
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

const GATING_SUCCESS_KEYS = new Set(["agentic_rag_enabled", "cheap_gate_pass"]);

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
const fmtUsd = (n: number | null | undefined) =>
  n == null ? "—" : n < 0.0001 && n > 0 ? "<$0.0001" : `$${n.toFixed(4)}`;
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
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  useEffect(() => { setLastRefresh(new Date()); }, []);

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
    const successSev: Severity = !t60 || t60.chats < 20 ? "info" : evalSuccess(successRate60);
    const totalSev = evalLatency(totalP95, THRESHOLDS.p95Total);
    const ftSev = evalLatency(ftP95, THRESHOLDS.p95FirstToken);
    // Banner uses outage-level thresholds — normal OpenAI slowness doesn't trigger it
    const totalAlertSev = evalLatency(totalP95, THRESHOLDS.p95TotalAlert);
    const ftAlertSev = evalLatency(ftP95, THRESHOLDS.p95FirstTokenAlert);
    return { severities: { successSev, totalSev, ftSev }, overall: aggregate(successSev, totalAlertSev, ftAlertSev) };
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

  const { filteredGatingItems, filteredGatingTotal } = useMemo(() => {
    const items = gatingItems.filter((item) => !GATING_SUCCESS_KEYS.has(item.key));
    return { filteredGatingItems: items, filteredGatingTotal: items.reduce((acc, it) => acc + it.count, 0) };
  }, [gatingItems]);

  const cantAnswerCount = data
    ? (data.gating_reasons?.no_candidates ?? 0) +
      (data.gating_reasons?.no_parent_candidates ?? 0) +
      (data.gating_reasons?.reranker_empty ?? 0) +
      (data.gating_reasons?.low_relevance_score ?? 0)
    : 0;

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
                  {lastRefresh ? fmtClock(lastRefresh) : "—"}
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
              <section
                className="t-section-card sm:p-8"
                data-severity={severities.successSev}
              >
                <div className="flex items-center gap-2 mb-8">
                  <p className="t-heading">Indicadores Clave</p>
                  <HelpTooltip content="Métricas críticas que indican la salud operacional. Verde = dentro del objetivo. Amarillo = revisar. Rojo = acción inmediata." />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-8">
                  <TelemetryMetric
                    hero
                    label="Tasa de éxito (60 min)"
                    value={fmtPct(successRate60, 2)}
                    sub={t60 && t60.chats >= 20 ? `${fmtPct(t60.error_rate, 2)} con error` : "pocos datos aún"}
                    severity={severities.successSev}
                    tooltip="Porcentaje de chats completados sin error en la última hora. Se activa con 20+ chats."
                  />
                  <TelemetryMetric
                    hero
                    label="Primer token (p95)"
                    value={fmtMs(ftP95)}
                    sub="tiempo hasta primera palabra"
                    severity={severities.ftSev}
                    tooltip="Cuánto tarda el LLM en producir la primera palabra. Con OpenAI puede superar 5s en horas pico — es normal."
                  />
                  <TelemetryMetric
                    hero
                    label="Latencia total (p95)"
                    value={fmtMs(totalP95)}
                    sub="fin a fin de la respuesta"
                    severity={severities.totalSev}
                    tooltip="Tiempo total desde que el usuario envía hasta que recibe la respuesta completa. Solo afecta el banner si hay errores reales."
                  />
                  <TelemetryMetric
                    hero
                    label="Sin respuesta RAG"
                    value={fmtNum(cantAnswerCount)}
                    sub={t60?.chats ? `${((cantAnswerCount / t60.chats) * 100).toFixed(0)}% del tráfico` : "consultas sin doc relevante"}
                    severity={
                      t60?.chats && t60.chats >= 10
                        ? cantAnswerCount / t60.chats > 0.15 ? "warn" : cantAnswerCount > 0 ? "info" : "ok"
                        : "info"
                    }
                    tooltip="Consultas donde el bot no encontró documentos con suficiente relevancia. Ocurre cuando: (1) no hay PDFs cargados, (2) el tema no está cubierto en los docs, (3) la pregunta es muy distinta al contenido. Si supera 15% del tráfico, revisar la base de conocimiento."
                  />
                </div>
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

              {/* ── Throughput + Gating (asymmetric: 2/5 + 3/5) ─────────── */}
              <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
                {/* Throughput — compact left */}
                <section className="t-section-card lg:col-span-2">
                  <div className="flex items-center gap-2 mb-5">
                    <p className="t-section-title">Volumen de Tráfico</p>
                    <HelpTooltip content="Chats procesados en diferentes ventanas. Error rate muestra problemas operacionales." />
                  </div>
                  <div className="space-y-3">
                    {THROUGHPUT_WINDOWS.map((win) => {
                      const row = data.throughput[win];
                      if (!row) return null;
                      const errPct = row.error_rate * 100;
                      const sev: Severity = errPct >= 5 ? "crit" : errPct > 0 ? "warn" : "ok";
                      return (
                        <div key={win} className="flex flex-col gap-1.5 p-3 rounded-md" style={{ background: "var(--t-surface-deep)" }}>
                          <div className="flex items-center justify-between">
                            <span className="t-label">Últimos {win}</span>
                            <span className="t-mono-sm">{row.chats.toLocaleString("es-PE")} chats</span>
                          </div>
                          <div className="flex items-center justify-between">
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

                {/* Gating — wider right */}
                <section className="t-section-card lg:col-span-3">
                  <div className="flex items-center justify-between mb-5">
                    <div className="flex items-center gap-2">
                      <p className="t-section-title">Diagnóstico de Consultas</p>
                      <HelpTooltip content="Qué pasó con las consultas que no completaron el pipeline RAG. Excluye las que sí completaron búsqueda semántica completa." />
                    </div>
                    {filteredGatingTotal > 0 && (
                      <span className="t-mono-sm">{filteredGatingTotal} eventos</span>
                    )}
                  </div>
                  <GatingBars items={filteredGatingItems} total={filteredGatingTotal} />
                </section>
              </div>

              {/* ── Economía de Tokens Card ────────────────────────────────── */}
              <section className="t-section-card">
                <div className="flex items-center justify-between gap-2 mb-6">
                  <div className="flex items-center gap-2">
                    <p className="t-section-title">Tokens</p>
                    <HelpTooltip content="Consumo acumulado de LLM tokens. Se reinicia con el servidor." />
                  </div>
                  <span className="t-mono-sm">se reinicia con el servidor</span>
                </div>
                <div className="flex flex-col sm:flex-row gap-6">
                  {/* Cost — hero */}
                  <div className="flex flex-col gap-1.5 sm:pr-6 sm:border-r" style={{ borderColor: "var(--t-surface-edge)" }}>
                    <span className="t-label">Costo aproximado</span>
                    <span
                      style={{
                        fontFamily: "var(--font-telemetry-mono, 'JetBrains Mono', monospace)",
                        fontSize: "2.5rem",
                        fontWeight: 500,
                        letterSpacing: "-0.025em",
                        lineHeight: 1,
                        color: "var(--t-ink)",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {data.tokens.pending_token_callback ? "—" : fmtUsd(data.tokens.estimated_cost_usd)}
                    </span>
                    {data.tokens.pending_token_callback && (
                      <span className="t-small">esperando primer chat</span>
                    )}
                  </div>
                  {/* Token counts — supporting */}
                  <div className="flex gap-8 items-end">
                    <div className="flex flex-col gap-1.5">
                      <span className="t-label">Tokens entrada</span>
                      <span className="t-mono-xl">{fmtNum(data.tokens.tokens_in)}</span>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <span className="t-label">Tokens salida</span>
                      <span className="t-mono-xl">{fmtNum(data.tokens.tokens_out)}</span>
                    </div>
                  </div>
                </div>
              </section>

              {/* ── Meta Footer ─────────────────────────────────────────────── */}
              <footer
                className="pt-5 mt-2 border-t flex items-center gap-2.5"
                style={{ borderColor: "var(--t-surface-edge)" }}
              >
                <Timer className="h-3 w-3 shrink-0" style={{ color: "var(--t-ink-mute)" }} />
                <span className="t-label">Uptime</span>
                <span className="t-mono">{fmtUptime(data.uptime_seconds)}</span>
              </footer>

            </div>
          ) : null}
        </div>
      </div>
    </TooltipProvider>
  );
}
