export type ConversationCategory = "informacion" | "comercial" | "soporte" | "sin_valor" | null;
export type ConversationUrgency = "alta" | "media" | "baja" | null;

// ── Category helpers ──────────────────────────────────────────────────────────

export const CATEGORY_LABEL: Record<NonNullable<ConversationCategory>, string> = {
  informacion: "Información",
  comercial: "Comercial",
  soporte: "Soporte",
  sin_valor: "Sin valor",
};

export const CATEGORY_CLASS: Record<NonNullable<ConversationCategory>, string> = {
  informacion:
    "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900/50 dark:bg-sky-950/50 dark:text-sky-300",
  comercial:
    "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/50 dark:text-emerald-300",
  soporte:
    "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/50 dark:text-amber-300",
  sin_valor:
    "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-900/50 dark:bg-slate-950/50 dark:text-slate-300",
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
