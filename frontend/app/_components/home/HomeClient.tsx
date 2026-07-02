"use client";

import { useRouter } from "next/navigation";
import {
  Settings,
  Upload,
  Users,
  FileText,
  ChevronRight,
  Zap,
  Bot,
  Hand,
  ArrowRight,
  Monitor,
  Download,
  Settings2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useAuth } from "@/app/hooks/useAuth";
import { useBotState } from "@/app/hooks/useDashboardData";
import {
  useOverview,
  useStatsHistory,
  useHandoffStats,
  useRecentConversations,
  useHomeBotRuntime,
} from "@/app/hooks/useHomeData";
import type { RecentConversation } from "@/app/lib/services/homeService";

// ── Helpers ────────────────────────────────────────────────────────────────

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Buenos días";
  if (h < 19) return "Buenas tardes";
  return "Buenas noches";
}

function formatDate(): string {
  return new Date().toLocaleDateString("es-PE", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function relativeTime(dateStr?: string | null): string {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "ahora";
  if (mins < 60) return `hace ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `hace ${hours} h`;
  return `hace ${Math.floor(hours / 24)} d`;
}

function initials(name?: string | null): string {
  if (!name?.trim()) return "?";
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

function buildSparklinePath(data: { messages_count: number }[]): {
  line: string;
  area: string;
} {
  if (data.length < 2) return { line: "", area: "" };
  const vals = data.map((d) => d.messages_count);
  const max = Math.max(...vals, 1);
  const step = 300 / (vals.length - 1);
  const points = vals.map((v, i) => ({
    x: i * step,
    y: 44 - 4 - (v / max) * 36,
  }));
  const line = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(" ");
  const area = `${line} L${points[points.length - 1].x.toFixed(1)},44 L0,44 Z`;
  return { line, area };
}

// ── Status pill ────────────────────────────────────────────────────────────

function StatusPill({ active }: { active?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border",
        active
          ? "bg-green-50 text-green-700 border-green-200"
          : "bg-red-50 text-red-600 border-red-200",
      )}
    >
      <span
        className={cn(
          "w-1.5 h-1.5 rounded-full",
          active ? "bg-green-500 animate-pulse" : "bg-red-500",
        )}
      />
      {active ? "Sistema activo" : "Sistema inactivo"}
    </span>
  );
}

// ── KPI Cards ──────────────────────────────────────────────────────────────

function KpiHeroCard({
  totalMessages,
  todayMessages,
  historyData,
  loading,
}: {
  totalMessages?: number;
  todayMessages?: number;
  historyData?: { messages_count: number }[];
  loading: boolean;
}) {
  const { line, area } = buildSparklinePath(historyData ?? []);

  if (loading) {
    return (
      <div className="bg-background rounded-xl border border-border p-5 shadow-sm">
        <Skeleton className="h-3.5 w-32 mb-3" />
        <Skeleton className="h-10 w-24 mb-2" />
        <Skeleton className="h-3 w-40 mb-4" />
        <Skeleton className="h-11 w-full rounded" />
      </div>
    );
  }

  return (
    <div className="bg-background rounded-xl border border-border p-5 shadow-sm hover:shadow-md transition-shadow">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
        Consultas totales
      </p>
      <p className="font-heading text-[42px] font-bold text-foreground leading-none">
        {totalMessages?.toLocaleString("es") ?? "—"}
      </p>
      <p className="text-[12px] text-muted-foreground mt-1.5">
        {todayMessages ?? 0} hoy · tendencia 7 días
      </p>
      {line && (
        <div className="mt-3">
          <svg
            aria-hidden="true"
            focusable={false}
            viewBox="0 0 300 44"
            className="w-full h-11"
            preserveAspectRatio="none"
          >
            <defs>
              <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="0%"
                  stopColor="hsl(var(--primary))"
                  stopOpacity="0.15"
                />
                <stop
                  offset="100%"
                  stopColor="hsl(var(--primary))"
                  stopOpacity="0"
                />
              </linearGradient>
            </defs>
            <path d={area} fill="url(#sparkGrad)" />
            <path
              d={line}
              fill="none"
              stroke="hsl(var(--primary))"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      )}
    </div>
  );
}

function KpiSmallCard({
  label,
  value,
  sub,
  icon,
  iconBg,
  iconColor,
  loading,
}: {
  label: string;
  value?: number | string;
  sub?: string;
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="bg-background rounded-xl border border-border p-5 shadow-sm">
        <Skeleton className="h-3 w-24 mb-3" />
        <Skeleton className="h-9 w-16 mb-4" />
        <Skeleton className="h-3 w-28" />
      </div>
    );
  }

  return (
    <div className="bg-background rounded-xl border border-border p-5 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            {label}
          </p>
          <p className="font-heading text-[32px] font-bold text-foreground leading-none">
            {value ?? "—"}
          </p>
        </div>
        <div
          className={cn(
            "w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0",
            iconBg,
            iconColor,
          )}
        >
          {icon}
        </div>
      </div>
      {sub && <p className="text-[12px] text-muted-foreground mt-3">{sub}</p>}
    </div>
  );
}

// ── Activity Feed ──────────────────────────────────────────────────────────

const CHANNEL_STYLE: Record<
  string,
  { bg: string; text: string; label: string }
> = {
  web: { bg: "bg-cyan-50", text: "text-cyan-700", label: "Web" },
  whatsapp: { bg: "bg-green-50", text: "text-green-700", label: "WhatsApp" },
};

const MODE_STYLE: Record<
  string,
  {
    bg: string;
    text: string;
    label: string;
    Icon: React.ComponentType<{ className?: string }>;
  }
> = {
  handoff: {
    bg: "bg-amber-50",
    text: "text-amber-700",
    label: "Handoff",
    Icon: Hand,
  },
  human: {
    bg: "bg-amber-50",
    text: "text-amber-700",
    label: "Agente",
    Icon: Hand,
  },
  bot: { bg: "bg-violet-50", text: "text-violet-700", label: "IA", Icon: Bot },
};

const AVATAR_COLORS = [
  { bg: "bg-cyan-50", text: "text-cyan-700" },
  { bg: "bg-violet-50", text: "text-violet-700" },
  { bg: "bg-green-50", text: "text-green-700" },
  { bg: "bg-amber-50", text: "text-amber-700" },
  { bg: "bg-red-50", text: "text-red-600" },
];

function ConvoItem({ convo, idx }: { convo: RecentConversation; idx: number }) {
  const router = useRouter();
  const name = convo.lead?.name ?? null;
  const avatarColor = AVATAR_COLORS[idx % AVATAR_COLORS.length];
  const channel = convo.channel ? CHANNEL_STYLE[convo.channel] : null;
  const mode = convo.mode ? MODE_STYLE[convo.mode] : null;
  const ModeIcon = mode?.Icon;
  const preview = convo.summary ?? convo.last_message ?? "Sin contenido";
  const time = relativeTime(convo.last_message_at ?? convo.created_at);

  return (
    <button
      onClick={() =>
        router.push(`/admin/conversations/${convo.conversation_id}`)
      }
      className="w-full flex items-start gap-3 px-5 py-3.5 border-b border-border last:border-b-0 hover:bg-muted/40 transition-colors text-left"
    >
      <div
        className={cn(
          "w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0",
          avatarColor.bg,
          avatarColor.text,
        )}
      >
        {initials(name)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[13px] font-semibold text-foreground">
            {name ?? "Usuario anónimo"}
          </span>
          <span className="text-[11px] text-muted-foreground whitespace-nowrap flex-shrink-0">
            {time}
          </span>
        </div>
        <p className="text-[12px] text-muted-foreground mt-0.5 truncate">
          {preview}
        </p>
        <div className="flex gap-1.5 mt-1.5">
          {channel && (
            <span
              className={cn(
                "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold",
                channel.bg,
                channel.text,
              )}
            >
              <Zap className="w-2.5 h-2.5" />
              {channel.label}
            </span>
          )}
          {mode && ModeIcon && (
            <span
              className={cn(
                "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold",
                mode.bg,
                mode.text,
              )}
            >
              <ModeIcon className="w-2.5 h-2.5" />
              {mode.label}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

function ActivityFeed({
  convos,
  loading,
}: {
  convos?: RecentConversation[];
  loading: boolean;
}) {
  const router = useRouter();
  return (
    <div className="bg-background rounded-xl border border-border shadow-sm">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <h2 className="font-heading text-[14px] font-bold text-foreground">
          Actividad reciente
        </h2>
        <button
          onClick={() => router.push("/admin/conversations")}
          className="text-[12px] font-medium text-primary hover:text-primary/80 flex items-center gap-1 transition-colors"
        >
          Ver todas <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
      {loading ? (
        <div className="p-5 flex flex-col gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex gap-3">
              <Skeleton className="w-8 h-8 rounded-full flex-shrink-0" />
              <div className="flex-1">
                <Skeleton className="h-3.5 w-32 mb-2" />
                <Skeleton className="h-3 w-full" />
              </div>
            </div>
          ))}
        </div>
      ) : !convos?.length ? (
        <div className="px-5 py-10 text-center text-[13px] text-muted-foreground">
          No hay conversaciones recientes
        </div>
      ) : (
        convos.map((c, i) => (
          <ConvoItem key={c.conversation_id} convo={c} idx={i} />
        ))
      )}
    </div>
  );
}

// ── Quick actions ──────────────────────────────────────────────────────────

const ACTIONS = [
  {
    label: "Subir documentos",
    desc: "Añade PDFs al conocimiento",
    Icon: Upload,
    iconBg: "bg-primary/10",
    iconColor: "text-primary",
    href: "/docs",
  },
  {
    label: "Ver Widget",
    desc: "Previsualiza el chat embebido",
    Icon: Monitor,
    iconBg: "bg-cyan-50",
    iconColor: "text-cyan-700",
    href: "/widget",
  },
  {
    label: "Configurar Bot",
    desc: "Ajusta prompt y modelo IA",
    Icon: Settings2,
    iconBg: "bg-violet-50",
    iconColor: "text-violet-700",
    href: "/admin/settings",
  },
  {
    label: "Exportar datos",
    desc: "Descarga historial de chats",
    Icon: Download,
    iconBg: "bg-amber-50",
    iconColor: "text-amber-700",
    href: "/admin/conversations",
  },
] as const;

function QuickActions() {
  const router = useRouter();
  return (
    <div className="bg-background rounded-xl border border-border shadow-sm">
      <div className="px-5 py-4 border-b border-border">
        <h2 className="font-heading text-[14px] font-bold text-foreground">
          Acciones rápidas
        </h2>
      </div>
      <div className="p-2">
        {ACTIONS.map(({ label, desc, Icon, iconBg, iconColor, href }) => (
          <button
            key={label}
            onClick={() => router.push(href)}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-muted/50 transition-colors text-left"
          >
            <div
              className={cn(
                "w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0",
                iconBg,
                iconColor,
              )}
            >
              <Icon className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold text-foreground">
                {label}
              </p>
              <p className="text-[11px] text-muted-foreground">{desc}</p>
            </div>
            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
          </button>
        ))}
      </div>
    </div>
  );
}

// ── System health ──────────────────────────────────────────────────────────

function SystemHealth({
  botActive,
  pdfsReady,
  modelName,
  handoffs,
  loading,
}: {
  botActive?: boolean;
  pdfsReady?: number;
  modelName?: string | null;
  handoffs?: number;
  loading: boolean;
}) {
  const rows = [
    {
      label: "Bot RAG",
      value: (
        <span
          className={cn(
            "flex items-center gap-1.5 text-[12px] font-semibold",
            botActive ? "text-green-600" : "text-red-500",
          )}
        >
          <span
            className={cn(
              "w-1.5 h-1.5 rounded-full",
              botActive ? "bg-green-500" : "bg-red-500",
            )}
          />
          {botActive ? "Activo" : "Inactivo"}
        </span>
      ),
    },
    {
      label: "Documentos",
      value: (
        <span className="text-[12px] font-semibold text-foreground font-mono">
          {pdfsReady ?? "—"} docs
        </span>
      ),
    },
    {
      label: "Modelo IA",
      value: (
        <span className="text-[11px] font-semibold text-violet-700 font-mono">
          {modelName ?? "—"}
        </span>
      ),
    },
    {
      label: "Handoffs",
      value: handoffs ? (
        <span className="flex items-center gap-1.5 text-[12px] font-semibold text-amber-600">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
          {handoffs} esperando
        </span>
      ) : (
        <span className="text-[12px] text-muted-foreground">
          Sin pendientes
        </span>
      ),
    },
  ];

  return (
    <div className="bg-background rounded-xl border border-border shadow-sm">
      <div className="px-5 py-4 border-b border-border">
        <h2 className="font-heading text-[14px] font-bold text-foreground">
          Estado del sistema
        </h2>
      </div>
      {loading ? (
        <div className="p-5 flex flex-col gap-3.5">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex justify-between items-center">
              <Skeleton className="h-3.5 w-24" />
              <Skeleton className="h-3.5 w-16" />
            </div>
          ))}
        </div>
      ) : (
        rows.map(({ label, value }) => (
          <div
            key={label}
            className="flex items-center justify-between px-5 py-3 border-b border-border last:border-b-0"
          >
            <span className="text-[13px] text-muted-foreground font-medium">
              {label}
            </span>
            {value}
          </div>
        ))
      )}
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function HomeClient() {
  const router = useRouter();
  const { user } = useAuth();
  const { data: botState } = useBotState();
  const {
    data: overview,
    isLoading: overviewLoading,
    error: overviewError,
  } = useOverview();
  const { data: history } = useStatsHistory(7);
  const { data: handoffs, isLoading: handoffsLoading } = useHandoffStats();
  const { data: convos, isLoading: convosLoading } = useRecentConversations(6);
  const { data: runtime, isLoading: runtimeLoading } = useHomeBotRuntime();

  return (
    <div className="flex flex-col gap-5">
      {overviewError && (
        <div className="text-[12px] text-destructive bg-destructive/10 px-4 py-2 rounded-lg border border-destructive/20">
          No se pudo cargar el resumen. Intenta recargar la página.
        </div>
      )}
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="font-heading text-[22px] font-bold text-foreground">
              {getGreeting()}, {user?.username ?? "Admin"} 👋
            </h1>
            <StatusPill active={botState?.is_active} />
          </div>
          <p className="text-[12px] text-muted-foreground mt-0.5 capitalize">
            {formatDate()}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push("/admin/settings")}
          >
            <Settings className="w-3.5 h-3.5" />
            Configuración
          </Button>
          <Button size="sm" onClick={() => router.push("/docs")}>
            <Upload className="w-3.5 h-3.5" />
            Subir PDF
          </Button>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-[2fr_1fr_1fr_1fr] gap-3.5">
        <KpiHeroCard
          totalMessages={overview?.total_messages}
          todayMessages={overview?.today_messages}
          historyData={history?.data}
          loading={overviewLoading}
        />
        <KpiSmallCard
          label="Conversaciones hoy"
          value={overview?.today_conversations}
          sub={`${overview?.total_conversations ?? 0} totales`}
          icon={<Users className="w-4 h-4" />}
          iconBg="bg-cyan-50"
          iconColor="text-cyan-700"
          loading={overviewLoading}
        />
        <KpiSmallCard
          label="Handoffs"
          value={handoffs?.total}
          sub={`${handoffs?.low_confidence ?? 0} baja confianza`}
          icon={<Hand className="w-4 h-4" />}
          iconBg="bg-amber-50"
          iconColor="text-amber-700"
          loading={handoffsLoading}
        />
        <KpiSmallCard
          label="Documentos"
          value={overview?.pdfs_ready}
          sub={`${overview?.leads_this_week ?? 0} leads esta semana`}
          icon={<FileText className="w-4 h-4" />}
          iconBg="bg-violet-50"
          iconColor="text-violet-700"
          loading={overviewLoading}
        />
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-[1fr_320px] gap-3.5 items-start">
        <ActivityFeed convos={convos} loading={convosLoading} />
        <div className="flex flex-col gap-3.5">
          <QuickActions />
          <SystemHealth
            botActive={botState?.is_active}
            pdfsReady={overview?.pdfs_ready}
            modelName={runtime?.model_name}
            handoffs={handoffs?.total}
            loading={overviewLoading || runtimeLoading}
          />
        </div>
      </div>
    </div>
  );
}
