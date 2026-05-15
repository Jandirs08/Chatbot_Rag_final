"use client";
import React, { useState, useCallback, useEffect, useId } from "react";
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
import {
  Mail,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Activity,
  MessageSquare,
  Users,
  FileText,
  TrendingUp,
  Clock,
  Headset,
} from "lucide-react";
import { useRequireAdmin } from "@/app/hooks/useAuthGuard";
import { API_URL } from "@/app/lib/config";
import { authenticatedJsonFetcher } from "@/app/lib/services/authService";
import { Skeleton } from "@/app/components/ui/skeleton";
import { FadeIn, Stagger, StaggerItem, TickNumber, PulseDot } from "@/app/_components/motion";
import { Sparkline } from "@/app/_components/charts/Sparkline";
import { fmtDate, fmtDateShort, fmtNum, fmtHour } from "@/app/lib/format";

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

interface LeadsData { total: number; this_week: number; items: LeadItem[] }

interface PeakHourItem { hour: number; count: number }
interface PeakHoursData { items: PeakHourItem[]; timezone: string }

interface HistoryItem { date: string; messages_count: number; users_count: number }

interface HandoffStatsData {
  user_request: number;
  low_confidence: number;
  out_of_scope: number;
  total: number;
  period_days: number;
}

// ─── Chart tooltip ────────────────────────────────────────────────────────────

interface TooltipPayloadItem { color: string; name: string; value: number }

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: TooltipPayloadItem[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass rounded-lg px-3 py-2 text-xs">
      <p className="mb-1.5 font-mono text-muted-foreground">{label}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2 font-mono">
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: p.color }} />
          <span className="text-muted-foreground">{p.name}:</span>
          <span className="text-foreground tabular-nums">{p.value}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Section header ───────────────────────────────────────────────────────────

function SectionHeader({
  index,
  total,
  title,
  icon: Icon,
  iconColor = "text-primary",
  meta,
}: {
  index: string;
  total: string;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  iconColor?: string;
  meta?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 mb-6">
      <span className="font-mono text-[11px] text-primary/70 tabular-nums">{index} / {total}</span>
      <span className={`${iconColor} flex-shrink-0`}>
        <Icon className="h-4 w-4" />
      </span>
      <h2 className="text-xs uppercase tracking-[0.16em] font-heading text-muted-foreground whitespace-nowrap">
        {title}
      </h2>
      <span className="h-px flex-1 bg-gradient-to-r from-border via-border to-transparent" />
      {meta && <div className="flex-shrink-0">{meta}</div>}
    </div>
  );
}

// ─── KPI card ─────────────────────────────────────────────────────────────────

function KpiCard({
  label,
  icon: Icon,
  value,
  decimals = 0,
  loading,
  sub,
  trend,
  trendDir = "up",
  sparkline,
  sparklineColor = "hsl(var(--primary))",
  glow = "primary",
  orbColor,
  className = "",
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  value: number;
  decimals?: number;
  loading?: boolean;
  sub?: React.ReactNode;
  trend?: string;
  trendDir?: "up" | "down" | "flat";
  sparkline?: number[];
  sparklineColor?: string;
  glow?: "primary" | "cyan" | "violet" | "magenta" | "amber";
  orbColor?: "teal" | "cyan" | "violet" | "magenta";
  className?: string;
}) {
  const glowClassMap = {
    primary: "hover:shadow-glow-primary hover:border-primary/40",
    cyan: "hover:shadow-glow-cyan hover:border-accent-cyan/40",
    violet: "hover:shadow-glow-violet hover:border-accent-violet/40",
    magenta: "hover:shadow-glow-magenta hover:border-accent-magenta/40",
    amber: "hover:border-amber/40",
  };
  const iconColorMap = {
    primary: "text-primary",
    cyan: "text-accent-cyan",
    violet: "text-accent-violet",
    magenta: "text-accent-magenta",
    amber: "text-amber",
  };
  const trendColor =
    trendDir === "up" ? "text-success bg-success/10 border-success/25" :
    trendDir === "down" ? "text-error bg-error/10 border-error/25" :
    "text-muted-foreground bg-muted border-border";

  return (
    <div
      className={`group relative overflow-hidden rounded-2xl border border-border bg-card p-6 transition-all duration-320 ease-out-expo hover:-translate-y-0.5 ${glowClassMap[glow]} ${className}`}
    >
      {orbColor && (
        <div
          aria-hidden="true"
          className="absolute -top-12 -right-12 w-40 h-40 opacity-30 blur-2xl pointer-events-none group-hover:opacity-50 transition-opacity duration-560"
        >
          <img src={`/assets/decor/glow-orb-${orbColor}.svg`} alt="" className="w-full h-full" />
        </div>
      )}

      <div className="relative">
        <div className="flex items-center gap-2 mb-3">
          <Icon className={`h-3.5 w-3.5 ${iconColorMap[glow]}`} />
          <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-heading font-medium">
            {label}
          </p>
        </div>

        {loading ? (
          <Skeleton className="h-10 w-32 mb-2" />
        ) : (
          <div className="flex items-baseline gap-3 mb-2">
            <span className="text-4xl md:text-5xl font-heading font-bold tabular-nums leading-none">
              <TickNumber value={value} decimals={decimals} />
            </span>
            {trend && (
              <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border tabular-nums ${trendColor}`}>
                {trend}
              </span>
            )}
          </div>
        )}

        {sub && <p className="text-xs text-muted-foreground font-mono mt-1">{sub}</p>}

        {sparkline && sparkline.length > 0 && (
          <div className="mt-4">
            <Sparkline data={sparkline} width={240} height={32} color={sparklineColor} strokeWidth={1.5} />
          </div>
        )}
      </div>
    </div>
  );
}

// ─── KPI grid ─────────────────────────────────────────────────────────────────

function KpiGrid({
  overview,
  loading,
  history,
}: {
  overview: OverviewData | undefined;
  loading: boolean;
  history?: HistoryItem[];
}) {
  const buildSeries = (key: keyof Pick<HistoryItem, "messages_count" | "users_count">): number[] => {
    if (!history || history.length === 0) return [];
    return history.map((h) => h[key]);
  };

  const messagesSeries = buildSeries("messages_count");
  const usersSeries = buildSeries("users_count");

  return (
    <Stagger className="grid grid-cols-12 gap-4">
      <StaggerItem className="col-span-12 md:col-span-6">
        <KpiCard
          label="Mensajes hoy"
          icon={MessageSquare}
          value={overview?.today_messages ?? 0}
          loading={loading}
          sub={<span>{fmtNum(overview?.total_messages)} acumulados</span>}
          sparkline={messagesSeries}
          glow="primary"
          orbColor="teal"
          sparklineColor="hsl(var(--primary))"
        />
      </StaggerItem>

      <StaggerItem className="col-span-12 md:col-span-3">
        <KpiCard
          label="Conversaciones hoy"
          icon={Users}
          value={overview?.today_conversations ?? 0}
          loading={loading}
          sub={<span>{fmtNum(overview?.total_conversations)} históricas</span>}
          sparkline={usersSeries}
          glow="cyan"
          orbColor="cyan"
          sparklineColor="hsl(var(--accent-cyan))"
        />
      </StaggerItem>

      <StaggerItem className="col-span-12 md:col-span-3">
        <KpiCard
          label="Leads semana"
          icon={Mail}
          value={overview?.leads_this_week ?? 0}
          loading={loading}
          sub={<span>{fmtNum(overview?.leads_total)} en total</span>}
          glow="amber"
        />
      </StaggerItem>

      <StaggerItem className="col-span-12 md:col-span-12">
        <PdfsCard count={overview?.pdfs_ready ?? 0} loading={loading} />
      </StaggerItem>
    </Stagger>
  );
}

function PdfsCard({ count, loading }: { count: number; loading: boolean }) {
  const empty = !loading && count === 0;
  return (
    <div className={`relative overflow-hidden rounded-2xl border ${empty ? "border-warning/30 bg-warning/[0.03]" : "border-border bg-card"} px-6 py-5 flex items-center gap-6 transition-all duration-320 ease-out-expo`}>
      <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${empty ? "bg-warning/10 text-warning" : "bg-primary/10 text-primary"}`}>
        <FileText className="h-5 w-5" />
      </div>
      <div className="flex-1">
        <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-heading font-medium mb-1">
          PDFs en corpus
        </p>
        {loading ? (
          <Skeleton className="h-7 w-24" />
        ) : (
          <div className="flex items-baseline gap-3">
            <span className="text-2xl font-heading font-bold tabular-nums">
              <TickNumber value={count} />
            </span>
            <span className="text-xs text-muted-foreground font-mono">
              {empty ? "sin documentos cargados aún" : count === 1 ? "documento listo" : "documentos listos"}
            </span>
          </div>
        )}
      </div>
      {empty && (
        <div className="inline-flex items-center gap-1.5 text-xs text-warning font-mono">
          <AlertTriangle className="h-3.5 w-3.5" />
          requiere carga
        </div>
      )}
    </div>
  );
}

// ─── Activity chart ───────────────────────────────────────────────────────────

const DAY_OPTIONS = [7, 30, 90] as const;
type DayOption = (typeof DAY_OPTIONS)[number];

function ActivityChart({
  isAuthorized,
  onHistoryLoaded,
}: {
  isAuthorized: boolean;
  onHistoryLoaded?: (h: HistoryItem[]) => void;
}) {
  const [days, setDays] = useState<DayOption>(7);
  const rawIdMensajes = useId();
  const rawIdUsuarios = useId();
  const gradMensajes = `grad-mensajes-${rawIdMensajes.replace(/:/g, "")}`;
  const gradUsuarios = `grad-usuarios-${rawIdUsuarios.replace(/:/g, "")}`;

  const { data, isLoading, error } = useSWR<HistoryItem[]>(
    isAuthorized ? `${API_URL}/chat/stats/history?days=${days}` : null,
    authenticatedJsonFetcher,
    { refreshInterval: 300000, onSuccess: (d) => { if (days === 7 && onHistoryLoaded) onHistoryLoaded(d); } },
  );

  const chartData = (data ?? []).map((d) => ({
    date: fmtDateShort(d.date),
    Mensajes: d.messages_count,
    Usuarios: d.users_count,
  }));

  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <div className="flex items-baseline justify-between mb-6">
        <p className="text-xs text-muted-foreground font-mono">
          últimos {days} días · auto-refresh 5 min
        </p>
        <div className="flex items-center gap-1 p-1 rounded-lg bg-muted/50 border border-border">
          {DAY_OPTIONS.map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`text-[11px] font-mono px-2.5 py-1 rounded-md tabular-nums transition-all duration-200 ease-out-expo ${
                days === d
                  ? "bg-primary text-primary-foreground shadow-glow-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
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
        <EmptyMini icon={TrendingUp} label="Sin datos para el período" />
      ) : (
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
            <defs>
              <linearGradient id={gradMensajes} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor="hsl(var(--primary))"     stopOpacity={0.32} />
                <stop offset="100%" stopColor="hsl(var(--primary))"     stopOpacity={0} />
              </linearGradient>
              <linearGradient id={gradUsuarios} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor="hsl(var(--accent-cyan))" stopOpacity={0.20} />
                <stop offset="100%" stopColor="hsl(var(--accent-cyan))" stopOpacity={0} />
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
            <Tooltip content={<ChartTooltip />} cursor={{ stroke: "hsl(var(--border))", strokeWidth: 1 }} />
            <Area type="monotone" dataKey="Mensajes" stroke="hsl(var(--primary))" fill={`url(#${gradMensajes})`} strokeWidth={1.75} dot={false} activeDot={{ r: 3, strokeWidth: 0 }} animationDuration={700} />
            <Area type="monotone" dataKey="Usuarios" stroke="hsl(var(--accent-cyan))" fill={`url(#${gradUsuarios})`} strokeWidth={1.5} strokeDasharray="4 3" dot={false} activeDot={{ r: 3, strokeWidth: 0 }} animationDuration={700} />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
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
    <div className="rounded-2xl border border-border bg-card p-6 h-full">
      <div className="flex items-baseline justify-between mb-5">
        <div className="flex items-center gap-2">
          <Clock className="h-3.5 w-3.5 text-accent-cyan" />
          <p className="text-[10px] uppercase tracking-[0.14em] font-heading font-medium text-muted-foreground">
            Horas pico · 30 días
          </p>
        </div>
        {data?.timezone && <span className="text-[11px] font-mono text-muted-foreground">{data.timezone}</span>}
      </div>
      {isLoading ? (
        <Skeleton className="h-36 w-full" />
      ) : error ? (
        <SectionError message="No se pudo cargar las horas pico." />
      ) : chartData.length === 0 ? (
        <EmptyMini icon={Clock} label="Sin datos disponibles" />
      ) : (
        <ResponsiveContainer width="100%" height={156}>
          <BarChart data={chartData} margin={{ top: 4, right: 0, left: -16, bottom: 0 }}>
            <XAxis dataKey="hour" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} interval={2} />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: "hsl(var(--muted))" }} />
            <Bar dataKey="Mensajes" fill="hsl(var(--accent-cyan))" fillOpacity={0.55} radius={[3, 3, 0, 0]} maxBarSize={14} animationDuration={500} />
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

  const total = data?.total ?? 0;
  const bars = [
    { label: "Solicitud de usuario", value: data?.user_request ?? 0,  tone: "primary" as const },
    { label: "Bot sin confianza",    value: data?.low_confidence ?? 0, tone: "primary-faded" as const },
    { label: "Fuera de alcance",     value: data?.out_of_scope ?? 0,   tone: "amber" as const },
  ];

  const toneMap = {
    primary:        { bar: "bg-primary",          text: "text-primary",          opacity: "" },
    "primary-faded":{ bar: "bg-primary/60",       text: "text-primary/80",       opacity: "" },
    amber:          { bar: "bg-amber",            text: "text-amber",            opacity: "" },
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-6 h-full">
      <div className="flex items-center gap-2 mb-5">
        <Headset className="h-3.5 w-3.5 text-amber" />
        <p className="text-[10px] uppercase tracking-[0.14em] font-heading font-medium text-muted-foreground">
          Escalaciones · 30 días
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-9 w-full" />)}</div>
      ) : error ? (
        <SectionError message="No se pudo cargar las escalaciones." />
      ) : total === 0 ? (
        <EmptyIllustrated
          svg="empty-conversations"
          title="Sin escalaciones"
          sub="Bot manejó todo sólo en los últimos 30 días."
          accent="success"
          icon={CheckCircle2}
        />
      ) : (
        <div className="space-y-3">
          {bars.map((bar) => {
            const pct = total > 0 ? Math.round((bar.value / total) * 100) : 0;
            const tones = toneMap[bar.tone];
            return (
              <div key={bar.label}>
                <div className="flex items-baseline justify-between mb-1.5">
                  <span className="text-sm">{bar.label}</span>
                  <span className={`font-mono text-sm tabular-nums ${tones.text}`}>
                    {bar.value}
                    <span className="text-[11px] ml-1.5 text-muted-foreground">({pct}%)</span>
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full rounded-full origin-left ${tones.bar}`}
                    style={{
                      transform: `scaleX(${pct / 100})`,
                      transition: "transform 700ms cubic-bezier(0.16, 1, 0.3, 1)",
                    }}
                  />
                </div>
              </div>
            );
          })}
          <p className="font-mono text-[11px] text-muted-foreground pt-2 tabular-nums">{total} escalaciones en total</p>
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
  const hasItems = items.length > 0;
  const noneAtAll = !isLoading && (data?.total ?? 0) === 0;

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="flex items-baseline justify-between px-6 py-4 border-b border-border/60">
        <p className="text-xs text-muted-foreground font-mono">
          actualización cada 2 min
        </p>
        {data != null && (
          <span className="text-[11px] font-mono text-muted-foreground tabular-nums">
            <span className="text-amber">{data.this_week}</span> esta semana · <span className="text-foreground">{data.total}</span> total
          </span>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2 p-6">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
      ) : error ? (
        <div className="p-6"><SectionError message="No se pudo cargar los leads." /></div>
      ) : noneAtAll ? (
        <EmptyLeads />
      ) : !hasItems ? (
        <div className="p-6"><SectionError message="Hay leads registrados pero no se pudieron cargar. Intenta actualizar." /></div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/60 bg-muted/30">
                {["Nombre", "Email", "Fecha", "ID"].map((col, i) => (
                  <th
                    key={col}
                    className={`px-6 py-3 text-left text-[10px] uppercase tracking-[0.14em] font-heading font-medium text-muted-foreground ${i === 3 ? "hidden md:table-cell" : ""}`}
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
                  className={`transition-colors duration-200 hover:bg-primary/[0.04] ${idx < items.length - 1 ? "border-b border-border/40" : ""}`}
                >
                  <td className="px-6 py-3.5 text-foreground">
                    {lead.lead_name ?? <span className="text-muted-foreground italic">sin nombre</span>}
                  </td>
                  <td className="px-6 py-3.5 font-mono text-xs text-foreground/90">{lead.lead_email}</td>
                  <td className="px-6 py-3.5 whitespace-nowrap font-mono text-xs text-muted-foreground">{fmtDate(lead.captured_at)}</td>
                  <td className="hidden px-6 py-3.5 md:table-cell">
                    <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-muted text-muted-foreground border border-border/60">
                      {lead.conversation_id.slice(0, 8)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function EmptyLeads() {
  return (
    <div className="relative overflow-hidden p-12">
      <div aria-hidden="true" className="absolute inset-0 bg-grid opacity-30 pointer-events-none" />
      <div className="relative flex flex-col items-center text-center">
        <div className="text-amber w-32 h-24 mb-5">
          <img src="/assets/decor/empty-conversations.svg" alt="" className="w-full h-full" />
        </div>
        <p className="font-heading font-semibold text-base text-foreground">
          Sin leads capturados aún
        </p>
        <p className="text-sm text-muted-foreground mt-1 max-w-sm">
          Aparecerán acá cuando los usuarios dejen su email durante una conversación.
        </p>
        <div className="mt-5 inline-flex items-center gap-2 text-[11px] font-mono text-amber/80">
          <Mail className="h-3 w-3" />
          esperando primer lead
        </div>
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function SectionError({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-error/10 border border-error/25">
      <AlertCircle className="h-4 w-4 text-error" />
      <span className="text-sm text-error">{message}</span>
    </div>
  );
}

function EmptyMini({ icon: Icon, label }: { icon: React.ComponentType<{ className?: string }>; label: string }) {
  return (
    <div className="relative overflow-hidden rounded-lg border border-dashed border-border bg-card/40 py-10">
      <div aria-hidden="true" className="absolute inset-0 bg-grid opacity-30 pointer-events-none" />
      <div className="relative flex flex-col items-center justify-center gap-3 text-center">
        <div className="text-muted-foreground/80 w-24 h-16">
          <img src="/assets/decor/empty-metrics.svg" alt="" className="w-full h-full" />
        </div>
        <div className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
          <Icon className="h-3.5 w-3.5" />
          {label}
        </div>
      </div>
    </div>
  );
}

function EmptyIllustrated({
  svg,
  title,
  sub,
  accent,
  icon: Icon,
}: {
  svg: string;
  title: string;
  sub: string;
  accent: "primary" | "amber" | "success" | "cyan";
  icon: React.ComponentType<{ className?: string }>;
}) {
  const accentMap = {
    primary: "text-primary",
    amber: "text-amber",
    success: "text-success",
    cyan: "text-accent-cyan",
  };
  return (
    <div className="relative overflow-hidden rounded-xl border border-dashed border-border bg-card/40 px-6 py-8">
      <div aria-hidden="true" className="absolute inset-0 bg-grid opacity-30 pointer-events-none" />
      <div className="relative flex flex-col items-center text-center gap-3">
        <div className={`${accentMap[accent]} w-28 h-20`}>
          <img src={`/assets/decor/${svg}.svg`} alt="" className="w-full h-full" />
        </div>
        <div>
          <p className="font-heading font-semibold text-sm text-foreground">{title}</p>
          <p className="text-xs text-muted-foreground mt-1 max-w-xs">{sub}</p>
        </div>
        <div className={`inline-flex items-center gap-1.5 text-[11px] font-mono ${accentMap[accent]}`}>
          <Icon className="h-3 w-3" />
          {accent === "success" ? "todo en orden" : "esperando datos"}
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { isAuthorized } = useRequireAdmin();
  const [lastRefreshStr, setLastRefreshStr] = useState("");
  const [todayStr, setTodayStr] = useState("");
  const [history7d, setHistory7d] = useState<HistoryItem[] | undefined>();

  useEffect(() => {
    const now = new Date();
    setLastRefreshStr(now.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" }));
    setTodayStr(now.toLocaleDateString("es-PE", { weekday: "long", day: "numeric", month: "long" }));
  }, []);

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
    setLastRefreshStr(new Date().toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" }));
  }, [refreshOverview]);

  if (!isAuthorized) return null;

  return (
    <div className="min-h-full -m-8 p-6 md:p-10 lg:p-14">
      <div className="mx-auto max-w-[1200px] space-y-12">

        {/* ── HERO ─────────────────────────────────────────────── */}
        <FadeIn>
          <section className="relative overflow-hidden rounded-3xl border border-border/60 bg-card px-8 py-12 md:px-12 md:py-14">
            {/* decor orbs */}
            <div
              aria-hidden="true"
              className="absolute -top-24 -right-24 w-[420px] h-[420px] opacity-50 animate-orb-float pointer-events-none"
            >
              <img src="/assets/decor/glow-orb-teal.svg" alt="" className="w-full h-full" />
            </div>
            <div
              aria-hidden="true"
              className="absolute -bottom-32 -left-20 w-[460px] h-[460px] opacity-30 animate-orb-float pointer-events-none"
              style={{ animationDelay: "-9s" }}
            >
              <img src="/assets/decor/glow-orb-cyan.svg" alt="" className="w-full h-full" />
            </div>
            <div aria-hidden="true" className="absolute inset-0 bg-grid opacity-30 pointer-events-none" />

            <div className="relative flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
              <div>
                <div className="flex items-center gap-2.5 mb-4">
                  <span className="font-mono text-[11px] text-primary/70 tabular-nums">01 / 05</span>
                  <span className="h-px w-8 bg-primary/40" />
                  <span className="text-[10px] uppercase tracking-[0.18em] font-heading text-muted-foreground">
                    Resumen del día
                  </span>
                </div>

                <h1 className="text-4xl md:text-5xl lg:text-6xl font-heading font-bold tracking-tighter leading-[1.02] mb-3">
                  <span className="gradient-hero-display">Estado de actividad</span>
                </h1>

                <p className="text-base md:text-lg text-muted-foreground capitalize">
                  {todayStr || "cargando…"}
                </p>

                <div className="flex flex-wrap items-center gap-3 mt-5">
                  <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-success/10 border border-success/25">
                    <PulseDot color="success" size={6} />
                    <span className="text-[11px] font-mono text-success">EN VIVO</span>
                  </div>
                  <span className="text-[11px] font-mono text-muted-foreground tabular-nums">
                    actualizado {lastRefreshStr || "--:--"}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={handleRefresh}
                className="self-start inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-border bg-background/40 backdrop-blur-sm text-xs font-mono text-muted-foreground hover:text-foreground hover:border-primary/40 hover:bg-primary/[0.04] transition-all duration-200 ease-out-expo"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${overviewLoading ? "animate-spin text-primary" : ""}`} />
                actualizar
              </button>
            </div>
          </section>
        </FadeIn>

        {overviewError && <SectionError message="No se pudo cargar el resumen. Verifica tu conexión." />}

        {/* ── KPIs BENTO ───────────────────────────────────────── */}
        <FadeIn delay={0.08}>
          <KpiGrid overview={overview} loading={overviewLoading} history={history7d} />
        </FadeIn>

        {/* ── 02 — TENDENCIA ───────────────────────────────────── */}
        <FadeIn delay={0.16}>
          <section>
            <SectionHeader
              index="02"
              total="05"
              title="Tendencia de actividad"
              icon={TrendingUp}
              iconColor="text-primary"
            />
            <ActivityChart isAuthorized={isAuthorized} onHistoryLoaded={setHistory7d} />
          </section>
        </FadeIn>

        {/* ── 03 — DISTRIBUCIÓN ────────────────────────────────── */}
        <FadeIn delay={0.24}>
          <section>
            <SectionHeader
              index="03"
              total="05"
              title="Distribución"
              icon={Activity}
              iconColor="text-accent-cyan"
            />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <PeakHoursChart isAuthorized={isAuthorized} />
              <HandoffSection isAuthorized={isAuthorized} />
            </div>
          </section>
        </FadeIn>

        {/* ── 04 — LEADS ───────────────────────────────────────── */}
        <FadeIn delay={0.32}>
          <section>
            <SectionHeader
              index="04"
              total="05"
              title="Leads recientes"
              icon={Mail}
              iconColor="text-amber"
            />
            <LeadsTable isAuthorized={isAuthorized} />
          </section>
        </FadeIn>

      </div>
    </div>
  );
}
