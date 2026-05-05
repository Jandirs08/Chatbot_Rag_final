"use client";

import React, { useCallback, useMemo, useState } from "react";
import useSWR from "swr";
import { RefreshCw, AlertCircle } from "lucide-react";
import { useRequireAdmin } from "@/app/hooks/useAuthGuard";
import { useRingBuffer } from "@/app/hooks/useRingBuffer";
import { API_URL } from "@/app/lib/config";
import { authenticatedJsonFetcher } from "@/app/lib/services/authService";
import { Switch } from "@/app/components/ui/switch";
import { Skeleton } from "@/app/components/ui/skeleton";
import {
  HealthLabel,
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
    <div data-surface="telemetry" className="min-h-full -m-6 p-8 md:p-12 lg:p-14">
      <div className="mx-auto max-w-[1100px]">

        {/* ── Hero ────────────────────────────────────────────────────────── */}
        <header className="flex items-start justify-between gap-6 mb-14">
          <div>
            <p className="t-label mb-3">Observabilidad · panel de control</p>
            <h1 className="t-title mb-2">Estado del sistema</h1>
            <p className="t-body max-w-md">
              {data ? (
                <>El backend atendió{" "}
                  <span className="t-mono">{(t60?.chats ?? 0).toLocaleString("es-PE")}</span>{" "}
                  chats en la última hora con{" "}
                  <span className="t-mono" data-severity={severities.successSev}>
                    {fmtPct(successRate60, 2)}
                  </span>{" "}
                  de éxito.</>
              ) : (
                "Cargando métricas en vivo…"
              )}
            </p>
          </div>

          <div className="flex flex-col items-end gap-3">
            <HealthLabel severity={overall} />
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <Switch checked={autoRefresh} onCheckedChange={setAutoRefresh} className="h-4 w-8 [&>span]:h-3 [&>span]:w-3 [&>span[data-state=checked]]:translate-x-4" />
                <span className="t-label">auto 30s</span>
              </label>
              <button
                type="button"
                onClick={handleRefresh}
                disabled={isValidating}
                className="t-mono-sm inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-sm border transition-colors hover:bg-[var(--t-surface)]"
                style={{ borderColor: "var(--t-surface-edge)", color: "var(--t-ink-mid)" }}
              >
                <RefreshCw className={`h-3 w-3 ${isValidating ? "animate-spin" : ""}`} />
                {fmtClock(lastRefresh)}
              </button>
            </div>
          </div>
        </header>

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
          <div className="space-y-14">

            {/* ── Hero metric — success rate w/ big sparkline ─────────────── */}
            <section>
              <TelemetryMetric
                hero
                label="Tasa de éxito · ventana 60 min"
                value={fmtPct(successRate60, 2)}
                sub={t60 ? `${fmtPct(t60.error_rate, 2)} con error · serie de ${successBuf.length} muestras` : undefined}
                severity={severities.successSev}
                samples={successBuf}
              />
            </section>

            {/* ── Telemetry strip — KPIs con sparklines ───────────────────── */}
            <section>
              <p className="t-label mb-5">Telemetría en vivo</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-10 gap-y-8">
                <TelemetryMetric
                  label="Chats por minuto"
                  value={t60 ? t60.chats_per_min.toFixed(2) : "—"}
                  sub={t60 ? `${t60.chats.toLocaleString("es-PE")} chats / 60m` : undefined}
                  samples={chatsPerMinBuf}
                />
                <TelemetryMetric
                  label="1er token p95"
                  value={fmtMs(ftP95)}
                  sub={ftP95 != null ? "objetivo < 3 s" : undefined}
                  severity={severities.ftSev}
                  samples={ftBuf}
                />
                <TelemetryMetric
                  label="Latencia total p95"
                  value={fmtMs(totalP95)}
                  sub={totalP95 != null ? "objetivo < 5 s" : undefined}
                  severity={severities.totalSev}
                  samples={totalBuf}
                />
              </div>
            </section>

            {/* ── Pipeline waterfall ──────────────────────────────────────── */}
            <section>
              <div className="flex items-baseline justify-between mb-5">
                <p className="t-label">Pipeline RAG · barras proporcionales al tiempo total</p>
                <span className="t-mono-sm">
                  {data.latency_ms.total_ms?.p50 != null && (
                    <>p50 {fmtMs(data.latency_ms.total_ms.p50)} · p95 {fmtMs(totalP95)}</>
                  )}
                </span>
              </div>
              {stages.length === 0 ? (
                <p className="t-small">Sin muestras en la ventana actual.</p>
              ) : (
                <PipelineWaterfall stages={stages} total={data.latency_ms.total_ms?.p50 ?? null} />
              )}
            </section>

            {/* ── Servicios — fichas asimétricas ──────────────────────────── */}
            <section>
              <p className="t-label mb-5">Dependencias</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <ServiceTile
                  name="MongoDB"
                  variant="db"
                  severity={depSeverity(healthData?.mongodb)}
                  primary={healthData?.mongodb?.latency_ms != null ? `${healthData.mongodb.latency_ms} ms` : "—"}
                  secondary={healthData?.mongodb?.status}
                  samples={mongoLatBuf}
                />
                <ServiceTile
                  name="Redis"
                  variant="cache"
                  severity={depSeverity(healthData?.redis)}
                  primary={healthData?.redis?.backend ?? healthData?.redis?.status ?? "—"}
                  secondary={depSeverity(healthData?.redis) === "warn" ? "fallback memoria" : undefined}
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
                />
                <ServiceTile
                  name="RAG engine"
                  variant="engine"
                  severity={statusData?.rag_available ? "ok" : statusData ? "warn" : "info"}
                  primary={statusData ? (statusData.rag_available ? "disponible" : "no disponible") : "—"}
                  secondary={statusData ? `v${statusData.version}` : undefined}
                />
              </div>
            </section>

            {/* ── Throughput + Gating ─────────────────────────────────────── */}
            <section className="grid grid-cols-1 lg:grid-cols-[1fr_1.4fr] gap-x-16 gap-y-12">
              <div>
                <p className="t-label mb-5">Throughput por ventana</p>
                <div className="space-y-2">
                  {THROUGHPUT_WINDOWS.map((win) => {
                    const row = data.throughput[win];
                    if (!row) return null;
                    const errPct = row.error_rate * 100;
                    const sev: Severity = errPct >= 5 ? "crit" : errPct > 0 ? "warn" : "ok";
                    return (
                      <div key={win} className="grid grid-cols-[3rem_1fr_5rem_5rem] items-center gap-3 py-1.5">
                        <span className="t-mono-sm">últ. {win}</span>
                        <span className="t-mono">{row.chats.toLocaleString("es-PE")}</span>
                        <span className="t-mono-sm text-right">{row.chats_per_min.toFixed(2)}/min</span>
                        <span className="t-mono-sm text-right" data-severity={sev}>
                          {errPct.toFixed(2)}%
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div>
                <div className="flex items-baseline justify-between mb-5">
                  <p className="t-label">Filtros internos RAG</p>
                  {gatingTotal > 0 && (
                    <span className="t-mono-sm">{gatingTotal} eventos</span>
                  )}
                </div>
                <GatingBars items={gatingItems} total={gatingTotal} />
              </div>
            </section>

            {/* ── Tokens + costo ──────────────────────────────────────────── */}
            <section>
              <p className="t-label mb-5">Tokens y costo · desde último arranque</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-10 gap-y-6">
                <div className="flex flex-col gap-1">
                  <span className="t-label">Costo aprox.</span>
                  <span className="t-display" style={{ fontSize: "2.25rem" }}>
                    {data.tokens.pending_token_callback ? "—" : fmtUsd(data.tokens.estimated_cost_usd)}
                  </span>
                  {data.tokens.pending_token_callback && (
                    <span className="t-small">esperando primer chat</span>
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  <span className="t-label">Tokens entrada</span>
                  <span className="t-mono-xl">{fmtNum(data.tokens.tokens_in)}</span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="t-label">Tokens salida</span>
                  <span className="t-mono-xl">{fmtNum(data.tokens.tokens_out)}</span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="t-label">Tasa salida/entrada</span>
                  <span className="t-mono-xl">
                    {data.tokens.tokens_in > 0
                      ? (data.tokens.tokens_out / data.tokens.tokens_in).toFixed(2)
                      : "—"}
                  </span>
                </div>
              </div>
            </section>

            {/* ── Meta footer ─────────────────────────────────────────────── */}
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
  );
}
