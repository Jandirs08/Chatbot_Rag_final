export type ConversationCategory = "oportunidad" | "interes" | "requiere_atencion" | null;
export type ConversationUrgency = "alta" | "media" | "baja" | null;

// ── Category helpers ──────────────────────────────────────────────────────────

export const CATEGORY_LABEL: Record<NonNullable<ConversationCategory>, string> = {
  oportunidad: "Oportunidad",
  interes: "Interés",
  requiere_atencion: "Atención",
};

export const CATEGORY_CLASS: Record<NonNullable<ConversationCategory>, string> = {
  oportunidad:
    "border-red-200 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-950/50 dark:text-red-300",
  interes:
    "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/50 dark:text-amber-300",
  requiere_atencion:
    "border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-900/50 dark:bg-orange-950/50 dark:text-orange-300",
};

// ── Urgency helpers ───────────────────────────────────────────────────────────

export const URGENCY_DOT: Record<NonNullable<ConversationUrgency>, string> = {
  alta: "bg-red-500",
  media: "bg-amber-500",
  baja: "bg-emerald-500",
};

export const URGENCY_LABEL: Record<NonNullable<ConversationUrgency>, string> = {
  alta: "Urgente",
  media: "Media",
  baja: "Baja",
};

// ── Time helpers ──────────────────────────────────────────────────────────────

export function fmtMinutes(minutes: number | null): string {
  if (minutes === null || minutes === undefined) return "";
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

export function fmtTimestamp(iso: string | null): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleTimeString("es-PE", {
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}
