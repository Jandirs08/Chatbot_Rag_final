"use client";

import {
  GatingBars,
  HelpTooltip,
  type GatingItem,
} from "@/app/_components/telemetry";

interface Props {
  items: GatingItem[];
  total: number;
}

export function GatingSection({ items, total }: Props) {
  return (
    <section className="t-section-card lg:col-span-3">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <h3 className="t-section-title">Diagnóstico de Consultas</h3>
          <HelpTooltip content="Qué pasó con las consultas que no completaron el pipeline RAG. Excluye las que sí completaron búsqueda semántica completa." />
        </div>
        {total > 0 && <span className="t-mono-sm">{total} eventos</span>}
      </div>
      <GatingBars items={items} total={total} />
    </section>
  );
}
