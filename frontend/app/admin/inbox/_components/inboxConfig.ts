// Shared config + types for the inbox board.
// Kept narrow on purpose — only literals/types consumed by 2+ components live here.

export type TabKey = "todos" | "pendientes" | "mias" | "bot";
export type ChannelKey = "todos" | "web" | "whatsapp";
export type DatosKey = "todos" | "leads" | "sin_datos";

// Optional columns the agent can opt into via toolbar toggles.
export type ExtraColumnKey = "sin_valor" | "completado";

export const TABS: { key: TabKey; label: string }[] = [
  { key: "todos", label: "Todos" },
  { key: "pendientes", label: "Pendientes" },
  { key: "mias", label: "Mis activas" },
  { key: "bot", label: "Bot" },
];

export const CHANNELS: { key: ChannelKey; label: string }[] = [
  { key: "todos", label: "Todos" },
  { key: "web", label: "Web" },
  { key: "whatsapp", label: "WhatsApp" },
];

export const DATOS: { key: DatosKey; label: string }[] = [
  { key: "todos", label: "Todos" },
  { key: "leads", label: "Con datos" },
  { key: "sin_datos", label: "Sin datos" },
];

export const isTabKey = (v: string | null): v is TabKey =>
  v === "todos" || v === "pendientes" || v === "mias" || v === "bot";

export const isChannelKey = (v: string | null): v is ChannelKey =>
  v === "todos" || v === "web" || v === "whatsapp";

export const isDatosKey = (v: string | null): v is DatosKey =>
  v === "todos" || v === "leads" || v === "sin_datos";

export const isExtraKey = (v: string): v is ExtraColumnKey =>
  v === "sin_valor" || v === "completado";

// Column model.

export type KanbanColumnDef = {
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
export const COMPLETED_KEY = "__completed__";

// Always-visible columns. Default board = 4 columns wide.
export const BASE_COLUMNS: KanbanColumnDef[] = [
  {
    key: null,
    label: "Sin clasificar",
    headerBg: "bg-muted",
    headerText: "text-foreground",
    colBg: "bg-muted/30",
    dotClass: "bg-muted-foreground/50",
    emptyLabel: "Sin conversaciones",
  },
  {
    key: "informacion",
    label: "Información",
    headerBg: "bg-info",
    headerText: "text-info-foreground",
    colBg: "bg-info/10",
    dotClass: "bg-info",
    emptyLabel: "Sin consultas informativas",
  },
  {
    key: "comercial",
    label: "Comercial",
    headerBg: "bg-success",
    headerText: "text-success-foreground",
    colBg: "bg-success/10",
    dotClass: "bg-success",
    emptyLabel: "Sin oportunidades comerciales",
  },
  {
    key: "soporte",
    label: "Soporte",
    headerBg: "bg-warning",
    headerText: "text-warning-foreground",
    colBg: "bg-warning/10",
    dotClass: "bg-warning",
    emptyLabel: "Sin casos de soporte",
  },
];

// Opt-in columns toggled from the toolbar.
export const EXTRA_COLUMNS: Record<ExtraColumnKey, KanbanColumnDef> = {
  sin_valor: {
    key: "sin_valor",
    label: "Sin valor",
    headerBg: "bg-muted border border-border",
    headerText: "text-muted-foreground",
    colBg: "bg-muted/30",
    dotClass: "bg-muted-foreground/50",
    emptyLabel: "Sin descartados",
  },
  completado: {
    key: COMPLETED_KEY,
    label: "Completado",
    headerBg: "bg-primary",
    headerText: "text-primary-foreground",
    colBg: "bg-primary/10",
    dotClass: "bg-primary",
    emptyLabel: "Sin conversaciones completadas",
  },
};

// Resolve the active column list from current toggle state.
export function resolveColumns(extras: Set<ExtraColumnKey>): KanbanColumnDef[] {
  const out: KanbanColumnDef[] = [...BASE_COLUMNS];
  if (extras.has("sin_valor")) out.push(EXTRA_COLUMNS.sin_valor);
  if (extras.has("completado")) out.push(EXTRA_COLUMNS.completado);
  return out;
}

// Per-card column width (px). Was 288; reduced so 4 cols (+gaps) fit a 1280
// viewport without horizontal scroll.
export const COLUMN_WIDTH_PX = 264;

// URL helpers for the column-extras param (?extra=sin_valor,completado).

export function parseExtras(raw: string | null): Set<ExtraColumnKey> {
  const out = new Set<ExtraColumnKey>();
  if (!raw) return out;
  for (const part of raw.split(",")) {
    const trimmed = part.trim();
    if (isExtraKey(trimmed)) out.add(trimmed);
  }
  return out;
}

export function serializeExtras(set: Set<ExtraColumnKey>): string {
  // Stable order for consistent URLs.
  const order: ExtraColumnKey[] = ["sin_valor", "completado"];
  return order.filter((k) => set.has(k)).join(",");
}
