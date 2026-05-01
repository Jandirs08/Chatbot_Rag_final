"use client";

import React, {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import useSWR from "swr";
import { useRequireAdmin } from "@/app/hooks/useAuthGuard";
import { useAuth } from "@/app/hooks/useAuth";
import { useToast } from "@/app/hooks/use-toast";
import { API_URL } from "@/app/lib/config";
import { authenticatedJsonFetcher } from "@/app/lib/services/authService";
import * as inboxService from "@/app/lib/services/inboxService";
import { Button } from "@/app/components/ui/button";
import { cn } from "@/lib/utils";
import { RefreshCw } from "lucide-react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { InboxConversationCard } from "./_components/InboxConversationCard";
import { LeadSheet } from "./_components/LeadSheet";
import type { InboxConversation } from "./_components/InboxConversationCard";

type InboxListResponse = {
  items: InboxConversation[];
  total: number;
};

const EMPTY_LIST: InboxConversation[] = [];

// ─── Tab + channel definitions ────────────────────────────────────────────────

type TabKey = "todos" | "pendientes" | "mias" | "bot";
type ChannelKey = "todos" | "web" | "whatsapp";
type DatosKey = "todos" | "leads" | "sin_datos";

const TABS: { key: TabKey; label: string }[] = [
  { key: "todos", label: "Todos" },
  { key: "pendientes", label: "Pendientes" },
  { key: "mias", label: "Mis activas" },
  { key: "bot", label: "Bot" },
];

const CHANNELS: { key: ChannelKey; label: string }[] = [
  { key: "todos", label: "Todos" },
  { key: "web", label: "Web" },
  { key: "whatsapp", label: "WhatsApp" },
];

const DATOS: { key: DatosKey; label: string }[] = [
  { key: "todos", label: "Todos" },
  { key: "leads", label: "Con datos" },
  { key: "sin_datos", label: "Sin datos" },
];

const isTabKey = (v: string | null): v is TabKey =>
  v === "todos" || v === "pendientes" || v === "mias" || v === "bot";

const isChannelKey = (v: string | null): v is ChannelKey =>
  v === "todos" || v === "web" || v === "whatsapp";

const isDatosKey = (v: string | null): v is DatosKey =>
  v === "todos" || v === "leads" || v === "sin_datos";

// ─── Column definitions ────────────────────────────────────────────────────────

type KanbanColumnDef = {
  key: string | null;
  label: string;
  headerBg: string;
  headerText: string;
  colBg: string;
  dotClass: string;
  emptyLabel: string;
};

// Sentinel keys: `null` => "Sin clasificar", "__completed__" => "Completado".
// The completed column is special — convs with stage="completed" land here,
// regardless of their AI category.
const COMPLETED_KEY = "__completed__";

const COLUMNS: KanbanColumnDef[] = [
  {
    key: null,
    label: "Sin clasificar",
    headerBg: "bg-slate-200 dark:bg-slate-800",
    headerText: "text-slate-700 dark:text-slate-200",
    colBg: "bg-slate-50/90 dark:bg-slate-900/30",
    dotClass: "bg-slate-400",
    emptyLabel: "Sin conversaciones",
  },
  {
    key: "interes",
    label: "Interés",
    headerBg: "bg-sky-500 dark:bg-sky-700",
    headerText: "text-white",
    colBg: "bg-sky-50/70 dark:bg-sky-950/20",
    dotClass: "bg-sky-500",
    emptyLabel: "Sin leads de interés",
  },
  {
    key: "oportunidad",
    label: "Oportunidad",
    headerBg: "bg-emerald-600 dark:bg-emerald-700",
    headerText: "text-white",
    colBg: "bg-emerald-50/70 dark:bg-emerald-950/20",
    dotClass: "bg-emerald-500",
    emptyLabel: "Sin oportunidades",
  },
  {
    key: "requiere_atencion",
    label: "Requiere Atención",
    headerBg: "bg-amber-500 dark:bg-amber-700",
    headerText: "text-white",
    colBg: "bg-amber-50/70 dark:bg-amber-950/20",
    dotClass: "bg-amber-500",
    emptyLabel: "Sin conversaciones urgentes",
  },
  {
    key: "sin_interes",
    label: "Sin Interés",
    headerBg: "bg-slate-400 dark:bg-slate-700",
    headerText: "text-white",
    colBg: "bg-slate-50/50 dark:bg-slate-900/15",
    dotClass: "bg-slate-400",
    emptyLabel: "Sin descartados",
  },
  {
    key: COMPLETED_KEY,
    label: "Completado",
    headerBg: "bg-violet-600 dark:bg-violet-700",
    headerText: "text-white",
    colBg: "bg-violet-50/70 dark:bg-violet-950/20",
    dotClass: "bg-violet-500",
    emptyLabel: "Sin conversaciones completadas",
  },
];

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="w-full animate-pulse rounded-xl border border-border/40 bg-white p-3 dark:bg-card">
      <div className="flex items-center gap-2">
        <div className="h-8 w-8 flex-none rounded-lg bg-muted/60" />
        <div className="flex-1 space-y-1.5">
          <div className="h-2.5 w-3/4 rounded bg-muted/60" />
          <div className="h-2 w-1/2 rounded bg-muted/40" />
        </div>
        <div className="h-6 w-8 flex-none rounded-md bg-muted/40" />
      </div>
      <div className="mt-2 h-1 w-full rounded-full bg-muted/30" />
      <div className="mt-2 flex gap-1">
        <div className="h-3 w-3 rounded-full bg-muted/50" />
        <div className="h-3 w-14 rounded bg-muted/40" />
      </div>
    </div>
  );
}

// ─── Stat tile (contextual cards above kanban) ────────────────────────────────

interface StatTileProps {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "warn" | "success";
}

function StatTile({ label, value, hint, tone = "default" }: StatTileProps) {
  const valueClass =
    tone === "warn"
      ? "text-amber-700 dark:text-amber-400"
      : tone === "success"
        ? "text-emerald-700 dark:text-emerald-400"
        : "text-foreground";
  return (
    <div className="flex min-w-[140px] flex-1 flex-col justify-center rounded-xl border border-border/60 bg-white px-3.5 py-2.5 transition-all duration-150 hover:border-primary/20 hover:shadow-[0_4px_20px_rgb(79_53_204/0.08)] dark:bg-card">
      <span className="font-heading text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground/70">
        {label}
      </span>
      <span
        className={cn(
          "mt-1 font-mono text-lg font-bold leading-tight tabular-nums",
          valueClass,
        )}
      >
        {value}
      </span>
      {hint && (
        <span className="mt-0.5 text-[10px] text-muted-foreground/60">
          {hint}
        </span>
      )}
    </div>
  );
}

// ─── Contextual stats per tab ─────────────────────────────────────────────────

function ContextualStats({
  tab,
  conversations,
  agentId,
}: {
  tab: TabKey;
  conversations: InboxConversation[];
  agentId: string;
}) {
  const tiles = useMemo<StatTileProps[]>(() => {
    if (tab === "todos") {
      const total = conversations.length;
      const scored = conversations.filter((c) => c.lead_score != null);
      const avg =
        scored.length > 0
          ? Math.round(
              scored.reduce((acc, c) => acc + (c.lead_score ?? 0), 0) /
                scored.length,
            )
          : null;
      const lastUpdate = conversations
        .map((c) => c.updated_at)
        .filter((v): v is string => Boolean(v))
        .sort()
        .at(-1);
      const lastLabel = lastUpdate
        ? new Date(lastUpdate).toLocaleTimeString("es-PE", {
            hour: "numeric",
            minute: "2-digit",
          })
        : "—";
      return [
        { label: "Leads activos", value: String(total) },
        {
          label: "Score promedio",
          value: avg != null ? String(avg) : "—",
          hint: scored.length > 0 ? `${scored.length} con score` : undefined,
        },
        { label: "Última actualización", value: lastLabel },
      ];
    }

    if (tab === "pendientes") {
      const pending = conversations.filter((c) => c.mode === "pending");
      const waiting = pending
        .map((c) => c.minutes_waiting)
        .filter((v): v is number => v != null);
      const avg =
        waiting.length > 0
          ? Math.round(waiting.reduce((a, b) => a + b, 0) / waiting.length)
          : null;
      const max = waiting.length > 0 ? Math.max(...waiting) : null;
      return [
        {
          label: "Esperando ahora",
          value: String(pending.length),
          tone: pending.length > 0 ? "warn" : "default",
        },
        {
          label: "Espera promedio",
          value: avg != null ? `${avg}m` : "—",
        },
        {
          label: "Más antiguo",
          value: max != null ? `${max}m` : "—",
          tone: max != null && max >= 10 ? "warn" : "default",
        },
      ];
    }

    if (tab === "mias") {
      const mine = conversations.filter(
        (c) => c.mode === "human" && c.assigned_agent_id === agentId,
      );
      const stale = mine.filter((c) => {
        if (!c.updated_at) return false;
        const ageMin = (Date.now() - new Date(c.updated_at).getTime()) / 60000;
        return ageMin > 5;
      });
      const scored = mine.filter((c) => c.lead_score != null);
      const avg =
        scored.length > 0
          ? Math.round(
              scored.reduce((acc, c) => acc + (c.lead_score ?? 0), 0) /
                scored.length,
            )
          : null;
      return [
        {
          label: "Tus conversaciones",
          value: String(mine.length),
        },
        {
          label: "Sin responder >5m",
          value: String(stale.length),
          tone: stale.length > 0 ? "warn" : "default",
        },
        {
          label: "Score promedio",
          value: avg != null ? String(avg) : "—",
        },
      ];
    }

    // bot
    const bot = conversations.filter((c) => c.mode === "bot");
    const unclassified = bot.filter(
      (c) => !c.category || c.category === "__null__",
    );
    const productCounts = new Map<string, number>();
    for (const c of bot) {
      for (const p of c.product_interests ?? []) {
        productCounts.set(p, (productCounts.get(p) ?? 0) + 1);
      }
    }
    const entries = Array.from(productCounts.entries());
    const top = entries.sort((a, b) => b[1] - a[1])[0];
    return [
      { label: "Total bot", value: String(bot.length) },
      {
        label: "Sin clasificar",
        value: String(unclassified.length),
        tone: unclassified.length > 0 ? "warn" : "default",
      },
      {
        label: "Producto top",
        value: top ? top[0] : "—",
        hint: top ? `${top[1]} menciones` : undefined,
      },
    ];
  }, [tab, conversations, agentId]);

  return (
    <div
      key={tab}
      className="grid grid-cols-1 gap-2 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1 motion-safe:duration-200 sm:grid-cols-3"
    >
      {tiles.map((t) => (
        <StatTile key={t.label} {...t} />
      ))}
    </div>
  );
}

// ─── Tabs strip ───────────────────────────────────────────────────────────────

interface TabsStripProps {
  active: TabKey;
  counts: Record<TabKey, number>;
  onChange: (key: TabKey) => void;
}

function TabsStrip({ active, counts, onChange }: TabsStripProps) {
  return (
    <div
      role="tablist"
      aria-label="Filtro por estado"
      className="inline-flex items-center gap-1 rounded-xl border border-border/60 bg-white p-1 dark:bg-card"
    >
      {TABS.map((t) => {
        const isActive = active === t.key;
        const count = counts[t.key];
        return (
          <button
            key={t.key}
            role="tab"
            type="button"
            aria-selected={isActive}
            onClick={() => onChange(t.key)}
            className={cn(
              "inline-flex items-center gap-2 rounded-lg px-3 py-1.5 font-heading text-[12px] font-semibold leading-none",
              "transition-[background-color,color,box-shadow] duration-150 ease-out",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
              isActive
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-primary/[0.06] hover:text-foreground",
            )}
          >
            <span>{t.label}</span>
            <span
              className={cn(
                "rounded-full px-1.5 font-mono text-[10px] font-bold tabular-nums",
                isActive
                  ? "bg-white/20 text-primary-foreground"
                  : "bg-muted text-muted-foreground",
              )}
            >
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ─── Channel chips ────────────────────────────────────────────────────────────

interface ChannelChipsProps {
  active: ChannelKey;
  onChange: (key: ChannelKey) => void;
}

function ChannelChips({ active, onChange }: ChannelChipsProps) {
  return (
    <div
      role="tablist"
      aria-label="Filtro por canal"
      className="inline-flex items-center gap-1"
    >
      <span className="font-heading text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground/60">
        Canal
      </span>
      <div className="ml-1 inline-flex items-center gap-0.5">
        {CHANNELS.map((c) => {
          const isActive = active === c.key;
          return (
            <button
              key={c.key}
              role="tab"
              type="button"
              aria-selected={isActive}
              onClick={() => onChange(c.key)}
              className={cn(
                "rounded-full border px-2.5 py-1 font-heading text-[11px] font-semibold leading-none",
                "transition-[background-color,color,border-color] duration-150 ease-out",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                isActive
                  ? "border-primary/30 bg-primary/[0.08] text-primary"
                  : "border-transparent text-muted-foreground hover:bg-muted",
              )}
            >
              {c.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Data chips (lead captured / anonymous) ───────────────────────────────────

interface DataChipsProps {
  active: DatosKey;
  onChange: (key: DatosKey) => void;
}

function DataChips({ active, onChange }: DataChipsProps) {
  return (
    <div
      role="tablist"
      aria-label="Filtro por datos del lead"
      className="inline-flex items-center gap-1"
    >
      <span className="font-heading text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground/60">
        Datos
      </span>
      <div className="ml-1 inline-flex items-center gap-0.5">
        {DATOS.map((d) => {
          const isActive = active === d.key;
          return (
            <button
              key={d.key}
              role="tab"
              type="button"
              aria-selected={isActive}
              onClick={() => onChange(d.key)}
              className={cn(
                "rounded-full border px-2.5 py-1 font-heading text-[11px] font-semibold leading-none",
                "transition-[background-color,color,border-color] duration-150 ease-out",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                isActive
                  ? "border-primary/30 bg-primary/[0.08] text-primary"
                  : "border-transparent text-muted-foreground hover:bg-muted",
              )}
            >
              {d.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Kanban column ────────────────────────────────────────────────────────────

interface KanbanColumnProps {
  col: KanbanColumnDef;
  conversations: InboxConversation[];
  loading: boolean;
  selectedId: string | null;
  mutatingId: string | null;
  agentId: string;
  onSelect: (id: string) => void;
  onTakeover: (id: string) => void;
  onRelease: (id: string) => void;
  // Drag-drop coordination from parent
  isDragActive: boolean;
  draggedFromCompleted: boolean;
}

function KanbanColumn({
  col,
  conversations,
  loading,
  selectedId,
  mutatingId,
  agentId,
  onSelect,
  onTakeover,
  onRelease,
  isDragActive,
  draggedFromCompleted,
}: KanbanColumnProps) {
  const colKey = col.key ?? "__null__";
  const isCompletedCol = col.key === COMPLETED_KEY;
  // Drop target accepts:
  //  - dragged from AI category → Completed column
  //  - dragged from Completed → any AI category column
  const canAcceptDrop = isDragActive
    ? draggedFromCompleted
      ? !isCompletedCol
      : isCompletedCol
    : false;
  const { setNodeRef, isOver } = useDroppable({
    id: `col-${colKey}`,
    data: { columnKey: col.key },
    disabled: !canAcceptDrop,
  });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex min-w-[200px] flex-1 flex-col overflow-hidden rounded-xl border transition-[border-color,background-color] duration-200 ease-out",
        col.colBg,
        canAcceptDrop && isOver
          ? "border-dashed border-violet-500/70 bg-violet-50/90 dark:bg-violet-950/40"
          : canAcceptDrop
            ? "border-dashed border-violet-400/40"
            : "border-black/[0.06] dark:border-white/[0.06]",
      )}
    >
      <div
        className={cn(
          "flex flex-none items-center justify-between px-3 py-2.5",
          col.headerBg,
          col.headerText,
        )}
      >
        <span className="font-heading text-[10px] font-semibold uppercase tracking-[0.14em]">
          {col.label}
        </span>
        <span className="font-mono text-lg font-bold leading-none">
          {conversations.length}
        </span>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto p-2">
        {loading && conversations.length === 0 ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : conversations.length === 0 ? (
          <div className="flex min-h-[120px] flex-col items-center justify-center rounded-xl border border-dashed border-black/10 px-3 py-6 text-center dark:border-white/10">
            <p className="text-[11px] font-medium text-muted-foreground/50">
              {col.emptyLabel}
            </p>
          </div>
        ) : (
          conversations.map((c) => (
            <InboxConversationCard
              key={c.conversation_id}
              conversation={c}
              isActive={selectedId === c.conversation_id}
              isMutating={mutatingId === c.conversation_id}
              agentId={agentId}
              onSelect={onSelect}
              onTakeover={onTakeover}
              onRelease={onRelease}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ─── Mobile column tab bar ────────────────────────────────────────────────────

interface MobileColumnTabsProps {
  columns: KanbanColumnDef[];
  counts: Record<string, number>;
  activeKey: string;
  onChange: (key: string) => void;
}

function MobileColumnTabs({
  columns,
  counts,
  activeKey,
  onChange,
}: MobileColumnTabsProps) {
  return (
    <div
      className="flex gap-1.5 overflow-x-auto pb-0.5 md:hidden"
      style={{ scrollbarWidth: "none" }}
    >
      {columns.map((col) => {
        const key = col.key ?? "__null__";
        const isActive = key === activeKey;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            className={cn(
              "flex flex-none items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 font-heading text-[11px] font-semibold transition-all duration-150",
              isActive
                ? cn(col.headerBg, col.headerText, "border-transparent shadow-sm")
                : "border-border/50 bg-background text-muted-foreground hover:bg-muted",
            )}
          >
            <span
              className={cn(
                "h-1.5 w-1.5 flex-none rounded-full",
                col.dotClass,
              )}
            />
            {col.label}
            <span
              className={cn(
                "rounded-full px-1.5 font-mono text-[9px] font-bold",
                isActive
                  ? "bg-black/20 text-white"
                  : "bg-muted text-muted-foreground",
              )}
            >
              {counts[key] ?? 0}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ─── Empty state for filtered tab ─────────────────────────────────────────────

function FilteredEmptyState({
  tab,
  datos,
}: {
  tab: TabKey;
  datos: DatosKey;
}) {
  // Datos filter takes precedence — it's a more specific signal than tab
  if (datos === "sin_datos") {
    return (
      <div className="flex h-full min-h-[280px] flex-col items-center justify-center gap-2 px-6 text-center motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200">
        <p className="font-heading text-[14px] font-semibold text-foreground">
          No hay conversaciones anónimas
        </p>
        <p className="max-w-[300px] text-[12px] text-muted-foreground">
          Todos los visitantes activos ya compartieron sus datos.
        </p>
      </div>
    );
  }
  if (datos === "leads") {
    return (
      <div className="flex h-full min-h-[280px] flex-col items-center justify-center gap-2 px-6 text-center motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200">
        <p className="font-heading text-[14px] font-semibold text-foreground">
          Sin leads capturados
        </p>
        <p className="max-w-[300px] text-[12px] text-muted-foreground">
          Aún no hay conversaciones con datos del lead en este filtro.
        </p>
      </div>
    );
  }

  const messages: Record<TabKey, { title: string; hint: string }> = {
    todos: {
      title: "Sin conversaciones",
      hint: "Cuando lleguen mensajes nuevos aparecerán aquí.",
    },
    pendientes: {
      title: "Nadie esperando",
      hint: "El bot está manejando todas las conversaciones por ahora.",
    },
    mias: {
      title: "No tienes conversaciones activas",
      hint: "Cuando tomes una conversación, aparecerá aquí.",
    },
    bot: {
      title: "Sin tráfico del bot",
      hint: "El bot no tiene conversaciones activas en este momento.",
    },
  };
  const m = messages[tab];
  return (
    <div className="flex h-full min-h-[280px] flex-col items-center justify-center gap-2 px-6 text-center motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200">
      <p className="font-heading text-[14px] font-semibold text-foreground">
        {m.title}
      </p>
      <p className="max-w-[280px] text-[12px] text-muted-foreground">
        {m.hint}
      </p>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function InboxContent() {
  const { isAuthorized } = useRequireAdmin();
  const { user } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const agentId = user?.id ?? "";

  // ─ URL-driven state
  const tabParam = searchParams.get("tab");
  const channelParam = searchParams.get("canal");
  const datosParam = searchParams.get("datos");
  const activeTab: TabKey = isTabKey(tabParam) ? tabParam : "todos";
  const activeChannel: ChannelKey = isChannelKey(channelParam)
    ? channelParam
    : "todos";
  const activeDatos: DatosKey = isDatosKey(datosParam) ? datosParam : "todos";

  const updateParams = useCallback(
    (next: { tab?: TabKey; canal?: ChannelKey; datos?: DatosKey }) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next.tab !== undefined) {
        if (next.tab === "todos") params.delete("tab");
        else params.set("tab", next.tab);
      }
      if (next.canal !== undefined) {
        if (next.canal === "todos") params.delete("canal");
        else params.set("canal", next.canal);
      }
      if (next.datos !== undefined) {
        if (next.datos === "todos") params.delete("datos");
        else params.set("datos", next.datos);
      }
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  const setActiveTab = useCallback(
    (tab: TabKey) => updateParams({ tab }),
    [updateParams],
  );
  const setActiveChannel = useCallback(
    (canal: ChannelKey) => updateParams({ canal }),
    [updateParams],
  );
  const setActiveDatos = useCallback(
    (datos: DatosKey) => updateParams({ datos }),
    [updateParams],
  );

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [mutatingId, setMutatingId] = useState<string | null>(null);
  const [mobileColumnKey, setMobileColumnKey] = useState<string>("__null__");

  const {
    data: listData,
    isLoading: loadingList,
    mutate: refreshList,
  } = useSWR<InboxListResponse>(
    isAuthorized ? `${API_URL}/conversations/inbox` : null,
    authenticatedJsonFetcher,
    { refreshInterval: 5000, revalidateOnFocus: true },
  );

  const conversations = listData?.items ?? EMPTY_LIST;

  // ─ Apply filters (tab + channel + datos) before kanban grouping
  const filteredConversations = useMemo(() => {
    return conversations.filter((c) => {
      // Channel filter
      if (activeChannel !== "todos") {
        if ((c.channel ?? "").toLowerCase() !== activeChannel) return false;
      }
      // Datos filter (lead captured vs anonymous)
      if (activeDatos === "leads" && !c.lead_email) return false;
      if (activeDatos === "sin_datos" && c.lead_email) return false;
      // Tab filter
      if (activeTab === "pendientes") return c.mode === "pending";
      if (activeTab === "mias")
        return c.mode === "human" && c.assigned_agent_id === agentId;
      if (activeTab === "bot") return c.mode === "bot";
      return true;
    });
  }, [conversations, activeTab, activeChannel, activeDatos, agentId]);

  // Tab counts use channel + datos filters so the chips don't lie about distribution
  const tabCounts: Record<TabKey, number> = useMemo(() => {
    const preFiltered = conversations.filter((c) => {
      if (activeChannel !== "todos") {
        if ((c.channel ?? "").toLowerCase() !== activeChannel) return false;
      }
      if (activeDatos === "leads" && !c.lead_email) return false;
      if (activeDatos === "sin_datos" && c.lead_email) return false;
      return true;
    });
    return {
      todos: preFiltered.length,
      pendientes: preFiltered.filter((c) => c.mode === "pending").length,
      mias: preFiltered.filter(
        (c) => c.mode === "human" && c.assigned_agent_id === agentId,
      ).length,
      bot: preFiltered.filter((c) => c.mode === "bot").length,
    };
  }, [conversations, activeChannel, activeDatos, agentId]);

  const totalFiltered = filteredConversations.length;

  const selectedConversation = useMemo(
    () =>
      conversations.find((c) => c.conversation_id === selectedId) ?? null,
    [conversations, selectedId],
  );

  const columnedConversations = useMemo(() => {
    const map: Record<string, InboxConversation[]> = {};
    for (const col of COLUMNS) {
      map[col.key ?? "__null__"] = [];
    }
    for (const c of filteredConversations) {
      // stage="completed" wins over AI category — lands in dedicated column
      if (c.stage === "completed") {
        map[COMPLETED_KEY].push(c);
        continue;
      }
      const key = c.category ?? "__null__";
      if (key in map) {
        map[key].push(c);
      } else {
        map["__null__"].push(c);
      }
    }
    return map;
  }, [filteredConversations]);

  const columnCounts = useMemo(() => {
    const out: Record<string, number> = {};
    for (const [k, arr] of Object.entries(columnedConversations)) {
      out[k] = arr.length;
    }
    return out;
  }, [columnedConversations]);

  const allColumnsEmpty = totalFiltered === 0 && !loadingList;

  const handleSelect = useCallback((id: string) => {
    setSelectedId(id);
    setSheetOpen(true);
  }, []);

  const handleSheetClose = useCallback((open: boolean) => {
    setSheetOpen(open);
    if (!open) setSelectedId(null);
  }, []);

  const handleTakeover = async (conversationId: string) => {
    if (!agentId) return;
    setMutatingId(conversationId);
    try {
      await inboxService.takeover(conversationId);
      await refreshList();
    } catch {
      toast({
        title: "Error",
        description: "No se pudo tomar la conversación.",
        variant: "destructive",
      });
    } finally {
      setMutatingId(null);
    }
  };

  const handleRelease = async (conversationId: string) => {
    if (!agentId) return;
    setMutatingId(conversationId);
    try {
      await inboxService.release(conversationId);
      await refreshList();
      setSheetOpen(false);
      setSelectedId(null);
    } catch {
      toast({
        title: "Error",
        description: "No se pudo liberar la conversación.",
        variant: "destructive",
      });
    } finally {
      setMutatingId(null);
    }
  };

  const handleConversationUpdate = useCallback(
    (updated: InboxConversation) => {
      refreshList(
        (prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            items: prev.items.map((c) =>
              c.conversation_id === updated.conversation_id
                ? { ...c, ...updated }
                : c,
            ),
          };
        },
        { revalidate: false },
      );
    },
    [refreshList],
  );

  // Reset mobile column tab when filters change so the user lands on a non-empty col
  useEffect(() => {
    const firstNonEmpty = COLUMNS.find(
      (c) => (columnedConversations[c.key ?? "__null__"]?.length ?? 0) > 0,
    );
    if (firstNonEmpty) {
      const key = firstNonEmpty.key ?? "__null__";
      setMobileColumnKey((prev) =>
        (columnedConversations[prev]?.length ?? 0) > 0 ? prev : key,
      );
    }
  }, [columnedConversations]);

  // ─ Drag-drop state
  const [draggedConv, setDraggedConv] = useState<InboxConversation | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor),
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const conv = event.active.data.current?.conversation as
      | InboxConversation
      | undefined;
    if (conv) setDraggedConv(conv);
  }, []);

  const handleDragCancel = useCallback(() => {
    setDraggedConv(null);
  }, []);

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const conv = event.active.data.current?.conversation as
        | InboxConversation
        | undefined;
      const targetKey = event.over?.data.current?.columnKey as
        | string
        | null
        | undefined;
      setDraggedConv(null);
      if (!conv || targetKey === undefined) return;

      const fromCompleted = conv.stage === "completed";
      const toCompleted = targetKey === COMPLETED_KEY;
      // No-op: same column or disallowed (AI ↔ AI)
      if (fromCompleted === toCompleted) return;

      const id = conv.conversation_id;
      const action = toCompleted ? "complete" : "reopen";

      // Optimistic update — flip stage immediately
      const optimisticPatch: Partial<InboxConversation> = toCompleted
        ? { stage: "completed", completed_at: new Date().toISOString() }
        : { stage: "active", completed_at: null };

      refreshList(
        (prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            items: prev.items.map((c) =>
              c.conversation_id === id ? { ...c, ...optimisticPatch } : c,
            ),
          };
        },
        { revalidate: false },
      );

      try {
        const updated =
          action === "complete"
            ? await inboxService.complete(id)
            : await inboxService.reopen(id);
        // Reconcile with server truth
        refreshList(
          (prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              items: prev.items.map((c) =>
                c.conversation_id === id ? { ...c, ...updated } : c,
              ),
            };
          },
          { revalidate: false },
        );
        toast({
          title: toCompleted ? "Marcada como completada" : "Reabierta",
        });
      } catch {
        // Revert
        await refreshList();
        toast({
          title: "Error",
          description: toCompleted
            ? "No se pudo completar la conversación."
            : "No se pudo reabrir la conversación.",
          variant: "destructive",
        });
      }
    },
    [refreshList, toast],
  );

  const draggedFromCompleted = draggedConv?.stage === "completed";

  if (!isAuthorized) return null;

  return (
    <>
      <div className="flex h-[calc(100vh-4rem)] min-h-[640px] flex-col overflow-hidden rounded-2xl border border-border/60 bg-card shadow-md">
        {/* ── Top bar ── */}
        <div className="flex-none border-b border-border/60 bg-card px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="font-heading text-xl font-bold leading-tight tracking-tight text-foreground">
                Inbox
              </h1>
              <p className="mt-0.5 text-[12px] text-muted-foreground">
                <span className="font-mono font-semibold text-foreground">
                  {totalFiltered}
                </span>{" "}
                {totalFiltered === 1
                  ? "conversación visible"
                  : "conversaciones visibles"}
              </p>
            </div>
            <div className="flex flex-none items-center gap-2">
              <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[11px] font-semibold text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-400">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                En vivo
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => refreshList()}
                className="h-9 rounded-xl border-border/60 px-3"
                aria-label="Actualizar"
              >
                <RefreshCw
                  className={cn("h-3.5 w-3.5", loadingList && "animate-spin")}
                />
              </Button>
            </div>
          </div>

          {/* Filters: channel chips + datos chips + tabs */}
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-3">
            <ChannelChips active={activeChannel} onChange={setActiveChannel} />
            <span
              aria-hidden="true"
              className="hidden h-4 w-px bg-border/60 sm:inline-block"
            />
            <DataChips active={activeDatos} onChange={setActiveDatos} />
            <div className="flex-1" />
            <TabsStrip
              active={activeTab}
              counts={tabCounts}
              onChange={setActiveTab}
            />
          </div>

          {/* Contextual stats per tab */}
          <div className="mt-4">
            <ContextualStats
              tab={activeTab}
              conversations={filteredConversations}
              agentId={agentId}
            />
          </div>

          {/* Mobile column tabs */}
          <div className="mt-4">
            <MobileColumnTabs
              columns={COLUMNS}
              counts={columnCounts}
              activeKey={mobileColumnKey}
              onChange={setMobileColumnKey}
            />
          </div>
        </div>

        {/* ── Board ── */}
        <DndContext
          sensors={sensors}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
        >
          <div className="flex min-h-0 flex-1 overflow-hidden bg-[#f4f3fb] dark:bg-[#0e0d1a]">
            {allColumnsEmpty ? (
              <FilteredEmptyState tab={activeTab} datos={activeDatos} />
            ) : (
              <>
                {/* Desktop: all 6 columns */}
                <div className="hidden min-h-0 flex-1 overflow-x-auto overflow-y-hidden md:flex">
                  <div className="flex h-full min-w-max gap-3 p-4">
                    {COLUMNS.map((col) => {
                      const key = col.key ?? "__null__";
                      return (
                        <KanbanColumn
                          key={key}
                          col={col}
                          conversations={columnedConversations[key] ?? []}
                          loading={loadingList}
                          selectedId={selectedId}
                          mutatingId={mutatingId}
                          agentId={agentId}
                          onSelect={handleSelect}
                          onTakeover={handleTakeover}
                          onRelease={handleRelease}
                          isDragActive={draggedConv != null}
                          draggedFromCompleted={draggedFromCompleted}
                        />
                      );
                    })}
                  </div>
                </div>

                {/* Mobile: single active column */}
                <div className="flex min-h-0 w-full flex-col overflow-y-auto p-3 md:hidden">
                  {(() => {
                    const col = COLUMNS.find(
                      (c) => (c.key ?? "__null__") === mobileColumnKey,
                    );
                    if (!col) return null;
                    const key = col.key ?? "__null__";
                    const colConvs = columnedConversations[key] ?? [];
                    return (
                      <div className="flex flex-col gap-2">
                        {loadingList && colConvs.length === 0 ? (
                          <>
                            <SkeletonCard />
                            <SkeletonCard />
                          </>
                        ) : colConvs.length === 0 ? (
                          <div className="flex min-h-[160px] items-center justify-center rounded-xl border border-dashed border-border/60 bg-background px-4 text-center">
                            <p className="text-[12px] text-muted-foreground/50">
                              {col.emptyLabel}
                            </p>
                          </div>
                        ) : (
                          colConvs.map((c) => (
                            <InboxConversationCard
                              key={c.conversation_id}
                              conversation={c}
                              isActive={selectedId === c.conversation_id}
                              isMutating={mutatingId === c.conversation_id}
                              agentId={agentId}
                              onSelect={handleSelect}
                              onTakeover={handleTakeover}
                              onRelease={handleRelease}
                            />
                          ))
                        )}
                      </div>
                    );
                  })()}
                </div>
              </>
            )}
          </div>
          <DragOverlay dropAnimation={{ duration: 200, easing: "cubic-bezier(0.22, 1, 0.36, 1)" }}>
            {draggedConv ? (
              <div className="pointer-events-none rotate-1 opacity-95 shadow-2xl">
                <InboxConversationCard
                  conversation={draggedConv}
                  isActive={false}
                  isMutating={false}
                  agentId={agentId}
                  onSelect={() => {}}
                  onTakeover={() => {}}
                  onRelease={() => {}}
                />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>

      {/* Lead Sheet — rendered outside the board container */}
      <LeadSheet
        open={sheetOpen}
        onOpenChange={handleSheetClose}
        conversation={selectedConversation}
        agentId={agentId}
        mutatingId={mutatingId}
        onTakeover={handleTakeover}
        onRelease={handleRelease}
        onConversationUpdate={handleConversationUpdate}
      />
    </>
  );
}

export default function AdminInboxPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center">
          <span className="text-sm text-muted-foreground">Cargando inbox…</span>
        </div>
      }
    >
      <InboxContent />
    </Suspense>
  );
}
