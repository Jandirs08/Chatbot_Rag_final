"use client";

import React from "react";
import { HelpTooltip } from "./HelpTooltip";

export interface GatingItem {
  key: string;
  label: string;
  count: number;
}

interface Props {
  items: GatingItem[];
  total: number;
}

const GATING_HELP: Record<string, string> = {
  agentic_rag_enabled: "Consulta procesada por búsqueda semántica completa (RAG activado).",
  small_talk: "Saludos o charla casual que no requieren búsqueda en documentos.",
  empty_query: "El usuario envió texto vacío o solo espacios.",
  punctuation_only: "Mensaje solo con signos de puntuación, sin contenido procesable.",
  too_short: "Consulta muy breve para hacer búsqueda significativa.",
  cheap_gate_pass: "Pasó el filtro inicial de relevancia antes de búsqueda completa.",
  embedding_failed: "Error al vectorizar la consulta. Revisar servicio de embeddings.",
  retrieval_backend_unavailable: "Qdrant u otro backend no disponible en ese momento.",
  no_candidates: "Búsqueda no encontró documentos candidatos.",
  no_parent_candidates: "Sin documentos padre para los chunks encontrados.",
  reranker_empty: "Re-ranker descartó todos los candidatos.",
  low_relevance_score: "Documentos encontrados no superaron umbral de relevancia.",
  lexical_only: "Solo se usó búsqueda por palabras clave (sin semántica).",
};

export function GatingBars({ items, total }: Props) {
  if (items.length === 0 || total === 0) {
    return <p className="t-small">Sin eventos en la ventana actual.</p>;
  }

  const max = Math.max(...items.map((i) => i.count), 1);
  const sorted = [...items].sort((a, b) => b.count - a.count);

  return (
    <div className="space-y-2">
      {sorted.map((item) => {
        const widthPct = (item.count / max) * 100;
        const sharePct = (item.count / total) * 100;
        return (
          <div key={item.key} className="flex flex-col gap-1">
            <div className="flex items-center gap-1.5">
              <span className="text-[12px] font-medium" style={{ color: "var(--t-ink)" }}>
                {item.label}
              </span>
              {GATING_HELP[item.key] && <HelpTooltip content={GATING_HELP[item.key]} />}
            </div>
            <div className="relative h-4 rounded-sm overflow-hidden" style={{ background: "var(--t-surface)" }}>
              <div
                className="absolute inset-y-0 left-0 transition-[width] duration-500"
                style={{ width: `${widthPct}%`, background: "var(--t-data)", opacity: 0.45 }}
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="t-mono text-right">{item.count}</span>
              <span className="t-mono-sm text-right">{sharePct.toFixed(0)}%</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
