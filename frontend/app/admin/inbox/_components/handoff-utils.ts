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
    "border-success/25 bg-success/10 text-success",
  soporte:
    "border-amber/25 bg-amber/10 text-amber",
  sin_valor:
    "border-border bg-muted text-muted-foreground",
};

// ── Urgency helpers ───────────────────────────────────────────────────────────

export const URGENCY_DOT: Record<NonNullable<ConversationUrgency>, string> = {
  alta: "bg-error",
  media: "bg-amber",
  baja: "bg-success",
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
