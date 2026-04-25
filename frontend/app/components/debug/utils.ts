import React from "react";

export type RetrievedDoc = {
  text?: string;
  preview?: string;
  source?: string | null;
  file_path?: string | null;
  score?: number | null;
  page_number?: number | null;
};

export type DebugData = {
  retrieved_documents?: RetrievedDoc[];
  retrieved?: RetrievedDoc[];
  prompt_used?: string;
  model_params?: Record<string, unknown>;
  rag_time?: number | null;
  llm_time?: number | null;
  history_ms?: number | null;
  embedding_ms?: number | null;
  dense_ms?: number | null;
  lexical_ms?: number | null;
  hydrate_ms?: number | null;
  rerank_ms?: number | null;
  first_token_ms?: number | null;
  stream_total_ms?: number | null;
  input_tokens?: number | null;
  output_tokens?: number | null;
  verification?: { is_grounded: boolean; reason?: string } | null;
  gating_reason?: string | null;
  is_cached?: boolean;
};

export const PROMPT_SEGMENTS = ["context", "history", "instructions"] as const;
export const ORDERED_PROMPT_SEGMENTS = [
  "instructions",
  "context",
  "history",
] as const;

export const GATING_MAP: Record<string, string> = {
  semantic_match: "Búsqueda Semántica",
  keyword_match: "Búsqueda por Palabras Clave",
  qa: "Pregunta y Respuesta",
  small_talk: "Charla",
  chatty: "Charla",
  low_intent: "Charla",
  no_corpus: "Sin Corpus",
  too_short: "Consulta Muy Corta",
  error: "Error",
};

export const GATING_TONE_MAP: Record<
  string,
  "green" | "indigo" | "amber" | "rose"
> = {
  semantic_match: "green",
  keyword_match: "green",
  qa: "green",
  small_talk: "indigo",
  chatty: "indigo",
  low_intent: "indigo",
  no_corpus: "amber",
  too_short: "amber",
  error: "rose",
};

export const GATING_EXPLAIN: Record<
  string,
  { title: string; subtitle: string }
> = {
  semantic_match: {
    title: "Búsqueda Semántica",
    subtitle: "Intención informativa detectada",
  },
  keyword_match: {
    title: "Búsqueda Directa",
    subtitle: "Coincidencias por palabras clave",
  },
  qa: {
    title: "Pregunta y Respuesta",
    subtitle: "Consulta compatible con corpus",
  },
  small_talk: { title: "Charla Casual", subtitle: "Intención social ligera" },
  chatty: { title: "Charla Casual", subtitle: "Intención social ligera" },
  low_intent: {
    title: "Charla Casual",
    subtitle: "Baja intención informativa",
  },
  no_corpus: { title: "Sin Corpus", subtitle: "No hay base documental" },
  too_short: { title: "Consulta Muy Corta", subtitle: "Amplía la pregunta" },
  error: { title: "Error", subtitle: "Gating con fallo" },
  small_corpus: {
    title: "Búsqueda Directa",
    subtitle: "Corpus pequeño detectado",
  },
};

export const fmtSVal = (v: number | null) => (v === null ? "-" : v.toFixed(2));
export const fmtMsVal = (v: number | null) =>
  v === null ? "-" : v >= 1000 ? `${(v / 1000).toFixed(2)}s` : `${v.toFixed(0)} ms`;
export const fmtTokVal = (v: number | null) =>
  v === null ? "-" : v.toLocaleString();

export function segRegex(name: string): RegExp {
  return new RegExp(`<${name}>[\\s\\S]*?<\/${name}>`);
}

export function extractInner(promptText: string, name: string): string {
  const regex = new RegExp(`<${name}>[\\s\\S]*?<\/${name}>`, "i");
  const match = String(promptText || "").match(regex);
  if (!match) return "";
  return match[0].replace(new RegExp(`</?${name}>`, "gi"), "").trim();
}

export function formatGeneral(s: string): string {
  let t = String(s || "");
  t = t.replace(/\s{2,}/g, " ");
  t = t.replace(/([\.;:])\s+/g, "$1\n\n");
  t = t.replace(/\n{3,}/g, "\n\n");
  t = t.replace(/(^|\n)\s+/g, "$1");
  t = t.replace(/^\s*•\s+/gm, "    - ");
  t = t.replace(/^\s*-\s+/gm, "    - ");
  t = t.replace(/^\s*(\d+)\.\s*\n\s*/gm, "$1. ");
  return t;
}

export function splitInstructions(s: string): string[] {
  const t = formatGeneral(s);
  return t.split(/(?=\n?\s*\d+\.)/g).filter((x) => x.trim().length > 0);
}

export function emphasize(s: string): React.ReactNode {
  const re = /(PRIORIDAD MÁXIMA|MANEJO DE VACÍOS|FORMATO)/g;
  const chunks = String(s).split(re);
  return React.createElement(
    React.Fragment,
    null,
    chunks.map((c, i) =>
      re.test(c)
        ? React.createElement(
            "span",
            { key: i, className: "font-semibold" },
            c,
          )
        : React.createElement("span", { key: i }, c),
    ),
  );
}

export interface JsonStats {
  keys: number;
  arrays: number;
  objects: number;
}

export function jsonStats(v: unknown): JsonStats {
  if (v === null || typeof v !== "object")
    return { keys: 0, arrays: 0, objects: 0 };
  if (Array.isArray(v)) {
    const inner = v.map(jsonStats).reduce(
      (a, b) => ({
        keys: a.keys + b.keys,
        arrays: a.arrays + b.arrays,
        objects: a.objects + b.objects,
      }),
      { keys: 0, arrays: 0, objects: 0 },
    );
    return {
      keys: inner.keys,
      arrays: inner.arrays + 1,
      objects: inner.objects,
    };
  }
  const entries = Object.entries(v as Record<string, unknown>);
  const inner = entries
    .map(([, val]) => jsonStats(val))
    .reduce(
      (a, b) => ({
        keys: a.keys + b.keys,
        arrays: a.arrays + b.arrays,
        objects: a.objects + b.objects,
      }),
      { keys: 0, arrays: 0, objects: 0 },
    );
  return {
    keys: inner.keys + entries.length,
    arrays: inner.arrays,
    objects: inner.objects + 1,
  };
}
