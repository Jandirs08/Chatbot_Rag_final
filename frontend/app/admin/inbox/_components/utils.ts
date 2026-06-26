export function formatRelativeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 30) return "ahora mismo";
  if (seconds < 60) return `hace ${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours}h`;
  const days = Math.floor(hours / 24);
  return `hace ${days}d`;
}

export type ConversationItem = {
  conversation_id: string;
  last_message_preview: string;
  total_messages: number;
  updated_at: string;
};

export type ConversationResponse = {
  items: ConversationItem[];
  total: number;
};

export type HistoryItem = {
  role: "user" | "assistant" | "system" | "function" | "agent";
  content: string;
  timestamp?: string;
  source?: string | null;
};

export type FilterConfig = {
  search: string;
  startDate: string;
  endDate: string;
  hideTrivial: boolean;
};

export const EMPTY_CONVERSATIONS: ConversationItem[] = [];
export const EMPTY_HISTORY: HistoryItem[] = [];

export const colorFromId = (id: string) => {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360;
  return `hsl(${h}deg 65% 85%)`;
};

export const humanizeId = (id?: string | null) => {
  if (!id) return "Usuario Desconocido";
  const clean = id.replace(/[^a-fA-F0-9]/g, "");
  const tag = clean.slice(-4).toUpperCase();
  return `Visitante #${tag || "0000"}`;
};

// ─── Lead helpers (shared by InboxConversationCard + ConversationWorkspace) ───

export function getInitials(name?: string | null, id?: string): string {
  if (name) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return parts[0].slice(0, 2).toUpperCase();
  }
  const clean = (id ?? "").replace(/[^a-fA-F0-9]/g, "");
  return clean.slice(-2).toUpperCase() || "??";
}

/**
 * Semantic score tone. The card maps this to Tailwind token classes
 * (bg-success/10, etc.); ConversationWorkspace uses `getScoreStyle` to render
 * the bar inline via the same CSS variables so both stay consistent across themes.
 */
export type ScoreTone = "success" | "warning" | "error";

export function getScoreTone(score: number): ScoreTone {
  if (score >= 71) return "success";
  if (score >= 41) return "warning";
  return "error";
}

export type ScoreStyle = {
  tone: ScoreTone;
  /** CSS color expression referencing the matching design-system token */
  color: string;
  /** CSS background expression referencing the matching design-system token */
  bg: string;
  label: string;
};

export function getScoreStyle(score: number): ScoreStyle {
  const tone = getScoreTone(score);
  const color = `hsl(var(--${tone}))`;
  const bg = `hsl(var(--${tone}) / 0.12)`;
  const label =
    tone === "success"
      ? "Listo para comprar"
      : tone === "warning"
        ? "Interés moderado"
        : "Sin interés claro";
  return { tone, color, bg, label };
}

const CHANNEL_LABEL: Record<string, string> = {
  web: "Web",
  whatsapp: "WhatsApp",
  api: "API",
};

/**
 * Display label for a conversation when no real lead name exists.
 * Prefers a real name. Otherwise falls back to channel + last 4 of external_id
 * (e.g. "WhatsApp · 4821") instead of a synthetic "Visitante #XXXX".
 */
export function displayLabel(opts: {
  name?: string | null;
  channel?: string | null;
  externalId?: string | null;
  conversationId?: string | null;
}): string {
  const { name, channel, externalId, conversationId } = opts;
  if (name && name.trim().length > 0) return name.trim();

  const ch = channel?.toLowerCase() ?? "";
  const channelText =
    CHANNEL_LABEL[ch] ?? (ch ? ch[0].toUpperCase() + ch.slice(1) : null);

  const cleanExternalDigits = (externalId ?? "").replace(/\D/g, "");
  if (channelText && cleanExternalDigits.length >= 4) {
    return `${channelText} · ${cleanExternalDigits.slice(-4)}`;
  }
  if (channelText) {
    const idTail = (externalId ?? conversationId ?? "")
      .replace(/[^a-zA-Z0-9]/g, "")
      .slice(-4)
      .toUpperCase();
    if (idTail) return `${channelText} · ${idTail}`;
  }
  return humanizeId(conversationId ?? externalId);
}

const isSameDay = (left: Date, right: Date) =>
  left.getFullYear() === right.getFullYear() &&
  left.getMonth() === right.getMonth() &&
  left.getDate() === right.getDate();

export const fmtDate = (iso?: string) => {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);

    if (isSameDay(d, now)) {
      return d.toLocaleTimeString("es-PE", {
        hour: "numeric",
        minute: "2-digit",
      });
    }

    if (isSameDay(d, yesterday)) {
      return "Ayer";
    }

    return d.toLocaleDateString("es-PE", {
      day: "2-digit",
      month: "short",
    });
  } catch {
    return "";
  }
};

export const fmtConversationMeta = (iso?: string) => {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("es-PE", {
      day: "2-digit",
      month: "short",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
};

export const getConversationSection = (iso?: string) => {
  if (!iso) return "Sin fecha";

  const d = new Date(iso);
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const diffInDays =
    (new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() -
      new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) /
    (1000 * 60 * 60 * 24);

  if (isSameDay(d, now)) return "Hoy";
  if (isSameDay(d, yesterday)) return "Ayer";
  if (diffInDays < 7) return "Esta semana";
  return "Anteriores";
};

export const getMessageKey = (m: HistoryItem, idx: number): string => {
  const maybeId = (m as unknown as { id?: string | number }).id;
  if (maybeId != null && String(maybeId).trim().length > 0) {
    return String(maybeId);
  }
  const ts = m.timestamp ? new Date(m.timestamp).getTime() : 0;
  const contentSlice = (m.content ?? "").slice(0, 24).replace(/\s+/g, " ");
  if (ts) {
    return `${m.role}-${ts}-${contentSlice}`;
  }
  const base = `${m.role}-${m.content ?? ""}`;
  let hash = 0;
  for (let i = 0; i < base.length; i++) {
    hash = (hash << 5) - hash + base.charCodeAt(i);
    hash |= 0;
  }
  return `${m.role}-${hash}-${idx}`;
};

export const previewClampClass =
  "overflow-hidden [display:-webkit-box] [-webkit-line-clamp:2] [-webkit-box-orient:vertical]";
