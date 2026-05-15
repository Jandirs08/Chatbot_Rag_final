"use client";

import { HelpTooltip, PipelineWaterfall, type WaterfallStage } from "@/app/_components/telemetry";
import { fmtMs } from "../_utils";

interface Props {
  stages: WaterfallStage[];
  totalP50: number | null;
  totalP95: number | null;
}

export function PipelineSection({ stages, totalP50, totalP95 }: Props) {
  return (
    <section className="t-section-card">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <p className="t-section-title">Pipeline RAG — Tiempo por Etapa</p>
          <HelpTooltip content="Cuánto tarda cada fase del pipeline. p50 = mediana, p95 = el 95% más lento. Identifica cuellos de botella." />
        </div>
        {totalP50 != null && (
          <span className="t-mono-sm">
            p50 {fmtMs(totalP50)} · p95 {fmtMs(totalP95)}
          </span>
        )}
      </div>
      {stages.length === 0 ? (
        <p className="t-small">Sin muestras en la ventana actual.</p>
      ) : (
        <PipelineWaterfall stages={stages} total={totalP50} />
      )}
    </section>
  );
}
