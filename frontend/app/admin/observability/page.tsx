"use client";

import React, { useCallback, useMemo, useState } from "react";
import useSWR from "swr";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Legend,
  Cell,
} from "recharts";
import {
  Activity,
  AlertCircle,
  ChevronDown,
  Clock,
  Cpu,
  DollarSign,
  Gauge,
  HelpCircle,
  MessageSquare,
  Percent,
  RefreshCw,
  Timer,
  Zap,
} from "lucide-react";
import { useRequireAdmin } from "@/app/hooks/useAuthGuard";
import { API_URL } from "@/app/lib/config";
import { authenticatedJsonFetcher } from "@/app/lib/services/authService";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/app/components/ui/collapsible";
import { Skeleton } from "@/app/components/ui/skeleton";
import { Switch } from "@/app/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
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
    chats: number;
    success: number;
    error: number;
    rag_chats: number;
    rag_usage_rate: number;
    rate_limit_hits: number;
  };
  tokens: {
    tokens_in: number;
    tokens_out: number;
    pending_token_callback: boolean;
    estimated_cost_usd?: number;
  };
  latency_ms: Record<string, LatencyBucket>;
  throughput: Record<"1m" | "5m" | "15m" | "60m", ThroughputBucket>;
  gating_reasons: Record<string, number>;
}

type Health = "ok" | "warn" | "crit" | "info";

// Etapas en orden lógico del pipeline de respuesta. Las que están vacías se filtran.
const LATENCY_STAGES: { key: string; label: string; help: string }[] = [
  {
    key: "total_ms",
    label: "Total del chat",
    help: "Tiempo completo desde que el usuario envía hasta que termina la respuesta.",
  },
  {
    key: "first_token_ms",
    label: "Primer token",
    help: "Tiempo hasta que el usuario ve el primer carácter. Define la sensación de rapidez.",
  },
  {
    key: "llm_ms",
    label: "Modelo (LLM)",
    help: "Tiempo total que el modelo de OpenAI estuvo generando la respuesta.",
  },
  {
    key: "rag_ms",
    label: "Búsqueda total",
    help: "Tiempo en consultar el catálogo de documentos (suma de todas las sub-etapas).",
  },
  {
    key: "embedding_ms",
    label: "Vectorización",
    help: "Convertir la consulta del usuario a un vector numérico para buscarla.",
  },
  {
    key: "dense_ms",
    label: "Búsqueda densa",
    help: "Buscar documentos similares semánticamente en Qdrant.",
  },
  {
    key: "lexical_ms",
    label: "Búsqueda léxica",
    help: "Buscar coincidencias por palabras clave en MongoDB.",
  },
  {
    key: "hydrate_ms",
    label: "Hidratación",
    help: "Recuperar el contenido completo de los documentos seleccionados.",
  },
  {
    key: "rerank_ms",
    label: "Re-ranking",
    help: "Ordenar los documentos por relevancia. En modo heurístico cae a 0 ms.",
  },
];

const THROUGHPUT_WINDOWS: ("1m" | "5m" | "15m" | "60m")[] = ["1m", "5m", "15m", "60m"];

const GATING_PALETTE = [
  "hsl(var(--primary))",
  "#10b981",
  "#f59e0b",
  "#8b5cf6",
  "#06b6d4",
  "#ef4444",
  "#64748b",
];

// Etiquetas legibles para los reasons que emite el backend de gating.
const GATING_LABELS: Record<string, string> = {
  agentic_rag_enabled: "Agentic RAG (modelo decide)",
  small_talk: "Saludo / charla casual",
  empty_query: "Consulta vacía",
  punctuation_only: "Solo puntuación",
  too_short: "Consulta muy corta",
  cheap_gate_pass: "Pasó filtro inicial",
  embedding_failed: "Falló la vectorización",
  retrieval_backend_unavailable: "Backend de búsqueda caído",
  no_candidates: "Sin candidatos",
  no_parent_candidates: "Sin documentos padre",
  reranker_empty: "Reranker vacío",
  low_relevance_score: "Relevancia muy baja",
  lexical_only: "Solo búsqueda léxica",
};

// ─── Threshold engine ─────────────────────────────────────────────────────────
// Un único punto de verdad para semáforos. Cambiar aquí afecta KPI cards y badges.

const THRESHOLDS = {
  successRate: { ok: 0.99, warn: 0.95 }, // ≥0.99 ok, ≥0.95 warn, sino crit
  p95Total: { ok: 5000, warn: 10000 }, // ≤5s ok, ≤10s warn, sino crit
  p95FirstToken: { ok: 3000, warn: 6000 }, // ≤3s ok, ≤6s warn, sino crit
  errorRateTable: { warn: 0, crit: 0.05 }, // >0 warn, ≥5% crit
};

const evalSuccess = (rate: number | null): Health => {
  if (rate == null) return "info";
  if (rate >= THRESHOLDS.successRate.ok) return "ok";
  if (rate >= THRESHOLDS.successRate.warn) return "warn";
  return "crit";
};

const evalLatencyHigherIsWorse = (
  ms: number | null,
  t: { ok: number; warn: number },
): Health => {
  if (ms == null) return "info";
  if (ms <= t.ok) return "ok";
  if (ms <= t.warn) return "warn";
  return "crit";
};

const aggregateHealth = (...statuses: Health[]): Health => {
  if (statuses.includes("crit")) return "crit";
  if (statuses.includes("warn")) return "warn";
  if (statuses.every((s) => s === "info")) return "info";
  return "ok";
};

const HEALTH_STYLES: Record<Health, { dot: string; pill: string; label: string }> = {
  ok: {
    dot: "bg-emerald-500",
    pill: "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:ring-emerald-900",
    label: "Saludable",
  },
  warn: {
    dot: "bg-amber-500",
    pill: "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:ring-amber-900",
    label: "Atención",
  },
  crit: {
    dot: "bg-red-500",
    pill: "bg-red-50 text-red-700 ring-red-200 dark:bg-red-950/40 dark:text-red-400 dark:ring-red-900",
    label: "Crítico",
  },
  info: {
    dot: "bg-slate-400 dark:bg-slate-500",
    pill: "bg-slate-50 text-slate-600 ring-slate-200 dark:bg-slate-900/60 dark:text-slate-400 dark:ring-slate-700",
    label: "Sin datos",
  },
};

// ─── Format helpers ───────────────────────────────────────────────────────────

const fmtNum = (n: number | null | undefined): string =>
  n == null ? "—" : Math.round(n).toLocaleString("es-PE");

const fmtMs = (n: number | null | undefined): string => {
  if (n == null) return "—";
  if (n < 1000) return `${Math.round(n)} ms`;
  return `${(n / 1000).toFixed(n < 10000 ? 2 : 1)} s`;
};

const fmtPct = (n: number | null | undefined, digits = 1): string =>
  n == null ? "—" : `${(n * 100).toFixed(digits)}%`;

const fmtUsd = (n: number | null | undefined): string =>
  n == null ? "—" : `$${n.toFixed(4)}`;

const fmtUptime = (seconds: number) => {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
};

const fmtTtl = (seconds: number) => {
  if (seconds % 3600 === 0) return `${seconds / 3600}h`;
  if (seconds % 60 === 0) return `${seconds / 60}min`;
  return `${seconds}s`;
};

const fmtClock = (d: Date) =>
  d.toLocaleTimeString("es-PE", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

// ─── InfoTip: ? icon con tooltip explicativo ──────────────────────────────────

function InfoTip({ children, side = "top" }: { children: React.ReactNode; side?: "top" | "bottom" | "left" | "right" }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="inline-flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground/60 transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
          aria-label="Más información"
        >
          <HelpCircle className="h-3.5 w-3.5" strokeWidth={2} />
        </button>
      </TooltipTrigger>
      <TooltipContent
        side={side}
        className="max-w-xs text-xs leading-relaxed text-popover-foreground"
      >
        {children}
      </TooltipContent>
    </Tooltip>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionSkeleton({ rows = 1, height = "h-32" }: { rows?: number; height?: string }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className={cn("w-full rounded-2xl", height)} />
      ))}
    </div>
  );
}

function SectionError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-start gap-2 rounded-2xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-2">
        <AlertCircle className="h-4 w-4 flex-none" />
        <span>{message}</span>
      </div>
      {onRetry && (
        <Button
          size="sm"
          variant="outline"
          onClick={onRetry}
          className="h-7 rounded-lg border-destructive/30 px-3 text-xs text-destructive hover:bg-destructive/10"
        >
          <RefreshCw className="mr-1.5 h-3 w-3" />
          Reintentar
        </Button>
      )}
    </div>
  );
}

interface KpiCardProps {
  label: string;
  help: React.ReactNode;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  health?: Health;
  loading?: boolean;
}

function KpiCard({ label, help, value, sub, icon, health = "info", loading }: KpiCardProps) {
  if (loading) {
    return (
      <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <Skeleton className="mb-3 h-4 w-28 rounded" />
        <Skeleton className="mb-2 h-8 w-20 rounded" />
        <Skeleton className="h-3 w-32 rounded" />
      </div>
    );
  }
  const showDot = health !== "info";
  return (
    <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-shadow hover:shadow-[0_2px_8px_rgba(15,23,42,0.08)]">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          {showDot && (
            <span
              className={cn("h-2 w-2 flex-none rounded-full", HEALTH_STYLES[health].dot)}
              aria-hidden="true"
            />
          )}
          <span className="truncate text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            {label}
          </span>
          <InfoTip>{help}</InfoTip>
        </div>
        <span className="text-muted-foreground/60">{icon}</span>
      </div>
      <p className="text-3xl font-semibold tabular-nums leading-none text-foreground">{value}</p>
      {sub && <p className="mt-2 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

function ChartCard({
  title,
  help,
  badge,
  children,
  action,
}: {
  title: string;
  help?: React.ReactNode;
  badge?: React.ReactNode;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex items-center justify-between gap-2 border-b border-border/60 px-5 py-4">
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-sm font-semibold text-foreground">{title}</span>
          {help && <InfoTip>{help}</InfoTip>}
          {badge}
        </div>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

interface TooltipPayloadItem {
  color: string;
  name: string;
  value: number;
  payload?: Record<string, unknown>;
}

function ChartTooltip({
  active,
  payload,
  label,
  unit,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string;
  unit?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-border/60 bg-popover px-3 py-2.5 text-xs shadow-md">
      <p className="mb-1.5 font-semibold text-popover-foreground">{label}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2 text-muted-foreground">
          <span
            className="inline-block h-2 w-2 flex-none rounded-full"
            style={{ background: p.color }}
          />
          <span>{p.name}:</span>
          <span className="font-medium tabular-nums text-popover-foreground">
            {p.value?.toLocaleString("es-PE")}
            {unit ? ` ${unit}` : ""}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Latency chart ────────────────────────────────────────────────────────────

function LatencyChart({ data }: { data: ObservabilityData }) {
  const chartData = LATENCY_STAGES.flatMap((stage) => {
    const bucket = data.latency_ms[stage.key];
    if (!bucket || bucket.count === 0) return [];
    return [
      {
        stage: stage.label,
        p50: bucket.p50 ?? 0,
        p95: bucket.p95 ?? 0,
        p99: bucket.p99 ?? 0,
        count: bucket.count,
      },
    ];
  });

  return (
    <ChartCard
      title="Latencia por etapa"
      help={
        <div className="space-y-1.5">
          <p>
            Cada barra es una etapa del pipeline de respuesta. Los percentiles muestran
            cómo se distribuyen los tiempos:
          </p>
          <ul className="space-y-0.5 pl-4">
            <li>
              <span className="font-semibold">p50</span>: la mitad de los chats respondió
              más rápido que esto.
            </li>
            <li>
              <span className="font-semibold">p95</span>: el 95% respondió más rápido. El
              5% lento está por encima.
            </li>
            <li>
              <span className="font-semibold">p99</span>: casi el peor caso (1% es más
              lento).
            </li>
          </ul>
        </div>
      }
      badge={<span className="text-xs text-muted-foreground">milisegundos</span>}
    >
      {chartData.length === 0 ? (
        <div className="flex h-56 items-center justify-center text-sm text-muted-foreground">
          Aún no hay muestras en la ventana actual.
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={chartData} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="hsl(var(--border))"
              strokeOpacity={0.6}
              vertical={false}
            />
            <XAxis
              dataKey="stage"
              tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
              axisLine={false}
              tickLine={false}
              interval={0}
              angle={chartData.length > 4 ? -22 : 0}
              textAnchor={chartData.length > 4 ? "end" : "middle"}
              height={chartData.length > 4 ? 60 : 30}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
              tickFormatter={(v) => (v >= 1000 ? `${v / 1000}k` : `${v}`)}
            />
            <RechartsTooltip
              content={<ChartTooltip unit="ms" />}
              cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }}
            />
            <Legend
              wrapperStyle={{ fontSize: 11, color: "hsl(var(--muted-foreground))", paddingTop: 8 }}
              iconSize={8}
              iconType="circle"
            />
            <Bar dataKey="p50" name="p50" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} maxBarSize={28} />
            <Bar dataKey="p95" name="p95" fill="#f59e0b" radius={[4, 4, 0, 0]} maxBarSize={28} />
            <Bar dataKey="p99" name="p99" fill="#ef4444" radius={[4, 4, 0, 0]} maxBarSize={28} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  );
}

// ─── Throughput table ─────────────────────────────────────────────────────────

function ThroughputTable({ data }: { data: ObservabilityData }) {
  return (
    <ChartCard
      title="Volumen de tráfico"
      help={
        <p>
          Cantidad de chats por minuto en distintas ventanas de tiempo. La columna de
          errores se colorea de verde a rojo según el porcentaje.
        </p>
      }
      badge={<span className="text-xs text-muted-foreground">por ventana móvil</span>}
    >
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/60">
              <th className="px-2 py-2 text-left text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                Ventana
              </th>
              <th className="px-2 py-2 text-right text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                Chats
              </th>
              <th className="px-2 py-2 text-right text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                Por minuto
              </th>
              <th className="px-2 py-2 text-right text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  Errores
                  <InfoTip>
                    Porcentaje de chats que terminaron con error en esa ventana. Verde =
                    sin errores, ámbar = algunos, rojo = ≥5%.
                  </InfoTip>
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {THROUGHPUT_WINDOWS.map((win, idx) => {
              const row = data.throughput[win];
              if (!row) return null;
              const errPct = row.error_rate * 100;
              const errColor =
                errPct >= THRESHOLDS.errorRateTable.crit * 100
                  ? "text-red-600 dark:text-red-400"
                  : errPct > THRESHOLDS.errorRateTable.warn * 100
                    ? "text-amber-600 dark:text-amber-400"
                    : "text-emerald-600 dark:text-emerald-400";
              const dotColor =
                errPct >= THRESHOLDS.errorRateTable.crit * 100
                  ? "bg-red-500"
                  : errPct > THRESHOLDS.errorRateTable.warn * 100
                    ? "bg-amber-500"
                    : "bg-emerald-500";
              return (
                <tr
                  key={win}
                  className={cn(
                    "transition-colors hover:bg-muted/40",
                    idx < THROUGHPUT_WINDOWS.length - 1 && "border-b border-border/40",
                  )}
                >
                  <td className="px-2 py-2.5 font-medium text-foreground">
                    Últimos {win}
                  </td>
                  <td className="px-2 py-2.5 text-right tabular-nums text-foreground">
                    {row.chats.toLocaleString("es-PE")}
                  </td>
                  <td className="px-2 py-2.5 text-right tabular-nums text-muted-foreground">
                    {row.chats_per_min.toFixed(2)}
                  </td>
                  <td className={cn("px-2 py-2.5 text-right font-medium tabular-nums", errColor)}>
                    <span className="inline-flex items-center justify-end gap-1.5">
                      <span className={cn("h-1.5 w-1.5 rounded-full", dotColor)} aria-hidden />
                      {errPct.toFixed(2)}%
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </ChartCard>
  );
}

// ─── Gating reasons chart ─────────────────────────────────────────────────────

function GatingReasonsChart({ data }: { data: ObservabilityData }) {
  const entries = Object.entries(data.gating_reasons || {});
  const total = entries.reduce((acc, [, v]) => acc + v, 0);

  const chartData = entries
    .map(([reason, count], idx) => ({
      reason,
      label: GATING_LABELS[reason] ?? reason,
      count,
      pct: total > 0 ? (count / total) * 100 : 0,
      fill: GATING_PALETTE[idx % GATING_PALETTE.length],
    }))
    .sort((a, b) => b.count - a.count);

  return (
    <ChartCard
      title="Decisiones del sistema"
      help={
        <p>
          Cómo el bot clasificó cada consulta antes de responder. Útil para detectar si
          muchos chats están siendo descartados por filtros (relevancia baja, queries
          vacías, etc.) o si todo pasa por el flujo agéntico normal.
        </p>
      }
      badge={
        total > 0 ? (
          <span className="text-xs text-muted-foreground">{total} eventos</span>
        ) : null
      }
    >
      {chartData.length === 0 ? (
        <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
          Sin eventos de gating en la ventana actual.
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={Math.max(180, chartData.length * 40 + 48)}>
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ top: 4, right: 16, left: 8, bottom: 0 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="hsl(var(--border))"
              strokeOpacity={0.6}
              horizontal={false}
            />
            <XAxis
              type="number"
              tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
            />
            <YAxis
              dataKey="label"
              type="category"
              tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
              axisLine={false}
              tickLine={false}
              width={170}
            />
            <RechartsTooltip
              content={<ChartTooltip />}
              cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }}
            />
            <Bar dataKey="count" name="Chats" radius={[0, 4, 4, 0]} maxBarSize={22}>
              {chartData.map((entry) => (
                <Cell key={entry.reason} fill={entry.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  );
}

// ─── Glossary ─────────────────────────────────────────────────────────────────

const GLOSSARY: { term: string; def: string }[] = [
  {
    term: "Tasa de éxito",
    def: "Porcentaje de chats que terminaron sin errores. ≥99% saludable, 95–99% atención, <95% crítico.",
  },
  {
    term: "Latencia (p50, p95, p99)",
    def: "p50 es el tiempo del chat típico. p95 es el límite del 5% más lento. p99 casi el peor caso. Útiles para entender la experiencia real del usuario.",
  },
  {
    term: "Primer token",
    def: "Tiempo desde que el usuario envía mensaje hasta ver el primer carácter. Mide la sensación de rapidez aunque la respuesta total tome más.",
  },
  {
    term: "RAG (búsqueda en documentos)",
    def: "Sistema que consulta el catálogo de productos antes de responder. Garantiza datos del corpus en vez de respuestas inventadas.",
  },
  {
    term: "Volumen de tráfico (throughput)",
    def: "Cantidad de chats por minuto. Indica si la app está activa o ociosa.",
  },
  {
    term: "Worker PID",
    def: "ID del proceso del backend dentro del contenedor Docker. Cambia cada vez que se reinicia el servidor.",
  },
  {
    term: "Muestras en ventana",
    def: "Cuántos chats están guardados en memoria para calcular percentiles. Se descartan automáticamente después de 1 hora.",
  },
  {
    term: "Costo aproximado",
    def: "Estimación del gasto en OpenAI desde el último reinicio. Calculado con tarifas de gpt-4o-mini.",
  },
  {
    term: "Decisiones del sistema (gating)",
    def: "Cómo el bot clasifica cada consulta antes de buscar: saludo, consulta válida, fuera de tema, etc.",
  },
];

function Glossary() {
  const [open, setOpen] = useState(false);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="rounded-2xl border border-border/60 bg-card shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center justify-between gap-2 px-5 py-3.5 text-left transition-colors hover:bg-muted/40"
          >
            <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <HelpCircle className="h-4 w-4 text-muted-foreground" />
              Glosario de términos
            </span>
            <ChevronDown
              className={cn(
                "h-4 w-4 text-muted-foreground transition-transform duration-200",
                open && "rotate-180",
              )}
            />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="border-t border-border/60 px-5 py-4">
            <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
              {GLOSSARY.map(({ term, def }) => (
                <div key={term} className="space-y-0.5">
                  <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-foreground">
                    {term}
                  </dt>
                  <dd className="text-xs leading-relaxed text-muted-foreground">{def}</dd>
                </div>
              ))}
            </dl>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

const REFRESH_MS = 30000;

export default function ObservabilityPage() {
  const { isAuthorized, isChecking } = useRequireAdmin();
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const { data, isLoading, error, mutate, isValidating } = useSWR<ObservabilityData>(
    isAuthorized ? `${API_URL}/dashboard/observability` : null,
    authenticatedJsonFetcher,
    {
      refreshInterval: autoRefresh ? REFRESH_MS : 0,
      onSuccess: () => setLastRefresh(new Date()),
    },
  );

  const handleRefresh = useCallback(() => {
    mutate();
  }, [mutate]);

  const { kpiCards, overallHealth } = useMemo(() => {
    const t60 = data?.throughput?.["60m"];
    const totalChats60 = t60?.chats ?? 0;
    const errRate60 = t60?.error_rate ?? 0;
    const successRate60 = totalChats60 === 0 ? null : 1 - errRate60;
    const totalP95 = data?.latency_ms?.total_ms?.p95 ?? null;
    const ftP95 = data?.latency_ms?.first_token_ms?.p95 ?? null;
    const ragRate = data?.totals?.rag_usage_rate ?? null;
    const cost =
      data?.tokens?.pending_token_callback || data?.tokens?.estimated_cost_usd == null
        ? null
        : data.tokens.estimated_cost_usd;

    const successHealth = totalChats60 === 0 ? "info" : evalSuccess(successRate60);
    const totalHealth = evalLatencyHigherIsWorse(totalP95, THRESHOLDS.p95Total);
    const ftHealth = evalLatencyHigherIsWorse(ftP95, THRESHOLDS.p95FirstToken);

    const cards: KpiCardProps[] = [
      {
        label: "Chats últ. 60m",
        help: "Total de conversaciones recibidas en la última hora. Incluye exitosas y fallidas.",
        value: data ? totalChats60.toLocaleString("es-PE") : "—",
        sub: t60 ? `${t60.chats_per_min.toFixed(2)} por minuto` : undefined,
        icon: <MessageSquare className="h-4 w-4" />,
        health: "info",
        loading: isLoading,
      },
      {
        label: "Tasa de éxito 60m",
        help: (
          <>
            Porcentaje de chats completados sin errores en la última hora. Saludable
            ≥99%, atención 95–99%, crítico &lt;95%.
          </>
        ),
        value: data ? fmtPct(successRate60, 2) : "—",
        sub: data ? `${fmtPct(errRate60, 2)} con error` : undefined,
        icon: <Percent className="h-4 w-4" />,
        health: successHealth,
        loading: isLoading,
      },
      {
        label: "Latencia p95 total",
        help: (
          <>
            El 95% de los chats responde en menos de este tiempo. Saludable &lt;5 s,
            atención 5–10 s, crítico &gt;10 s. Sirve para identificar el peor caso típico.
          </>
        ),
        value: fmtMs(totalP95),
        sub: data?.latency_ms?.total_ms?.count
          ? `${data.latency_ms.total_ms.count} muestras`
          : undefined,
        icon: <Gauge className="h-4 w-4" />,
        health: totalHealth,
        loading: isLoading,
      },
      {
        label: "Primer token p95",
        help: (
          <>
            Tiempo hasta que el usuario ve el primer carácter de la respuesta. Mide la
            sensación de rapidez. Saludable &lt;3 s, atención 3–6 s, crítico &gt;6 s.
          </>
        ),
        value: fmtMs(ftP95),
        sub: data?.latency_ms?.first_token_ms?.count
          ? `${data.latency_ms.first_token_ms.count} muestras`
          : undefined,
        icon: <Timer className="h-4 w-4" />,
        health: ftHealth,
        loading: isLoading,
      },
      {
        label: "Uso de búsqueda",
        help: "Porcentaje de chats que consultaron el catálogo de productos (RAG). Lo demás respondió desde el modelo o fueron saludos.",
        value: fmtPct(ragRate, 1),
        sub: data?.totals
          ? `${fmtNum(data.totals.rag_chats)} de ${fmtNum(data.totals.chats)} chats`
          : undefined,
        icon: <Activity className="h-4 w-4" />,
        health: "info",
        loading: isLoading,
      },
      {
        label: "Costo aproximado",
        help: (
          <>
            Estimación del gasto en OpenAI desde el último reinicio. Calculado con tarifa
            de gpt-4o-mini ($0.15/1M tokens entrada, $0.60/1M salida). Aproximación local
            con tiktoken, ~95% de precisión vs facturación real.
          </>
        ),
        value: cost == null ? "—" : fmtUsd(cost),
        sub: data?.tokens?.pending_token_callback
          ? "Esperando primer chat…"
          : data?.tokens
            ? `${fmtNum(data.tokens.tokens_in)} entrada · ${fmtNum(data.tokens.tokens_out)} salida`
            : undefined,
        icon: <DollarSign className="h-4 w-4" />,
        health: "info",
        loading: isLoading,
      },
    ];

    return {
      kpiCards: cards,
      overallHealth: aggregateHealth(successHealth, totalHealth, ftHealth),
    };
  }, [data, isLoading]);

  if (isChecking || !isAuthorized) return null;

  const healthStyle = HEALTH_STYLES[overallHealth];

  const headerBits: { icon: React.ReactNode; label: string; value: string; help: string }[] = [
    {
      icon: <Cpu className="h-3.5 w-3.5" />,
      label: "Worker PID",
      value: data ? String(data.worker_pid) : "—",
      help: "ID del proceso del backend dentro del contenedor Docker. Cambia al reiniciar el servidor.",
    },
    {
      icon: <Activity className="h-3.5 w-3.5" />,
      label: "Muestras",
      value: data ? `${data.samples.in_window} / ${data.samples.max}` : "—",
      help: "Chats guardados en memoria para calcular percentiles. Capacidad máxima de la ventana.",
    },
    {
      icon: <Clock className="h-3.5 w-3.5" />,
      label: "Ventana",
      value: data ? fmtTtl(data.samples.ttl_seconds) : "—",
      help: "Tiempo durante el cual cada chat permanece en la ventana antes de descartarse del cálculo.",
    },
    {
      icon: <Zap className="h-3.5 w-3.5" />,
      label: "Uptime",
      value: data ? fmtUptime(data.uptime_seconds) : "—",
      help: "Tiempo desde el último arranque del backend.",
    },
  ];

  return (
    <TooltipProvider delayDuration={250}>
      <div className="space-y-6 px-1 py-1 pb-10">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1.5">
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-semibold text-foreground">Observabilidad</h1>
              {data && (
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset",
                    healthStyle.pill,
                  )}
                >
                  <span
                    className={cn("h-1.5 w-1.5 rounded-full", healthStyle.dot)}
                    aria-hidden
                  />
                  {healthStyle.label}
                </span>
              )}
            </div>
            <p className="max-w-xl text-sm text-muted-foreground">
              Estado en vivo del backend: cuántos chats responde, qué tan rápido y dónde
              se demora. Datos en memoria, ventana móvil de la última hora.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-card px-3 py-1.5">
              <Switch
                id="auto-refresh"
                checked={autoRefresh}
                onCheckedChange={setAutoRefresh}
                className="h-5 w-9 [&>span]:h-4 [&>span]:w-4 [&>span[data-state=checked]]:translate-x-4"
              />
              <label
                htmlFor="auto-refresh"
                className="cursor-pointer text-xs font-medium text-muted-foreground"
              >
                Actualizar cada 30 s
              </label>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={isValidating}
              className="h-8 rounded-xl border-border/60 px-3 text-xs"
            >
              <RefreshCw className={cn("mr-1.5 h-3.5 w-3.5", isValidating && "animate-spin")} />
              Actualizar ahora
            </Button>
          </div>
        </div>

        {/* Header info bar */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-2xl border border-border/60 bg-muted/30 px-4 py-2.5 text-xs text-muted-foreground">
          {headerBits.map((bit, i) => (
            <span key={i} className="inline-flex items-center gap-1.5">
              <span className="text-muted-foreground/60">{bit.icon}</span>
              <span className="font-medium text-foreground/80">{bit.label}:</span>
              <span className="tabular-nums">{bit.value}</span>
              <InfoTip>{bit.help}</InfoTip>
            </span>
          ))}
          <span className="ml-auto inline-flex items-center gap-1.5">
            <RefreshCw className={cn("h-3.5 w-3.5 text-muted-foreground/60", isValidating && "animate-spin")} />
            <span className="font-medium text-foreground/80">Actualizado:</span>
            <span className="tabular-nums">{fmtClock(lastRefresh)}</span>
          </span>
          {data?.tokens?.pending_token_callback && (
            <Badge
              variant="secondary"
              className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-950/30 dark:text-amber-400"
            >
              Esperando primer chat
            </Badge>
          )}
        </div>

        {/* Error state */}
        {error && !data && (
          <SectionError
            message="No se pudo cargar las métricas. Verifica tu conexión y vuelve a intentar."
            onRetry={handleRefresh}
          />
        )}

        {/* KPI cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {kpiCards.map((card) => (
            <KpiCard key={card.label} {...card} />
          ))}
        </div>

        {/* Latency chart */}
        {isLoading && !data ? (
          <SectionSkeleton height="h-72" />
        ) : data ? (
          <LatencyChart data={data} />
        ) : null}

        {/* Throughput + gating row */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {isLoading && !data ? (
            <>
              <SectionSkeleton height="h-56" />
              <SectionSkeleton height="h-56" />
            </>
          ) : data ? (
            <>
              <ThroughputTable data={data} />
              <GatingReasonsChart data={data} />
            </>
          ) : null}
        </div>

        {/* Glossary */}
        {data && <Glossary />}
      </div>
    </TooltipProvider>
  );
}
