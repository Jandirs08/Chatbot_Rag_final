"use client";
import React, { useState, useCallback, useEffect } from "react";
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
import { Skeleton } from "@/app/components/ui/skeleton";
import { TelemetryMetric } from "@/app/_components/telemetry";
import type { Sample } from "@/app/hooks/useRingBuffer";

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" })
    : "—";

const fmtNum = (n: number | undefined): string =>
  n == null ? "—" : n.toLocaleString("es-PE");

const fmtHour = (h: number) => {
  const ampm = h < 12 ? "am" : "pm";
  const display = h % 12 === 0 ? 12 : h % 12;
  return `${display}${ampm}`;
};

const fmtDateShort = (dateStr: string) => {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("es-PE", { day: "2-digit", month: "short" });
};

// ─── Chart tooltip ────────────────────────────────────────────────────────────

interface TooltipPayloadItem { color: string; name: string; value: number }

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: TooltipPayloadItem[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-sm px-3 py-2 text-xs t-tile" style={{ background: "var(--t-canvas)" }}>
      <p className="mb-1.5 t-mono-sm" style={{ color: "var(--t-ink)" }}>{label}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2 t-mono-sm">
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: p.color }} />
          <span style={{ color: "var(--t-ink-soft)" }}>{p.name}:</span>
          <span className="t-mono" style={{ color: "var(--t-ink)" }}>{p.value}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Hero metrics row ─────────────────────────────────────────────────────────

function MetricRow({
  overview,
  loading,
  history,
}: {
  overview: OverviewData | undefined;
  loading: boolean;
  history?: HistoryItem[];
}) {
  // Build sparkline samples from history
  const buildSamples = (key: keyof Pick<HistoryItem, "messages_count" | "users_count">): Sample[] => {
    if (!history || history.length === 0) return [];
    return history.map((h, i) => ({ t: i, v: h[key] }));
  };

  const messagesSamples = buildSamples("messages_count");
  const usersSamples = buildSamples("users_count");

  if (loading) {
    return (
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-x-12 gap-y-6">
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-20" />)}
      </section>
    );
  }

  return (
    <section className="grid grid-cols-2 lg:grid-cols-4 gap-x-12 gap-y-8">
      <TelemetryMetric
        label="Mensajes hoy"
        value={fmtNum(overview?.today_messages ?? 0)}
        sub={`${fmtNum(overview?.total_messages)} en total`}
        samples={messagesSamples}
      />
      <TelemetryMetric
        label="Conversaciones hoy"
        value={fmtNum(overview?.today_conversations ?? 0)}
        sub={`${fmtNum(overview?.total_conversations)} históricas`}
        samples={usersSamples}
      />
      <TelemetryMetric
        label="Leads esta semana"
        value={fmtNum(overview?.leads_this_week ?? 0)}
        sub={`${fmtNum(overview?.leads_total)} en total`}
        severity="info"
      />
      <TelemetryMetric
        label="PDFs en base"
        value={fmtNum(overview?.pdfs_ready ?? 0)}
        sub="documentos listos"
        severity="info"
      />
    </section>
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
    <section>
      <div className="flex items-baseline justify-between mb-6">
        <p className="t-label">Actividad · últimos {days} días</p>
        <div className="flex items-center gap-1">
          {DAY_OPTIONS.map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className="t-mono-sm px-2 py-1 rounded-sm transition-colors"
              style={
                days === d
                  ? { background: "var(--t-ink)", color: "var(--t-canvas)" }
                  : { color: "var(--t-ink-soft)" }
              }
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
        <p className="t-small py-12 text-center">Sin datos para el período seleccionado</p>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
            <defs>
              <linearGradient id="grad-mensajes" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor="var(--t-data)"     stopOpacity={0.22} />
                <stop offset="100%" stopColor="var(--t-data)"     stopOpacity={0} />
              </linearGradient>
              <linearGradient id="grad-usuarios" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor="var(--t-ink-soft)" stopOpacity={0.10} />
                <stop offset="100%" stopColor="var(--t-ink-soft)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11, fill: "var(--t-ink-soft)" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "var(--t-ink-soft)" }}
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
            />
            <Tooltip content={<ChartTooltip />} cursor={{ stroke: "var(--t-ink-faint)", strokeWidth: 1 }} />
            <Area type="monotone" dataKey="Mensajes" stroke="var(--t-data)" fill="url(#grad-mensajes)" strokeWidth={1.75} dot={false} activeDot={{ r: 3, strokeWidth: 0 }} animationDuration={700} />
            <Area type="monotone" dataKey="Usuarios" stroke="var(--t-ink-soft)" fill="url(#grad-usuarios)" strokeWidth={1.25} strokeDasharray="4 3" dot={false} activeDot={{ r: 3, strokeWidth: 0 }} animationDuration={700} />
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
      <div className="flex items-baseline justify-between mb-5">
        <p className="t-label">Horas pico · 30 días</p>
        {data?.timezone && <span className="t-mono-sm">{data.timezone}</span>}
      </div>
      {isLoading ? (
        <Skeleton className="h-36 w-full" />
      ) : error ? (
        <SectionError message="No se pudo cargar las horas pico." />
      ) : chartData.length === 0 ? (
        <p className="t-small py-8 text-center">Sin datos disponibles</p>
      ) : (
        <ResponsiveContainer width="100%" height={144}>
          <BarChart data={chartData} margin={{ top: 4, right: 0, left: -16, bottom: 0 }}>
            <XAxis dataKey="hour" tick={{ fontSize: 10, fill: "var(--t-ink-soft)" }} axisLine={false} tickLine={false} interval={2} />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--t-surface)" }} />
            <Bar dataKey="Mensajes" fill="var(--t-data)" fillOpacity={0.55} radius={[2, 2, 0, 0]} maxBarSize={14} animationDuration={500} />
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
    { label: "Solicitud de usuario", value: data?.user_request ?? 0,  severity: "ok" as const },
    { label: "Bot sin confianza",    value: data?.low_confidence ?? 0, severity: "warn" as const },
    { label: "Fuera de alcance",     value: data?.out_of_scope ?? 0,   severity: "info" as const },
  ];

  return (
    <div>
      <p className="t-label mb-5">Escalaciones · 30 días</p>
      {isLoading ? (
        <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-9 w-full" />)}</div>
      ) : error ? (
        <SectionError message="No se pudo cargar las escalaciones." />
      ) : total === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
          <CheckCircle2 className="h-7 w-7" style={{ color: "var(--t-ink-mute)" }} />
          <p className="t-small">Sin escalaciones en 30 días</p>
        </div>
      ) : (
        <div className="space-y-3">
          {bars.map((bar) => {
            const pct = total > 0 ? Math.round((bar.value / total) * 100) : 0;
            return (
              <div key={bar.label}>
                <div className="flex items-baseline justify-between mb-1.5">
                  <span className="t-small">{bar.label}</span>
                  <span className="t-mono">
                    {bar.value}
                    <span className="t-mono-sm ml-1.5">({pct}%)</span>
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ background: "var(--t-surface-deep)" }}>
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${pct}%`,
                      background:
                        bar.severity === "warn" ? "var(--t-signal)"
                        : bar.severity === "info" ? "var(--t-ink-mute)"
                        : "var(--t-data)",
                    }}
                  />
                </div>
              </div>
            );
          })}
          <p className="t-mono-sm pt-2">{total} escalaciones en total</p>
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
      <div className="flex items-baseline justify-between mb-5">
        <p className="t-label">Leads recientes</p>
        {data != null && (
          <span className="t-mono-sm">{data.this_week} esta semana · {data.total} total</span>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
      ) : error ? (
        <SectionError message="No se pudo cargar los leads." />
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
          <Mail className="h-8 w-8" style={{ color: "var(--t-ink-mute)" }} />
          <p className="t-small">Sin leads capturados aún</p>
          <p className="t-mono-sm">Aparecerán cuando los usuarios dejen su email.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b" style={{ borderColor: "var(--t-surface-edge)" }}>
                {["Nombre", "Email", "Fecha", "ID"].map((col, i) => (
                  <th
                    key={col}
                    className={`pb-2.5 text-left t-label ${i === 3 ? "hidden md:table-cell" : ""}`}
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
                  className={idx < items.length - 1 ? "border-b" : ""}
                  style={{ borderColor: "var(--t-surface-edge)" }}
                >
                  <td className="py-3 t-body" style={{ color: "var(--t-ink)" }}>
                    {lead.lead_name ?? <span style={{ color: "var(--t-ink-soft)" }}>—</span>}
                  </td>
                  <td className="py-3 t-mono-sm">{lead.lead_email}</td>
                  <td className="whitespace-nowrap py-3 t-mono-sm">{fmt(lead.captured_at)}</td>
                  <td className="hidden py-3 md:table-cell">
                    <span className="t-mono-sm px-2 py-0.5 rounded-sm" style={{ background: "var(--t-surface)" }}>
                      {lead.conversation_id.slice(0, 8)}…
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

// ─── Section error ────────────────────────────────────────────────────────────

function SectionError({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2 px-4 py-3 rounded-sm" style={{ background: "var(--t-signal-soft)" }}>
      <AlertCircle className="h-4 w-4" style={{ color: "var(--t-signal-deep)" }} />
      <span className="t-small" style={{ color: "var(--t-signal-deep)" }}>{message}</span>
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
    <div data-surface="telemetry" className="min-h-full -m-6 p-8 md:p-12 lg:p-14">
      <div className="mx-auto max-w-[1100px] space-y-14">

        {/* Header */}
        <header className="flex items-start justify-between gap-6">
          <div>
            <p className="t-label mb-3">Métricas · resumen del día</p>
            <h1 className="t-title mb-1">Estado de actividad</h1>
            <p className="t-body capitalize">{todayStr}</p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <span className="t-mono-sm">{lastRefreshStr}</span>
            <button
              type="button"
              onClick={handleRefresh}
              className="t-mono-sm inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-sm border transition-colors hover:bg-[var(--t-surface)]"
              style={{ borderColor: "var(--t-surface-edge)", color: "var(--t-ink-mid)" }}
            >
              <RefreshCw className={`h-3 w-3 ${overviewLoading ? "animate-spin" : ""}`} />
              actualizar
            </button>
          </div>
        </header>

        {overviewError && <SectionError message="No se pudo cargar el resumen. Verifica tu conexión." />}

        <MetricRow overview={overview} loading={overviewLoading} history={history7d} />

        <ActivityChart isAuthorized={isAuthorized} onHistoryLoaded={setHistory7d} />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-16 gap-y-12">
          <PeakHoursChart isAuthorized={isAuthorized} />
          <HandoffSection isAuthorized={isAuthorized} />
        </div>

        <LeadsTable isAuthorized={isAuthorized} />

      </div>
    </div>
  );
}
