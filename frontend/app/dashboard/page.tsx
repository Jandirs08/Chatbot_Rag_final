"use client";
import React, { useState, useCallback } from "react";
import useSWR from "swr";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
import { Mail, RefreshCw, CheckCircle2, AlertCircle } from "lucide-react";
import { useRequireAdmin } from "@/app/hooks/useAuthGuard";
import { API_URL } from "@/app/lib/config";
import { authenticatedJsonFetcher } from "@/app/lib/services/authService";
import { Button } from "@/app/components/ui/button";
import { ServiceGlyph } from "@/app/components/icons/ServiceGlyph";
import { Skeleton } from "@/app/components/ui/skeleton";
import { InboxStatsCard } from "@/app/_components/dashboard/InboxStatsCard";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface OverviewData {
  today_messages: number;
  total_messages: number;
  today_conversations: number;
  total_conversations: number;
  leads_total: number;
  leads_this_week: number;
  pdfs_ready: number;
}

interface LeadItem {
  conversation_id: string;
  lead_name: string | null;
  lead_email: string;
  captured_at: string | null;
}

interface LeadsData {
  total: number;
  this_week: number;
  items: LeadItem[];
}

interface PeakHourItem {
  hour: number;
  count: number;
}

interface PeakHoursData {
  items: PeakHourItem[];
  timezone: string;
}

interface HistoryItem {
  date: string;
  messages_count: number;
  users_count: number;
}

interface SystemStatusData {
  status: string;
  version: string;
  uptime_seconds: number;
  rag_available: boolean;
  cache_backend: string;
  qdrant_circuit_breaker: { state: string; failure_count: number; is_open: boolean };
}

interface HandoffStatsData {
  user_request: number;
  low_confidence: number;
  out_of_scope: number;
  total: number;
  period_days: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString("es-PE", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "—";

const fmtNum = (n: number | undefined): string =>
  n == null ? "—" : n.toLocaleString("es-PE");

const fmtUptime = (seconds: number) => {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
};

const fmtHour = (h: number) => {
  const ampm = h < 12 ? "am" : "pm";
  const display = h % 12 === 0 ? 12 : h % 12;
  return `${display}${ampm}`;
};

const fmtDateShort = (dateStr: string) => {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("es-PE", { day: "2-digit", month: "short" });
};

// ─── Shared primitives ────────────────────────────────────────────────────────

function Divider() {
  return (
    <div className="h-px bg-gradient-to-r from-transparent via-border/50 to-transparent" />
  );
}

function SectionLabel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "font-heading text-[10px] uppercase tracking-[0.15em] text-muted-foreground/60",
        className,
      )}
    >
      {children}
    </p>
  );
}

function SectionError({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
      <AlertCircle className="h-4 w-4 flex-none" />
      {message}
    </div>
  );
}

// ─── Chart tooltip ────────────────────────────────────────────────────────────

interface TooltipPayloadItem {
  color: string;
  name: string;
  value: number;
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-border/60 bg-card px-3 py-2.5 shadow-md text-xs">
      <p className="mb-1.5 font-semibold text-foreground">{label}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2 text-muted-foreground">
          <span
            className="inline-block h-2 w-2 rounded-full flex-none"
            style={{ background: p.color }}
          />
          <span>{p.name}:</span>
          <span className="font-medium tabular-nums text-foreground">{p.value}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Metric row ───────────────────────────────────────────────────────────────

function useCountUp(target: number, duration = 650) {
  const [val, setVal] = React.useState(0);
  const prefersReduced = React.useRef(
    typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  React.useEffect(() => {
    if (prefersReduced.current) { setVal(target); return; }
    if (target === 0) { setVal(0); return; }
    let raf: number;
    const start = performance.now();
    const tick = (ts: number) => {
      const p = Math.min((ts - start) / duration, 1);
      setVal(Math.round((1 - Math.pow(1 - p, 4)) * target));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return val;
}

function MetricItem({
  label,
  value,
  sub,
  isLoading,
  delay,
}: {
  label: string;
  value: number;
  sub: string;
  isLoading: boolean;
  delay: number;
}) {
  const animated = useCountUp(isLoading ? 0 : value);
  return (
    <div className="animate-count-reveal" style={{ animationDelay: `${delay}ms` }}>
      {isLoading ? (
        <div className="h-8 w-16 animate-pulse rounded bg-muted mb-1" />
      ) : (
        <p className="text-2xl font-semibold font-heading tabular-nums text-foreground leading-none">
          {fmtNum(animated)}
        </p>
      )}
      <SectionLabel className="mt-1.5">{label}</SectionLabel>
      {!isLoading && sub && (
        <p className="text-[11px] text-muted-foreground/50 mt-0.5">{sub}</p>
      )}
    </div>
  );
}

function MetricRow({
  overview,
  loading,
}: {
  overview: OverviewData | undefined;
  loading: boolean;
}) {
  const metrics = [
    {
      label: "Mensajes hoy",
      value: overview?.today_messages ?? 0,
      sub: `${fmtNum(overview?.total_messages)} en total`,
    },
    {
      label: "Conversaciones",
      value: overview?.today_conversations ?? 0,
      sub: `${fmtNum(overview?.total_conversations)} históricas`,
    },
    {
      label: "Leads esta semana",
      value: overview?.leads_this_week ?? 0,
      sub: `${fmtNum(overview?.leads_total)} en total`,
    },
    {
      label: "PDFs en base",
      value: overview?.pdfs_ready ?? 0,
      sub: "documentos listos",
    },
  ];

  return (
    <section className="flex flex-wrap items-end gap-x-8 gap-y-6 sm:gap-x-12">
      {metrics.map((m, i) => (
        <React.Fragment key={m.label}>
          <MetricItem {...m} isLoading={loading} delay={i * 70} />
          {i < metrics.length - 1 && (
            <div className="hidden sm:block self-stretch w-px bg-border/60 my-1" aria-hidden="true" />
          )}
        </React.Fragment>
      ))}
    </section>
  );
}

// ─── Activity chart ───────────────────────────────────────────────────────────

const DAY_OPTIONS = [7, 30, 90] as const;
type DayOption = (typeof DAY_OPTIONS)[number];

function ActivityChart({ isAuthorized }: { isAuthorized: boolean }) {
  const [days, setDays] = useState<DayOption>(7);

  const { data, isLoading, error } = useSWR<HistoryItem[]>(
    isAuthorized ? `${API_URL}/chat/stats/history?days=${days}` : null,
    authenticatedJsonFetcher,
    { refreshInterval: 300000 },
  );

  const chartData = (data ?? []).map((d) => ({
    date: fmtDateShort(d.date),
    Mensajes: d.messages_count,
    Usuarios: d.users_count,
  }));

  return (
    <section>
      <div className="flex items-center justify-between mb-6">
        <SectionLabel>Actividad — últimos {days} días</SectionLabel>
        <div className="flex items-center gap-0.5 rounded-lg border border-border/50 p-0.5">
          {DAY_OPTIONS.map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                days === d
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <Skeleton className="h-52 w-full" />
      ) : error ? (
        <SectionError message="No se pudo cargar la actividad." />
      ) : chartData.length === 0 ? (
        <div className="flex h-52 items-center justify-center text-sm text-muted-foreground">
          Sin datos para el período seleccionado
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={208}>
          <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="grad-mensajes" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.22} />
                <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="grad-usuarios" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--muted-foreground))" stopOpacity={0.1} />
                <stop offset="100%" stopColor="hsl(var(--muted-foreground))" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
            />
            <Tooltip content={<ChartTooltip />} />
            <Area
              type="monotone"
              dataKey="Mensajes"
              stroke="hsl(var(--primary))"
              fill="url(#grad-mensajes)"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0 }}
              isAnimationActive={true}
              animationDuration={900}
              animationEasing="ease-out"
            />
            <Area
              type="monotone"
              dataKey="Usuarios"
              stroke="hsl(var(--muted-foreground))"
              fill="url(#grad-usuarios)"
              strokeWidth={1.5}
              strokeDasharray="4 3"
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0 }}
              isAnimationActive={true}
              animationDuration={900}
              animationEasing="ease-out"
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </section>
  );
}

// ─── Peak hours ───────────────────────────────────────────────────────────────

function PeakHoursChart({ isAuthorized }: { isAuthorized: boolean }) {
  const { data, isLoading, error } = useSWR<PeakHoursData>(
    isAuthorized ? `${API_URL}/dashboard/peak-hours` : null,
    authenticatedJsonFetcher,
    { refreshInterval: 0 },
  );

  const chartData = (data?.items ?? []).map((item) => ({
    hour: fmtHour(item.hour),
    Mensajes: item.count,
  }));

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <SectionLabel>Horas pico</SectionLabel>
        {data?.timezone && (
          <span className="text-[10px] text-muted-foreground/50">{data.timezone}</span>
        )}
      </div>
      {isLoading ? (
        <Skeleton className="h-36 w-full" />
      ) : error ? (
        <SectionError message="No se pudo cargar las horas pico." />
      ) : chartData.length === 0 ? (
        <div className="flex h-36 items-center justify-center text-sm text-muted-foreground">
          Sin datos disponibles
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={144}>
          <BarChart data={chartData} margin={{ top: 4, right: 0, left: -20, bottom: 0 }}>
            <XAxis
              dataKey="hour"
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
              axisLine={false}
              tickLine={false}
              interval={2}
            />
            <Tooltip content={<ChartTooltip />} />
            <Bar
              dataKey="Mensajes"
              fill="hsl(var(--primary))"
              fillOpacity={0.65}
              radius={[3, 3, 0, 0]}
              maxBarSize={14}
              isAnimationActive={true}
              animationDuration={700}
              animationEasing="ease-out"
            />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

// ─── Handoff breakdown ────────────────────────────────────────────────────────

function HandoffSection({ isAuthorized }: { isAuthorized: boolean }) {
  const { data, isLoading, error } = useSWR<HandoffStatsData>(
    isAuthorized ? `${API_URL}/inbox/handoff-stats?days=30` : null,
    authenticatedJsonFetcher,
    { refreshInterval: 300000 },
  );
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => {
    const t = setTimeout(() => setMounted(true), 80);
    return () => clearTimeout(t);
  }, []);

  const total = data?.total ?? 0;
  const bars = [
    {
      label: "Solicitud de usuario",
      value: data?.user_request ?? 0,
      color: "hsl(var(--primary))",
    },
    {
      label: "Bot sin confianza",
      value: data?.low_confidence ?? 0,
      color: "hsl(var(--warning))",
    },
    {
      label: "Fuera de alcance",
      value: data?.out_of_scope ?? 0,
      color: "hsl(var(--muted-foreground))",
    },
  ];

  return (
    <div>
      <SectionLabel className="mb-3">Escalaciones — 30 días</SectionLabel>
      <div className="mb-5">
        <InboxStatsCard enabled={isAuthorized} days={30} />
      </div>
      {isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      ) : error ? (
        <SectionError message="No se pudo cargar las escalaciones." />
      ) : total === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
          <CheckCircle2 className="h-7 w-7 text-success/60" />
          <p className="text-sm text-muted-foreground">Sin escalaciones en 30 días</p>
        </div>
      ) : (
        <div className="space-y-5">
          {bars.map((bar) => {
            const pct = total > 0 ? Math.round((bar.value / total) * 100) : 0;
            return (
              <div key={bar.label}>
                <div className="flex items-center justify-between mb-1.5 text-xs">
                  <span className="text-muted-foreground">{bar.label}</span>
                  <span className="font-semibold tabular-nums text-foreground font-data">
                    {bar.value}
                    <span className="font-normal text-muted-foreground ml-1">({pct}%)</span>
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: mounted ? `${pct}%` : "0%", background: bar.color }}
                  />
                </div>
              </div>
            );
          })}
          <p className="text-[11px] text-muted-foreground/50">{total} escalaciones en total</p>
        </div>
      )}
    </div>
  );
}

// ─── Leads table ──────────────────────────────────────────────────────────────

function LeadsTable({ isAuthorized }: { isAuthorized: boolean }) {
  const { data, isLoading, error } = useSWR<LeadsData>(
    isAuthorized ? `${API_URL}/dashboard/leads` : null,
    authenticatedJsonFetcher,
    { refreshInterval: 120000 },
  );

  const items = data?.items ?? [];

  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <SectionLabel>Leads recientes</SectionLabel>
        {data != null && (
          <span className="text-[10px] text-muted-foreground/60">
            {data.this_week} esta semana · {data.total} total
          </span>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : error ? (
        <SectionError message="No se pudo cargar los leads." />
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
          <Mail className="h-8 w-8 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">Sin leads capturados aún</p>
          <p className="text-xs text-muted-foreground/60">
            Los leads aparecerán aquí cuando los usuarios dejen su email en el chat.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/40">
                {["Nombre", "Email", "Fecha", "ID"].map((col, i) => (
                  <th
                    key={col}
                    className={cn(
                      "pb-2.5 text-left font-heading text-[10px] uppercase tracking-[0.1em] text-muted-foreground/60",
                      i === 3 && "hidden md:table-cell",
                    )}
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((lead, idx) => (
                <tr
                  key={lead.conversation_id}
                  className={cn(
                    "transition-colors hover:bg-muted/30",
                    idx < items.length - 1 && "border-b border-border/20",
                  )}
                >
                  <td className="py-3 font-medium text-foreground">
                    {lead.lead_name ?? (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="py-3 text-muted-foreground">{lead.lead_email}</td>
                  <td className="whitespace-nowrap py-3 text-muted-foreground">
                    {fmt(lead.captured_at)}
                  </td>
                  <td className="hidden py-3 md:table-cell">
                    <span className="rounded-md bg-muted px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
                      {lead.conversation_id.slice(0, 8)}&hellip;
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// ─── System health strip ──────────────────────────────────────────────────────

function SystemHealthStrip({ isAuthorized }: { isAuthorized: boolean }) {
  const { data, isLoading } = useSWR<SystemStatusData>(
    isAuthorized ? `${API_URL}/internal/status` : null,
    authenticatedJsonFetcher,
    { refreshInterval: 30000 },
  );

  const cb = data?.qdrant_circuit_breaker;
  const cbOk = cb ? !cb.is_open : undefined;
  const cbLabel = !cb
    ? "—"
    : cb.state === "CLOSED"
      ? "Estable"
      : cb.state === "OPEN"
        ? "Abierto"
        : "Recuperando";

  const items: { label: string; value: string; ok?: boolean; icon?: React.ReactNode }[] = [
    {
      label: "Uptime",
      value: isLoading ? "…" : data ? fmtUptime(data.uptime_seconds) : "—",
    },
    {
      label: "RAG",
      icon: <ServiceGlyph name="rag" className="h-3.5 w-3.5" />,
      value: isLoading
        ? "…"
        : data?.rag_available == null
          ? "—"
          : data.rag_available
            ? "Activo"
            : "Inactivo",
      ok: data?.rag_available,
    },
    {
      label: "Cache",
      icon: data?.cache_backend?.toLowerCase().includes("redis")
        ? <ServiceGlyph name="redis" className="h-3.5 w-3.5" />
        : undefined,
      value: isLoading
        ? "…"
        : data?.cache_backend
          ? data.cache_backend.toLowerCase().includes("redis")
            ? "Redis"
            : "Memoria"
          : "—",
      ok: data?.cache_backend
        ? data.cache_backend.toLowerCase().includes("redis")
        : undefined,
    },
    {
      label: "Qdrant CB",
      icon: <ServiceGlyph name="qdrant" className="h-3.5 w-3.5" />,
      value: isLoading
        ? "…"
        : cbLabel + (cb?.failure_count ? ` (${cb.failure_count})` : ""),
      ok: cbOk,
    },
  ];

  return (
    <section>
      <SectionLabel className="mb-4">
        Estado del sistema{data?.version ? ` · v${data.version}` : ""}
      </SectionLabel>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        {items.map((item, idx) => (
          <React.Fragment key={item.label}>
            {idx > 0 && (
              <div className="hidden h-3.5 w-px bg-border/50 sm:block" />
            )}
            <div className="flex items-center gap-2">
              {item.icon && (
                <span className="text-muted-foreground/55">{item.icon}</span>
              )}
              <span className="text-xs text-muted-foreground">{item.label}</span>
              <span
                className={cn(
                  "text-xs font-medium tabular-nums",
                  item.ok === true && "text-success",
                  item.ok === false && "text-error",
                  item.ok === undefined && "text-foreground",
                )}
              >
                {item.value}
              </span>
            </div>
          </React.Fragment>
        ))}

        {data && (
          <div
            className={cn(
              "ml-auto inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium",
              data.status === "ok"
                ? "border-success/20 bg-success/5 text-success"
                : data.status === "degraded"
                  ? "border-warning/20 bg-warning/5 text-warning"
                  : "border-error/20 bg-error/5 text-error",
            )}
          >
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                data.status === "ok"
                  ? "bg-success"
                  : data.status === "degraded"
                    ? "bg-warning"
                    : "bg-error",
              )}
            />
            {data.status === "ok"
              ? "Operacional"
              : data.status === "degraded"
                ? "Degradado"
                : "Crítico"}
          </div>
        )}
      </div>
    </section>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { isAuthorized } = useRequireAdmin();
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const {
    data: overview,
    isLoading: overviewLoading,
    error: overviewError,
    mutate: refreshOverview,
  } = useSWR<OverviewData>(
    isAuthorized ? `${API_URL}/dashboard/overview` : null,
    authenticatedJsonFetcher,
    { refreshInterval: 60000 },
  );

  const handleRefresh = useCallback(() => {
    refreshOverview();
    setLastRefresh(new Date());
  }, [refreshOverview]);

  if (!isAuthorized) return null;

  return (
    <div className="space-y-10 pb-16">
      {/* Page header */}
      <div
        className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between animate-count-reveal"
        style={{ animationDelay: "0ms" }}
      >
        <div>
          <h1 className="text-foreground">Analítica</h1>
          <p className="text-sm text-muted-foreground mt-0.5 capitalize">
            {new Date().toLocaleDateString("es-PE", {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {overview?.pdfs_ready != null && (
            <div
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium",
                overview.pdfs_ready > 0
                  ? "border-success/20 bg-success/5 text-success"
                  : "border-border/60 bg-muted/40 text-muted-foreground",
              )}
            >
              {overview.pdfs_ready > 0 ? (
                <CheckCircle2 className="h-3.5 w-3.5" />
              ) : (
                <AlertCircle className="h-3.5 w-3.5" />
              )}
              {overview.pdfs_ready > 0
                ? `${overview.pdfs_ready} PDF${overview.pdfs_ready !== 1 ? "s" : ""} listos`
                : "Sin PDFs cargados"}
            </div>
          )}

          <span className="text-xs text-muted-foreground">
            {lastRefresh.toLocaleTimeString("es-PE", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            className="h-8 rounded-xl border-border/60 px-3 text-xs"
          >
            <RefreshCw
              className={cn(
                "mr-1.5 h-3.5 w-3.5",
                overviewLoading && "animate-spin",
              )}
            />
            Actualizar
          </Button>
        </div>
      </div>

      {overviewError && (
        <SectionError message="No se pudo cargar el resumen. Verifica tu conexión." />
      )}

      <MetricRow overview={overview} loading={overviewLoading} />

      <Divider />

      {/* Activity chart — full width, no wrapper */}
      <ActivityChart isAuthorized={isAuthorized} />

      <Divider />

      {/* Peak hours + Handoffs — 2-col, no wrappers */}
      <div className="grid grid-cols-1 gap-12 lg:grid-cols-2">
        <PeakHoursChart isAuthorized={isAuthorized} />
        <HandoffSection isAuthorized={isAuthorized} />
      </div>

      <Divider />

      {/* Leads table — no card wrapper */}
      <LeadsTable isAuthorized={isAuthorized} />

      <Divider />

      {/* System health inline strip */}
      <SystemHealthStrip isAuthorized={isAuthorized} />
    </div>
  );
}
