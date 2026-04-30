"use client";

import React, { useState, useCallback } from "react";
import useSWR from "swr";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { MessageSquare, Users, Mail, TrendingUp, RefreshCw, CheckCircle2, AlertCircle, FileText, Activity, Database, Zap, Clock } from "lucide-react";
import { useRequireAdmin } from "@/app/hooks/useAuthGuard";
import { API_URL } from "@/app/lib/config";
import { authenticatedJsonFetcher } from "@/app/lib/services/authService";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import { Skeleton } from "@/app/components/ui/skeleton";
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

function SectionError({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2 rounded-2xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
      <AlertCircle className="h-4 w-4 flex-none" />
      {message}
    </div>
  );
}

interface KpiCardProps {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ReactNode;
  loading?: boolean;
}

function KpiCard({ label, value, sub, icon, loading }: KpiCardProps) {
  if (loading) {
    return (
      <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <Skeleton className="mb-3 h-4 w-24 rounded" />
        <Skeleton className="mb-2 h-8 w-16 rounded" />
        <Skeleton className="h-3 w-32 rounded" />
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-shadow hover:shadow-[0_2px_8px_rgba(15,23,42,0.08)]">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          {label}
        </span>
        <span className="text-muted-foreground/60">{icon}</span>
      </div>
      <p className="text-3xl font-semibold tabular-nums text-foreground">
        {value}
      </p>
      {sub && (
        <p className="mt-1.5 text-xs text-muted-foreground">{sub}</p>
      )}
    </div>
  );
}

interface ChartCardProps {
  title: string;
  badge?: React.ReactNode;
  children: React.ReactNode;
  action?: React.ReactNode;
}

function ChartCard({ title, badge, children, action }: ChartCardProps) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex items-center justify-between border-b border-border/60 px-5 py-4">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-foreground">{title}</span>
          {badge}
        </div>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

// Custom tooltip for recharts
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

// ─── Section: Activity chart ──────────────────────────────────────────────────

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
    <ChartCard
      title="Actividad"
      badge={
        <span className="text-xs text-muted-foreground">
          últimos {days} días
        </span>
      }
      action={
        <div className="flex items-center gap-1 rounded-lg border border-border/60 p-0.5">
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
      }
    >
      {isLoading ? (
        <SectionSkeleton height="h-48" />
      ) : error ? (
        <SectionError message="No se pudo cargar la actividad." />
      ) : chartData.length === 0 ? (
        <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
          Sin datos para el período seleccionado
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="hsl(var(--border))"
              strokeOpacity={0.6}
            />
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
            <Legend
              wrapperStyle={{ fontSize: 11, color: "hsl(var(--muted-foreground))" }}
              iconSize={8}
              iconType="circle"
            />
            <Line
              type="monotone"
              dataKey="Mensajes"
              stroke="hsl(var(--primary))"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0 }}
            />
            <Line
              type="monotone"
              dataKey="Usuarios"
              stroke="hsl(var(--muted-foreground))"
              strokeWidth={2}
              dot={false}
              strokeDasharray="4 2"
              activeDot={{ r: 4, strokeWidth: 0 }}
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  );
}

// ─── Section: Peak hours chart ────────────────────────────────────────────────

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
    <ChartCard
      title="Horas pico"
      badge={
        data?.timezone ? (
          <span className="text-xs text-muted-foreground">{data.timezone}</span>
        ) : null
      }
    >
      {isLoading ? (
        <SectionSkeleton height="h-48" />
      ) : error ? (
        <SectionError message="No se pudo cargar las horas pico." />
      ) : chartData.length === 0 ? (
        <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
          Sin datos disponibles
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="hsl(var(--border))"
              strokeOpacity={0.6}
              vertical={false}
            />
            <XAxis
              dataKey="hour"
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
              axisLine={false}
              tickLine={false}
              interval={2}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
            />
            <Tooltip content={<ChartTooltip />} />
            <Bar
              dataKey="Mensajes"
              fill="hsl(var(--primary))"
              radius={[4, 4, 0, 0]}
              maxBarSize={20}
            />
          </BarChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  );
}

// ─── Section: Leads table ─────────────────────────────────────────────────────

function LeadsTable({ isAuthorized }: { isAuthorized: boolean }) {
  const { data, isLoading, error } = useSWR<LeadsData>(
    isAuthorized ? `${API_URL}/dashboard/leads` : null,
    authenticatedJsonFetcher,
    { refreshInterval: 120000 },
  );

  const items = data?.items ?? [];

  return (
    <div className="rounded-2xl border border-border/60 bg-card shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex items-center justify-between border-b border-border/60 px-5 py-4">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-foreground">Leads recientes</span>
          {data?.this_week != null && (
            <Badge
              variant="secondary"
              className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
            >
              {data.this_week} esta semana
            </Badge>
          )}
        </div>
        {data?.total != null && (
          <span className="text-xs text-muted-foreground">
            {data.total} en total
          </span>
        )}
      </div>

      <div className="overflow-x-auto">
        {isLoading ? (
          <div className="p-5">
            <SectionSkeleton rows={4} height="h-10" />
          </div>
        ) : error ? (
          <div className="p-5">
            <SectionError message="No se pudo cargar los leads." />
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-1.5 px-6 py-12 text-center">
            <Mail className="h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm font-medium text-muted-foreground">
              Sin leads capturados aún
            </p>
            <p className="text-xs text-muted-foreground/70">
              Los leads aparecerán aquí cuando los usuarios dejen su email en el chat.
            </p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/60">
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                  Nombre
                </th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                  Email
                </th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                  Fecha
                </th>
                <th className="hidden px-5 py-3 text-left text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground md:table-cell">
                  Conversación
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((lead, idx) => (
                <tr
                  key={lead.conversation_id}
                  className={cn(
                    "transition-colors hover:bg-muted/40",
                    idx < items.length - 1 && "border-b border-border/40",
                  )}
                >
                  <td className="px-5 py-3 font-medium text-foreground">
                    {lead.lead_name ?? <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-5 py-3 text-muted-foreground">
                    {lead.lead_email}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3 text-muted-foreground">
                    {fmt(lead.captured_at)}
                  </td>
                  <td className="hidden px-5 py-3 md:table-cell">
                    <span className="rounded-md bg-muted px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
                      {lead.conversation_id.slice(0, 8)}&hellip;
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ─── Section: System status ───────────────────────────────────────────────────

function SystemStatus({ overview }: { overview: OverviewData | undefined; loading: boolean }) {
  const pdfs = overview?.pdfs_ready;
  const ok = pdfs != null && pdfs > 0;

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium",
        ok
          ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-400"
          : "border-border/60 bg-muted/40 text-muted-foreground",
      )}
    >
      {ok ? (
        <CheckCircle2 className="h-3.5 w-3.5" />
      ) : (
        <AlertCircle className="h-3.5 w-3.5" />
      )}
      {pdfs == null
        ? "Estado desconocido"
        : ok
          ? `${pdfs} PDF${pdfs !== 1 ? "s" : ""} listos`
          : "Sin PDFs cargados"}
    </div>
  );
}

// ─── Section: System health ───────────────────────────────────────────────────

function SystemHealthCard({ isAuthorized }: { isAuthorized: boolean }) {
  const { data, isLoading, error } = useSWR<SystemStatusData>(
    isAuthorized ? `${API_URL}/internal/status` : null,
    authenticatedJsonFetcher,
    { refreshInterval: 30000 },
  );

  const cb = data?.qdrant_circuit_breaker;
  const cbColor = !cb ? "text-muted-foreground" : cb.is_open ? "text-red-500" : "text-emerald-500";
  const cbLabel = !cb ? "—" : cb.state === "CLOSED" ? "Estable" : cb.state === "OPEN" ? "Abierto" : "Recuperando";

  const rows: { icon: React.ReactNode; label: string; value: React.ReactNode }[] = [
    {
      icon: <Clock className="h-3.5 w-3.5" />,
      label: "Uptime",
      value: data ? fmtUptime(data.uptime_seconds) : "—",
    },
    {
      icon: <Activity className="h-3.5 w-3.5" />,
      label: "RAG",
      value: data ? (
        <span className={data.rag_available ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}>
          {data.rag_available ? "Activo" : "Inactivo"}
        </span>
      ) : "—",
    },
    {
      icon: <Database className="h-3.5 w-3.5" />,
      label: "Cache",
      value: data ? (
        <span className={data.cache_backend?.toLowerCase().includes("redis") ? "text-foreground" : "text-amber-600 dark:text-amber-400"}>
          {data.cache_backend?.toLowerCase().includes("redis") ? "Redis" : "Memoria"}
        </span>
      ) : "—",
    },
    {
      icon: <Zap className="h-3.5 w-3.5" />,
      label: "Qdrant CB",
      value: data ? <span className={cbColor}>{cbLabel}{cb && cb.failure_count > 0 ? ` (${cb.failure_count} err)` : ""}</span> : "—",
    },
  ];

  return (
    <div className="rounded-2xl border border-border/60 bg-card shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex items-center justify-between border-b border-border/60 px-5 py-4">
        <span className="text-sm font-semibold text-foreground">Estado del sistema</span>
        {data && (
          <Badge
            variant="secondary"
            className={cn(
              "rounded-full px-2 py-0.5 text-[10px] font-semibold",
              data.status === "ok" && "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400",
              data.status === "degraded" && "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400",
              data.status === "critical" && "bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400",
            )}
          >
            {data.status === "ok" ? "Operacional" : data.status === "degraded" ? "Degradado" : "Crítico"}
          </Badge>
        )}
      </div>
      <div className="p-5">
        {isLoading ? (
          <SectionSkeleton rows={4} height="h-8" />
        ) : error ? (
          <SectionError message="No se pudo cargar el estado del sistema." />
        ) : (
          <div className="space-y-3">
            {rows.map((row) => (
              <div key={row.label} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  {row.icon}
                  <span>{row.label}</span>
                </div>
                <span className="font-medium tabular-nums text-foreground">{row.value}</span>
              </div>
            ))}
            {data?.version && (
              <p className="pt-1 text-[10px] text-muted-foreground/50">v{data.version}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Section: Handoff breakdown ───────────────────────────────────────────────

function HandoffBreakdown({ isAuthorized }: { isAuthorized: boolean }) {
  const { data, isLoading, error } = useSWR<HandoffStatsData>(
    isAuthorized ? `${API_URL}/inbox/handoff-stats?days=30` : null,
    authenticatedJsonFetcher,
    { refreshInterval: 300000 },
  );

  const total = data?.total ?? 0;
  const bars = [
    { label: "Solicitud de usuario", value: data?.user_request ?? 0, color: "bg-primary" },
    { label: "Bot sin confianza", value: data?.low_confidence ?? 0, color: "bg-amber-500" },
    { label: "Fuera de alcance", value: data?.out_of_scope ?? 0, color: "bg-slate-400" },
  ];

  return (
    <div className="rounded-2xl border border-border/60 bg-card shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex items-center justify-between border-b border-border/60 px-5 py-4">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-foreground">Escalaciones al humano</span>
          <span className="text-xs text-muted-foreground">30 días</span>
        </div>
        {data && total > 0 && (
          <span className="text-xs text-muted-foreground">{total} total</span>
        )}
      </div>
      <div className="p-5">
        {isLoading ? (
          <SectionSkeleton rows={3} height="h-10" />
        ) : error ? (
          <SectionError message="No se pudo cargar las escalaciones." />
        ) : total === 0 ? (
          <div className="flex flex-col items-center justify-center gap-1.5 py-8 text-center">
            <CheckCircle2 className="h-7 w-7 text-emerald-500/60" />
            <p className="text-sm font-medium text-muted-foreground">Sin escalaciones en 30 días</p>
          </div>
        ) : (
          <div className="space-y-4">
            {bars.map((bar) => {
              const pct = total > 0 ? Math.round((bar.value / total) * 100) : 0;
              return (
                <div key={bar.label} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{bar.label}</span>
                    <span className="font-semibold tabular-nums text-foreground">
                      {bar.value} <span className="font-normal text-muted-foreground">({pct}%)</span>
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn("h-full rounded-full transition-all duration-500", bar.color)}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

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

  if (!isAuthorized) {
    return null;
  }

  const kpiCards: KpiCardProps[] = [
    {
      label: "Mensajes hoy",
      value: fmtNum(overview?.today_messages),
      sub: `${fmtNum(overview?.total_messages)} mensajes en total`,
      icon: <MessageSquare className="h-4 w-4" />,
      loading: overviewLoading,
    },
    {
      label: "Conversaciones hoy",
      value: fmtNum(overview?.today_conversations),
      sub: `${fmtNum(overview?.total_conversations)} conversaciones en total`,
      icon: <Users className="h-4 w-4" />,
      loading: overviewLoading,
    },
    {
      label: "Leads total",
      value: fmtNum(overview?.leads_total),
      sub: `${fmtNum(overview?.leads_this_week)} esta semana`,
      icon: <Mail className="h-4 w-4" />,
      loading: overviewLoading,
    },
    {
      label: "Leads esta semana",
      value: fmtNum(overview?.leads_this_week),
      sub: overview?.leads_total
        ? `${Math.round(((overview.leads_this_week ?? 0) / overview.leads_total) * 100)}% del total`
        : undefined,
      icon: <TrendingUp className="h-4 w-4" />,
      loading: overviewLoading,
    },
  ];

  return (
    <div className="space-y-6 px-1 py-1 pb-10">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold text-foreground">Dashboard</h1>
          <SystemStatus overview={overview} loading={overviewLoading} />
          {overview?.pdfs_ready != null && (
            <div className="hidden items-center gap-1.5 sm:flex">
              <FileText className="h-3.5 w-3.5 text-muted-foreground/60" />
              <span className="text-xs text-muted-foreground">
                {overview.pdfs_ready} PDF{overview.pdfs_ready !== 1 ? "s" : ""}
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            Actualizado{" "}
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
              className={cn("mr-1.5 h-3.5 w-3.5", overviewLoading && "animate-spin")}
            />
            Actualizar
          </Button>
        </div>
      </div>

      {/* Overview error */}
      {overviewError && (
        <SectionError message="No se pudo cargar el resumen. Verifica tu conexión." />
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {kpiCards.map((card) => (
          <KpiCard key={card.label} {...card} />
        ))}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ActivityChart isAuthorized={isAuthorized} />
        <PeakHoursChart isAuthorized={isAuthorized} />
      </div>

      {/* Health + Handoffs row */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SystemHealthCard isAuthorized={isAuthorized} />
        <HandoffBreakdown isAuthorized={isAuthorized} />
      </div>

      {/* Leads table */}
      <LeadsTable isAuthorized={isAuthorized} />
    </div>
  );
}
