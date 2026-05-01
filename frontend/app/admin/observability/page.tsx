"use client";

import React, { useCallback, useMemo, useState } from "react";
import useSWR from "swr";
import {
  Tooltip as RechartsTooltip, ResponsiveContainer, Cell,
  PieChart, Pie,
} from "recharts";
import { PipelineBadge, type PipelineBadgeName } from "@/app/components/icons/PipelineBadge";
import {
  Activity, AlertCircle, ChevronDown, Clock, Cpu, Database,
  DollarSign, Gauge, HelpCircle, MessageSquare, Percent,
  RefreshCw, Server, Timer, Zap,
} from "lucide-react";
import { useRequireAdmin } from "@/app/hooks/useAuthGuard";
import { ServiceGlyph } from "@/app/components/icons/ServiceGlyph";
import { API_URL } from "@/app/lib/config";
import { authenticatedJsonFetcher } from "@/app/lib/services/authService";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/app/components/ui/collapsible";
import { Skeleton } from "@/app/components/ui/skeleton";
import { Switch } from "@/app/components/ui/switch";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/app/components/ui/tooltip";
import { cn } from "@/lib/utils";

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

type Health = "ok" | "warn" | "crit" | "info";

// ─── Constants ────────────────────────────────────────────────────────────────

const PIPELINE_STAGES = [
  { key: "embedding_ms", label: "Vectorización",    short: "Embed",   help: "Convierte la consulta a vector numérico." },
  { key: "dense_ms",     label: "Búsqueda densa",   short: "Dense",   help: "Busca documentos similares en Qdrant." },
  { key: "lexical_ms",   label: "Búsqueda léxica",  short: "Lexical", help: "Busca por palabras clave en MongoDB." },
  { key: "hydrate_ms",   label: "Hidratación",      short: "Hydrate", help: "Recupera el contenido de documentos seleccionados." },
  { key: "rerank_ms",    label: "Re-ranking",       short: "Rerank",  help: "Ordena documentos por relevancia." },
  { key: "llm_ms",       label: "Modelo (LLM)",     short: "LLM",     help: "Generación del modelo de OpenAI." },
];

const THROUGHPUT_WINDOWS: ("1m" | "5m" | "15m" | "60m")[] = ["1m", "5m", "15m", "60m"];

const GATING_PALETTE = ["#a594e8","#10b981","#f59e0b","#06b6d4","#8b5cf6","#ef4444","#64748b"];

const GATING_LABELS: Record<string, string> = {
  agentic_rag_enabled: "Agentic RAG", small_talk: "Saludo / charla",
  empty_query: "Consulta vacía", punctuation_only: "Solo puntuación",
  too_short: "Muy corta", cheap_gate_pass: "Pasó filtro inicial",
  embedding_failed: "Falló vectorización", retrieval_backend_unavailable: "Backend caído",
  no_candidates: "Sin candidatos", no_parent_candidates: "Sin docs padre",
  reranker_empty: "Reranker vacío", low_relevance_score: "Relevancia baja",
  lexical_only: "Solo léxico",
};

const THRESHOLDS = {
  successRate:   { ok: 0.99, warn: 0.95 },
  p95Total:      { ok: 5000, warn: 10000 },
  p95FirstToken: { ok: 3000, warn: 6000 },
  errorRateTable:{ warn: 0, crit: 0.05 },
  pipeline: {
    embedding_ms: { ok: 500,  warn: 1500 },
    dense_ms:     { ok: 500,  warn: 1500 },
    lexical_ms:   { ok: 500,  warn: 1500 },
    hydrate_ms:   { ok: 500,  warn: 1500 },
    rerank_ms:    { ok: 200,  warn: 500  },
    llm_ms:       { ok: 4500, warn: 8000 },
  } as Record<string, { ok: number; warn: number }>,
};

// ─── Health helpers ───────────────────────────────────────────────────────────

const evalSuccess = (r: number | null): Health =>
  r == null ? "info" : r >= THRESHOLDS.successRate.ok ? "ok" : r >= THRESHOLDS.successRate.warn ? "warn" : "crit";

const evalLatency = (ms: number | null, t: { ok: number; warn: number }): Health =>
  ms == null ? "info" : ms <= t.ok ? "ok" : ms <= t.warn ? "warn" : "crit";

const aggregateHealth = (...s: Health[]): Health =>
  s.includes("crit") ? "crit" : s.includes("warn") ? "warn" : s.every(x => x === "info") ? "info" : "ok";

const depHealth = (s: DependencyStatus | undefined): Health =>
  !s ? "info" : s.status === "connected" ? "ok" : s.status === "degraded" ? "warn" : "crit";

// ─── Formatters ───────────────────────────────────────────────────────────────

const fmtNum = (n: number | null | undefined) => n == null ? "—" : Math.round(n).toLocaleString("es-PE");
const fmtMs = (n: number | null | undefined) => {
  if (n == null) return "—";
  return n < 1000 ? `${Math.round(n)} ms` : `${(n / 1000).toFixed(n < 10000 ? 2 : 1)} s`;
};
const fmtPct   = (n: number | null | undefined, d = 1) => n == null ? "—" : `${(n * 100).toFixed(d)}%`;
const fmtUsd   = (n: number | null | undefined) => n == null ? "—" : `$${n.toFixed(4)}`;
const fmtUptime = (s: number) => {
  const sec = Math.max(0, Math.floor(s));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${sec % 60}s` : `${sec}s`;
};
const fmtTtl   = (s: number) => s % 3600 === 0 ? `${s / 3600}h` : s % 60 === 0 ? `${s / 60}min` : `${s}s`;
const fmtClock = (d: Date) => d.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

// ─── InfoTip ──────────────────────────────────────────────────────────────────

function InfoTip({ children, side = "top" }: { children: React.ReactNode; side?: "top"|"bottom"|"left"|"right" }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" className="inline-flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground/40 transition-colors hover:text-muted-foreground focus-visible:outline-none" aria-label="Más información">
          <HelpCircle className="h-3.5 w-3.5" strokeWidth={2} />
        </button>
      </TooltipTrigger>
      <TooltipContent side={side} className="max-w-xs text-xs leading-relaxed">{children}</TooltipContent>
    </Tooltip>
  );
}

// ─── Health dot ───────────────────────────────────────────────────────────────

function HealthDot({ health, size = "md" }: { health: Health; size?: "sm" | "md" }) {
  const sz = size === "sm" ? "w-1.5 h-1.5" : "w-2 h-2";
  const colors: Record<Health, string> = {
    ok:   "bg-emerald-500 shadow-[0_0_6px_2px_rgb(16_185_129_/_0.5)] animate-status-pulse",
    warn: "bg-amber-500 shadow-[0_0_5px_1px_rgb(245_158_11_/_0.4)]",
    crit: "bg-red-500 shadow-[0_0_6px_2px_rgb(239_68_68_/_0.5)] animate-status-pulse-fast",
    info: "bg-muted-foreground/30",
  };
  return <span className={cn("rounded-full flex-none inline-block", sz, colors[health])} />;
}

// ─── Service nodes ────────────────────────────────────────────────────────────

function ServiceNode({ icon, name, health, sub, extra }: {
  icon: React.ReactNode; name: string; health: Health; sub: string; extra?: string;
}) {
  const glyphName =
    name === "MongoDB" ? "mongodb" :
    name === "Redis" ? "redis" :
    name === "Qdrant" ? "qdrant" :
    name === "RAG" ? "rag" :
    null;
  const glows: Record<Health, string> = {
    ok:   "border-emerald-500/20 bg-emerald-500/5",
    warn: "border-amber-500/20 bg-amber-500/5",
    crit: "border-red-500/30 bg-red-500/10",
    info: "border-border/40 bg-muted/20",
  };
  return (
    <div className={cn(
      "relative flex min-w-[190px] flex-col gap-3 rounded-xl border px-4 py-4 transition-all duration-300",
      glows[health],
      health === "crit" && "shadow-[0_0_16px_rgb(239_68_68_/_0.15)]",
      health === "ok"   && "shadow-[0_0_12px_rgb(16_185_129_/_0.08)]",
    )}>
      <div className="flex items-center gap-3">
        <span className="shrink-0">
          {glyphName ? <ServiceGlyph name={glyphName} /> : icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <HealthDot health={health} />
            <span className="font-heading text-sm font-semibold tracking-wide text-foreground/90">{name}</span>
          </span>
        </span>
      </div>
      <p className={cn("font-data text-xs tabular-nums", {
        "text-emerald-600 dark:text-emerald-400": health === "ok",
        "text-amber-600 dark:text-amber-400":     health === "warn",
        "text-red-600 dark:text-red-400":         health === "crit",
        "text-muted-foreground":                  health === "info",
      })}>{sub}</p>
      {extra && <p className="text-[11px] text-muted-foreground/50">{extra}</p>}
    </div>
  );
}

// ─── Systems status ───────────────────────────────────────────────────────────

function SystemsStatusBar({ isAuthorized }: { isAuthorized: boolean }) {
  const { data: healthData } = useSWR<HealthReadyData>(
    isAuthorized ? `${API_URL}/health/ready` : null, authenticatedJsonFetcher,
    { refreshInterval: 15000 },
  );
  const { data: statusData } = useSWR<SystemStatusData>(
    isAuthorized ? `${API_URL}/internal/status` : null, authenticatedJsonFetcher,
    { refreshInterval: 15000 },
  );

  const mongoHealth  = depHealth(healthData?.mongodb);
  const redisHealth  = depHealth(healthData?.redis);
  const qdrantHealth = depHealth(healthData?.qdrant);
  const ragHealth: Health = statusData?.rag_available ? "ok" : statusData ? "warn" : "info";

  const mongoSub  = healthData?.mongodb ? (healthData.mongodb.latency_ms != null ? `${healthData.mongodb.latency_ms} ms` : healthData.mongodb.message?.slice(0, 28) ?? "—") : "—";
  const redisSub  = healthData?.redis ? (healthData.redis.backend ?? healthData.redis.status) : "—";
  const qdrantSub = healthData?.qdrant ? (healthData.qdrant.latency_ms != null ? `${healthData.qdrant.latency_ms} ms` : healthData.qdrant.message?.slice(0, 28) ?? "—") : "—";
  const ragSub    = statusData ? (statusData.rag_available ? "disponible" : "no disponible") : "—";
  const cbState   = statusData?.qdrant_circuit_breaker;

  return (
    <div>
      <p className="font-heading text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/50 mb-3">
        Servicios
      </p>
      <div className="flex flex-wrap gap-3">
        <ServiceNode icon={<Database className="h-3.5 w-3.5" />} name="MongoDB" health={mongoHealth} sub={mongoSub} />
        <ServiceNode icon={<Server className="h-3.5 w-3.5" />}   name="Redis" health={redisHealth} sub={redisSub} extra={redisHealth === "warn" ? "Fallback en memoria" : undefined} />
        <ServiceNode icon={<Database className="h-3.5 w-3.5" />} name="Qdrant" health={qdrantHealth} sub={qdrantSub}
          extra={cbState ? `CB: ${cbState.state} · ${cbState.failures} fallas` : healthData?.qdrant?.points_count != null ? `${healthData.qdrant.points_count.toLocaleString("es-PE")} vectores` : undefined} />
        <ServiceNode icon={<Zap className="h-3.5 w-3.5" />} name="RAG" health={ragHealth} sub={ragSub} extra={statusData ? `v${statusData.version}` : undefined} />
      </div>
    </div>
  );
}

// ─── KPI strip — tipográfico, sin cards ──────────────────────────────────────

interface KpiItem {
  label: string; help: React.ReactNode; value: string; sub?: string; health?: Health; large?: boolean;
}

function KpiStrip({ items, loading }: { items: KpiItem[]; loading: boolean }) {
  const [hero, ...rest] = items;

  return (
    <div className="space-y-6">
      {/* Hero metric */}
      <div className="flex items-end gap-6 flex-wrap">
        <div className="space-y-1">
          <div className="flex items-center gap-1.5">
            <p className="font-heading text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/60">{hero.label}</p>
            <InfoTip side="right">{hero.help}</InfoTip>
          </div>
          {loading ? (
            <div className="h-14 w-32 rounded-lg bg-muted/40 animate-pulse" />
          ) : (
            <div className="flex items-baseline gap-3">
              <p className="font-heading text-5xl font-bold tracking-tight text-foreground tabular-nums leading-none">{hero.value}</p>
              {hero.health && hero.health !== "info" && <HealthDot health={hero.health} size="md" />}
            </div>
          )}
          {hero.sub && !loading && <p className="font-data text-xs text-muted-foreground tabular-nums">{hero.sub}</p>}
        </div>

        {/* Divider */}
        <div className="hidden sm:block w-px h-12 bg-border/40 self-center" />

        {/* Secondary metrics */}
        <div className="flex flex-wrap gap-x-8 gap-y-4">
          {rest.map((item) => (
            <div key={item.label} className="space-y-0.5">
              <div className="flex items-center gap-1">
                <p className="font-heading text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground/50">{item.label}</p>
                <InfoTip>{item.help}</InfoTip>
              </div>
              {loading ? (
                <div className="h-7 w-16 rounded bg-muted/40 animate-pulse" />
              ) : (
                <div className="flex items-baseline gap-1.5">
                  <p className="font-heading text-2xl font-semibold tracking-tight text-foreground tabular-nums leading-none">{item.value}</p>
                  {item.health && item.health !== "info" && <HealthDot health={item.health} size="sm" />}
                </div>
              )}
              {item.sub && !loading && <p className="font-data text-[11px] text-muted-foreground/60 tabular-nums">{item.sub}</p>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Pipeline waterfall ───────────────────────────────────────────────────────

function PipelineNode({ label, short, p50, p95, health, count, help }: {
  label: string; short: string; p50: number | null; p95: number | null;
  health: Health; count: number; help: string;
}) {
  const badgeName: PipelineBadgeName =
    short === "Embed" ? "embed" :
    short === "Dense" ? "dense" :
    short === "Lexical" ? "lexical" :
    short === "Hydrate" ? "hydrate" :
    short === "Rerank" ? "rerank" :
    "llm";
  const borderColor: Record<Health, string> = {
    ok:   "border-emerald-500/40 shadow-[0_0_10px_rgb(16_185_129_/_0.12)]",
    warn: "border-amber-500/40",
    crit: "border-red-500/50 shadow-[0_0_10px_rgb(239_68_68_/_0.2)]",
    info: "border-border/30",
  };
  const valueColor: Record<Health, string> = {
    ok:   "text-emerald-600 dark:text-emerald-400",
    warn: "text-amber-600 dark:text-amber-400",
    crit: "text-red-600 dark:text-red-400",
    info: "text-muted-foreground",
  };
  const badgeColor: Record<Health, string> = {
    ok: "text-emerald-500",
    warn: "text-amber-500",
    crit: "text-red-500",
    info: "text-muted-foreground",
  };
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className={cn(
          "flex min-w-[108px] flex-col items-center gap-1.5 rounded-xl border px-3 py-2.5 cursor-default bg-background/60",
          "transition-all duration-200 hover:-translate-y-0.5 hover:bg-background",
          borderColor[health],
        )}>
          <PipelineBadge name={badgeName} className={badgeColor[health]} />
          <span className="font-heading text-[10px] font-semibold uppercase tracking-wider text-foreground/60">{short}</span>
          <span className={cn("font-data text-sm font-semibold tabular-nums leading-none", valueColor[health])}>
            {p50 != null ? fmtMs(p50) : "—"}
          </span>
          <span className="text-[10px] text-muted-foreground/50 tabular-nums">p95: {p95 != null ? fmtMs(p95) : "—"}</span>
        </div>
      </TooltipTrigger>
      <TooltipContent className="max-w-[200px] text-xs">
        <p className="font-semibold mb-1">{label}</p>
        <p className="text-muted-foreground mb-1">{help}</p>
        <p>p50 {fmtMs(p50)} · p95 {fmtMs(p95)} · {count} muestras</p>
      </TooltipContent>
    </Tooltip>
  );
}

function PipelineConnector({ health, delay = 0 }: { health: Health; delay?: number }) {
  const lineColor: Record<Health, string> = {
    ok: "bg-emerald-500/30", warn: "bg-amber-500/30", crit: "bg-red-500/30", info: "bg-border/30",
  };
  return (
    <div className="flex items-center px-0.5">
      <div
        className={cn("h-px w-6 animate-line-grow", lineColor[health])}
        style={{ animationDelay: `${delay}ms` }}
      />
      <svg width="6" height="8" className={cn("flex-none", {
        "text-emerald-500/40": health === "ok", "text-amber-500/40": health === "warn",
        "text-red-500/40": health === "crit", "text-border/30": health === "info",
      })}>
        <polyline points="0,0 6,4 0,8" fill="none" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    </div>
  );
}

function PipelineSection({ data }: { data: ObservabilityData }) {
  const [animKey, setAnimKey] = React.useState(0);
  const prevTs = React.useRef(data.ts);

  React.useEffect(() => {
    if (data.ts !== prevTs.current) {
      prevTs.current = data.ts;
      setAnimKey(k => k + 1);
    }
  }, [data.ts]);

  const stages = PIPELINE_STAGES.map(stage => {
    const bucket = data.latency_ms[stage.key];
    if (!bucket || bucket.count === 0) return null;
    const thresholds = THRESHOLDS.pipeline[stage.key] ?? { ok: 1000, warn: 3000 };
    return { ...stage, p50: bucket.p50, p95: bucket.p95, count: bucket.count, health: evalLatency(bucket.p95, thresholds) };
  }).filter(Boolean) as Array<{ key: string; label: string; short: string; help: string; p50: number|null; p95: number|null; count: number; health: Health }>;

  const totalBucket = data.latency_ms["total_ms"];
  const ftBucket    = data.latency_ms["first_token_ms"];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <p className="font-heading text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/50">
          Pipeline de respuesta
        </p>
        <InfoTip>
          Cada etapa en orden de ejecución. Color indica salud según p95. Hover para detalle.
        </InfoTip>
        {totalBucket && totalBucket.count > 0 && (
          <span className="font-data text-xs text-muted-foreground/70 tabular-nums ml-auto">
            total p50 <span className="text-foreground">{fmtMs(totalBucket.p50)}</span>
            {" · "}p95 <span className={cn({
              "text-emerald-600 dark:text-emerald-400": evalLatency(totalBucket.p95, THRESHOLDS.p95Total) === "ok",
              "text-amber-600 dark:text-amber-400":     evalLatency(totalBucket.p95, THRESHOLDS.p95Total) === "warn",
              "text-red-600 dark:text-red-400":         evalLatency(totalBucket.p95, THRESHOLDS.p95Total) === "crit",
            })}>{fmtMs(totalBucket.p95)}</span>
            {ftBucket && ftBucket.count > 0 && (
              <> · 1er token <span className={cn({
                "text-emerald-600 dark:text-emerald-400": evalLatency(ftBucket.p95, THRESHOLDS.p95FirstToken) === "ok",
                "text-amber-600 dark:text-amber-400":     evalLatency(ftBucket.p95, THRESHOLDS.p95FirstToken) === "warn",
                "text-red-600 dark:text-red-400":         evalLatency(ftBucket.p95, THRESHOLDS.p95FirstToken) === "crit",
              })}>{fmtMs(ftBucket.p95)}</span></>
            )}
          </span>
        )}
      </div>

      {stages.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6">Sin muestras en la ventana actual.</p>
      ) : (
        <div className="overflow-x-auto pb-1">
          <div key={animKey} className="flex items-center gap-0 min-w-max py-2">
            {stages.map((stage, i) => (
              <React.Fragment key={stage.key}>
                <div className="animate-count-reveal" style={{ animationDelay: `${i * 70}ms` }}>
                  <PipelineNode {...stage} />
                </div>
                {i < stages.length - 1 && (
                  <PipelineConnector health={stage.health} delay={(i + 1) * 70} />
                )}
              </React.Fragment>
            ))}
            <div className="flex items-center pl-1">
              <div className="h-px w-5 bg-border/30" />
              <span className="font-heading text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/40 ml-2">Respuesta</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Throughput — tabla sin border-box ────────────────────────────────────────

function ThroughputSection({ data }: { data: ObservabilityData }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1.5">
        <p className="font-heading text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/50">Throughput</p>
        <InfoTip>Chats por minuto en distintas ventanas de tiempo.</InfoTip>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border/40">
            {["Ventana","Chats","/ min","Errores"].map(h => (
              <th key={h} className={cn("pb-2 font-heading text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground/50", h === "Ventana" ? "text-left" : "text-right")}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {THROUGHPUT_WINDOWS.map((win, idx) => {
            const row = data.throughput[win];
            if (!row) return null;
            const errPct = row.error_rate * 100;
            const errColor = errPct >= THRESHOLDS.errorRateTable.crit * 100 ? "text-red-500" : errPct > 0 ? "text-amber-500" : "text-emerald-500 dark:text-emerald-400";
            const dotColor = errPct >= THRESHOLDS.errorRateTable.crit * 100 ? "bg-red-500" : errPct > 0 ? "bg-amber-500" : "bg-emerald-500";
            return (
              <tr key={win} className={cn("hover:bg-muted/20 transition-colors", idx < THROUGHPUT_WINDOWS.length - 1 && "border-b border-border/20")}>
                <td className="py-2.5 font-heading text-xs font-medium text-foreground/70">Últ. {win}</td>
                <td className="py-2.5 text-right font-data tabular-nums text-foreground">{row.chats.toLocaleString("es-PE")}</td>
                <td className="py-2.5 text-right font-data tabular-nums text-muted-foreground">{row.chats_per_min.toFixed(2)}</td>
                <td className={cn("py-2.5 text-right font-data font-medium tabular-nums", errColor)}>
                  <span className="inline-flex items-center justify-end gap-1.5">
                    <span className={cn("h-1.5 w-1.5 rounded-full", dotColor)} />
                    {errPct.toFixed(2)}%
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Gating donut ─────────────────────────────────────────────────────────────

interface TPItem { color: string; name: string; value: number }

function DonutTooltip({ active, payload }: { active?: boolean; payload?: TPItem[] }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-border/60 bg-popover px-3 py-2 text-xs shadow-md">
      {payload.map(p => (
        <div key={p.name} className="flex items-center gap-2 text-muted-foreground">
          <span className="inline-block h-2 w-2 flex-none rounded-full" style={{ background: p.color }} />
          <span>{GATING_LABELS[p.name] ?? p.name}:</span>
          <span className="font-data font-medium text-foreground tabular-nums">{p.value}</span>
        </div>
      ))}
    </div>
  );
}

function GatingSection({ data }: { data: ObservabilityData }) {
  const entries = Object.entries(data.gating_reasons || {});
  const total = entries.reduce((acc, [, v]) => acc + v, 0);
  const chartData = entries
    .map(([reason, count], idx) => ({ name: reason, count, pct: total > 0 ? ((count/total)*100).toFixed(1) : "0", fill: GATING_PALETTE[idx % GATING_PALETTE.length] }))
    .sort((a, b) => b.count - a.count);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1.5">
        <p className="font-heading text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/50">Decisiones del sistema</p>
        <InfoTip>Cómo el bot clasificó cada consulta antes de responder.</InfoTip>
        {total > 0 && <span className="font-data text-[11px] text-muted-foreground/40 ml-1 tabular-nums">{total} eventos</span>}
      </div>

      {chartData.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4">Sin eventos de gating en la ventana actual.</p>
      ) : (
        <div className="flex items-center gap-5">
          <div className="relative flex-none">
            <ResponsiveContainer width={140} height={140}>
              <PieChart>
                <Pie data={chartData} dataKey="count" nameKey="name" innerRadius="58%" outerRadius="82%"
                  paddingAngle={2} startAngle={90} endAngle={-270} strokeWidth={0}>
                  {chartData.map(e => <Cell key={e.name} fill={e.fill} opacity={0.9} />)}
                </Pie>
                <RechartsTooltip content={<DonutTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="font-data text-lg font-semibold text-foreground tabular-nums">{total}</span>
              <span className="font-heading text-[9px] uppercase tracking-wider text-muted-foreground/50">total</span>
            </div>
          </div>
          <div className="flex flex-col gap-1 min-w-0 flex-1">
            {chartData.map(e => (
              <div key={e.name} className="flex items-center gap-2 min-w-0">
                <span className="h-1.5 w-1.5 rounded-full flex-none" style={{ background: e.fill }} />
                <span className="text-xs text-muted-foreground truncate flex-1">{GATING_LABELS[e.name] ?? e.name}</span>
                <span className="font-data text-xs text-foreground/80 tabular-nums ml-auto">{e.count}</span>
                <span className="font-data text-[11px] text-muted-foreground/50 tabular-nums w-9 text-right">{e.pct}%</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Glossary ─────────────────────────────────────────────────────────────────

const GLOSSARY = [
  { term: "Tasa de éxito",           def: "Chats sin error. ≥99% saludable, 95–99% atención, <95% crítico." },
  { term: "Latencia p50/p95/p99",    def: "p50=típico, p95=límite 5% más lento, p99=casi peor caso." },
  { term: "Primer token",            def: "Tiempo hasta el primer carácter visible. Mide sensación de rapidez." },
  { term: "RAG",                     def: "Consulta el catálogo de documentos antes de responder." },
  { term: "Throughput",              def: "Cantidad de chats por minuto." },
  { term: "Worker PID",              def: "ID del proceso del backend. Cambia al reiniciar." },
  { term: "Muestras en ventana",     def: "Chats en memoria para calcular percentiles. TTL 1 hora." },
  { term: "Costo aproximado",        def: "Estimación del gasto en OpenAI desde el último reinicio." },
  { term: "Gating",                  def: "Clasificación de la consulta antes de buscar documentos." },
  { term: "Circuit Breaker",         def: "Corta la conexión a Qdrant si hay errores consecutivos." },
];

function Glossary() {
  const [open, setOpen] = useState(false);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button type="button" className="flex items-center gap-2 text-muted-foreground/50 hover:text-muted-foreground transition-colors py-2 group">
          <HelpCircle className="h-3.5 w-3.5" />
          <span className="font-heading text-[10px] font-semibold uppercase tracking-[0.12em]">Glosario</span>
          <ChevronDown className={cn("h-3.5 w-3.5 transition-transform duration-200", open && "rotate-180")} />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <dl className="grid gap-x-10 gap-y-3 sm:grid-cols-2 pt-3 border-t border-border/30">
          {GLOSSARY.map(({ term, def }) => (
            <div key={term}>
              <dt className="font-heading text-[10px] font-semibold uppercase tracking-[0.08em] text-foreground/70">{term}</dt>
              <dd className="text-xs text-muted-foreground leading-relaxed mt-0.5">{def}</dd>
            </div>
          ))}
        </dl>
      </CollapsibleContent>
    </Collapsible>
  );
}

// ─── Section divider ──────────────────────────────────────────────────────────

function Divider() {
  return <div className="h-px bg-gradient-to-r from-transparent via-border/50 to-transparent" />;
}

// ─── Error state ──────────────────────────────────────────────────────────────

function SectionError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
      <AlertCircle className="h-4 w-4 flex-none" />
      <span className="flex-1">{message}</span>
      {onRetry && (
        <Button size="sm" variant="outline" onClick={onRetry}
          className="h-7 border-destructive/30 px-3 text-xs text-destructive hover:bg-destructive/10">
          <RefreshCw className="mr-1.5 h-3 w-3" />Reintentar
        </Button>
      )}
    </div>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-36 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-20 w-full rounded-xl" />
      <Skeleton className="h-32 w-full rounded-xl" />
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

const REFRESH_MS = 30000;

export default function ObservabilityPage() {
  const { isAuthorized, isChecking } = useRequireAdmin();
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(new Date());

  const { data, isLoading, error, mutate, isValidating } = useSWR<ObservabilityData>(
    isAuthorized ? `${API_URL}/dashboard/observability` : null,
    authenticatedJsonFetcher,
    { refreshInterval: autoRefresh ? REFRESH_MS : 0, onSuccess: () => setLastRefresh(new Date()) },
  );

  const handleRefresh = useCallback(() => mutate(), [mutate]);

  const { kpiItems, overallHealth } = useMemo(() => {
    const t60        = data?.throughput?.["60m"];
    const chats60    = t60?.chats ?? 0;
    const errRate60  = t60?.error_rate ?? 0;
    const success60  = chats60 === 0 ? null : 1 - errRate60;
    const totalP95   = data?.latency_ms?.total_ms?.p95 ?? null;
    const ftP95      = data?.latency_ms?.first_token_ms?.p95 ?? null;
    const ragRate    = data?.totals?.rag_usage_rate ?? null;
    const cost       = data?.tokens?.pending_token_callback || data?.tokens?.estimated_cost_usd == null ? null : data.tokens.estimated_cost_usd;

    const successHealth = chats60 === 0 ? "info" : evalSuccess(success60);
    const totalHealth   = evalLatency(totalP95, THRESHOLDS.p95Total);
    const ftHealth      = evalLatency(ftP95, THRESHOLDS.p95FirstToken);

    const items: KpiItem[] = [
      { label: "Tasa de éxito 60m", help: <>Chats sin error. ≥99% ok, 95–99% atención, &lt;95% crítico.</>, value: data ? fmtPct(success60, 2) : "—", sub: data ? `${fmtPct(errRate60, 2)} con error` : undefined, health: successHealth, large: true },
      { label: "Chats últ. 60m",    help: "Total de conversaciones en la última hora.", value: data ? chats60.toLocaleString("es-PE") : "—", sub: t60 ? `${t60.chats_per_min.toFixed(2)} / min` : undefined },
      { label: "Latencia p95 total",help: <>95% responde en menos de este tiempo. OK &lt;5s, atención 5–10s.</>, value: fmtMs(totalP95), sub: data?.latency_ms?.total_ms?.count ? `${data.latency_ms.total_ms.count} muestras` : undefined, health: totalHealth },
      { label: "Primer token p95",  help: <>Hasta el primer carácter. OK &lt;3s, atención 3–6s.</>, value: fmtMs(ftP95), health: ftHealth },
      { label: "Uso de búsqueda",   help: "Porcentaje de chats que consultaron el catálogo RAG.", value: fmtPct(ragRate, 1), sub: data?.totals ? `${fmtNum(data.totals.rag_chats)} de ${fmtNum(data.totals.chats)}` : undefined },
      { label: "Costo aprox.",      help: "Estimación del gasto en OpenAI desde el último reinicio.", value: cost == null ? "—" : fmtUsd(cost), sub: data?.tokens?.pending_token_callback ? "Esperando primer chat…" : data?.tokens ? `${fmtNum(data.tokens.tokens_in)} in · ${fmtNum(data.tokens.tokens_out)} out` : undefined },
    ];

    return { kpiItems: items, overallHealth: aggregateHealth(successHealth, totalHealth, ftHealth) };
  }, [data, isLoading]);

  if (isChecking || !isAuthorized) return null;

  const hs = {
    ok:   { dot: "bg-emerald-500 shadow-[0_0_6px_rgb(16_185_129_/_0.6)] animate-status-pulse", label: "Saludable" },
    warn: { dot: "bg-amber-500", label: "Atención" },
    crit: { dot: "bg-red-500 shadow-[0_0_6px_rgb(239_68_68_/_0.6)] animate-status-pulse-fast", label: "Crítico" },
    info: { dot: "bg-muted-foreground/30", label: "Sin datos" },
  }[overallHealth];

  const headerBits = [
    { icon: <Cpu className="h-3 w-3" />, label: "PID", value: data ? String(data.worker_pid) : "—", help: "ID del proceso del backend." },
    { icon: <Activity className="h-3 w-3" />, label: "Muestras", value: data ? `${data.samples.in_window}/${data.samples.max}` : "—", help: "Chats en memoria para percentiles." },
    { icon: <Clock className="h-3 w-3" />, label: "Ventana", value: data ? fmtTtl(data.samples.ttl_seconds) : "—", help: "TTL de cada chat en la ventana." },
    { icon: <Zap className="h-3 w-3" />, label: "Uptime", value: data ? fmtUptime(data.uptime_seconds) : "—", help: "Tiempo desde el último arranque." },
  ];

  return (
    <TooltipProvider delayDuration={250}>
      <div className="space-y-8 px-1 py-1 pb-12 animate-fade-in">

        {/* ── Header ─────────────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-semibold text-foreground">Observabilidad</h1>
              {data && (
                <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                  <span className={cn("h-2 w-2 rounded-full flex-none", hs.dot)} aria-hidden />
                  {hs.label}
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground max-w-lg">
              Estado en vivo — servicios, pipeline RAG, latencias y decisiones del sistema.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Switch id="auto-refresh" checked={autoRefresh} onCheckedChange={setAutoRefresh}
                className="h-4 w-8 [&>span]:h-3 [&>span]:w-3 [&>span[data-state=checked]]:translate-x-4" />
              <label htmlFor="auto-refresh" className="font-heading font-medium uppercase tracking-wider text-[10px] cursor-pointer">
                30s
              </label>
            </div>
            <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isValidating}
              className="h-7 px-3 text-xs text-muted-foreground hover:text-foreground">
              <RefreshCw className={cn("mr-1.5 h-3 w-3", isValidating && "animate-spin")} />
              Actualizar
            </Button>
          </div>
        </div>

        {/* ── Error ──────────────────────────────────────────────────────────── */}
        {error && !data && (
          <SectionError message="No se pudo cargar las métricas. Verifica tu conexión." onRetry={handleRefresh} />
        )}

        {/* ── Cuerpo ─────────────────────────────────────────────────────────── */}
        {isLoading && !data ? (
          <LoadingSkeleton />
        ) : data ? (
          <div className="space-y-8">

            {/* 1. Servicios */}
            <SystemsStatusBar isAuthorized={isAuthorized} />

            <Divider />

            {/* 2. KPIs — tipográficos, sin cards */}
            <KpiStrip items={kpiItems} loading={isLoading} />

            <Divider />

            {/* 3. Pipeline waterfall */}
            <PipelineSection data={data} />

            <Divider />

            {/* 4. Throughput + Gating — side by side, sin cards */}
            <div className="grid grid-cols-1 gap-10 lg:grid-cols-2">
              <ThroughputSection data={data} />
              <GatingSection data={data} />
            </div>

            <Divider />

            {/* 5. Meta info + glosario */}
            <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-muted-foreground/50">
              {headerBits.map((bit, i) => (
                <span key={i} className="inline-flex items-center gap-1.5">
                  <span>{bit.icon}</span>
                  <span className="font-heading font-medium uppercase tracking-wide text-[10px]">{bit.label}:</span>
                  <span className="font-data tabular-nums text-foreground/60">{bit.value}</span>
                  <InfoTip>{bit.help}</InfoTip>
                </span>
              ))}
              <span className="ml-auto inline-flex items-center gap-1.5">
                <RefreshCw className={cn("h-3 w-3", isValidating && "animate-spin")} />
                <span className="font-data tabular-nums text-foreground/50">{fmtClock(lastRefresh)}</span>
              </span>
              {data.tokens?.pending_token_callback && (
                <Badge variant="secondary" className="rounded-full bg-amber-500/10 text-amber-500 text-[10px]">
                  Esperando primer chat
                </Badge>
              )}
            </div>

            <Glossary />

          </div>
        ) : null}

      </div>
    </TooltipProvider>
  );
}
