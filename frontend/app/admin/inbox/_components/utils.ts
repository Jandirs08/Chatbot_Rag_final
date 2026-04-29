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
