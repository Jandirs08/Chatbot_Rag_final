"use client";

import { HelpTooltip, TelemetryMetric, type Severity } from "@/app/_components/telemetry";
import { fmtMs, fmtNum, fmtPct } from "../_utils";
import type { ThroughputBucket } from "../_utils";

interface Props {
  t60: ThroughputBucket | undefined;
  successRate60: number | null;
  ftP95: number | null;
  totalP95: number | null;
  cantAnswerCount: number;
  severities: { successSev: Severity; totalSev: Severity; ftSev: Severity };
}

export function KPISection({ t60, successRate60, ftP95, totalP95, cantAnswerCount, severities }: Props) {
  return (
    <section className="t-section-card sm:p-8" data-severity={severities.successSev}>
      <div className="flex items-center gap-2 mb-8">
        <h3 className="t-heading">Indicadores Clave</h3>
        <HelpTooltip content="Métricas críticas que indican la salud operacional. Verde = dentro del objetivo. Amarillo = revisar. Rojo = acción inmediata." />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-8">
        <TelemetryMetric
          hero
          label="Tasa de éxito (60 min)"
          value={fmtPct(successRate60, 2)}
          sub={t60 && t60.chats >= 20 ? `${fmtPct(t60.error_rate, 2)} con error` : "pocos datos aún"}
          severity={severities.successSev}
          tooltip="Porcentaje de chats completados sin error en la última hora. Se activa con 20+ chats."
        />
        <TelemetryMetric
          hero
          label="Primer token (p95)"
          value={fmtMs(ftP95)}
          sub="tiempo hasta primera palabra"
          severity={severities.ftSev}
          tooltip="Cuánto tarda el LLM en producir la primera palabra. Con OpenAI puede superar 5s en horas pico — es normal."
        />
        <TelemetryMetric
          hero
          label="Latencia total (p95)"
          value={fmtMs(totalP95)}
          sub="fin a fin de la respuesta"
          severity={severities.totalSev}
          tooltip="Tiempo total desde que el usuario envía hasta que recibe la respuesta completa. Solo afecta el banner si hay errores reales."
        />
        <TelemetryMetric
          hero
          label="Sin respuesta RAG"
          value={fmtNum(cantAnswerCount)}
          sub={t60?.chats ? `${((cantAnswerCount / t60.chats) * 100).toFixed(0)}% del tráfico` : "consultas sin doc relevante"}
          severity={
            t60?.chats && t60.chats >= 10
              ? cantAnswerCount / t60.chats > 0.15 ? "warn" : cantAnswerCount > 0 ? "info" : "ok"
              : "info"
          }
          tooltip="Consultas donde el bot no encontró documentos con suficiente relevancia. Ocurre cuando: (1) no hay PDFs cargados, (2) el tema no está cubierto en los docs, (3) la pregunta es muy distinta al contenido. Si supera 15% del tráfico, revisar la base de conocimiento."
        />
      </div>
    </section>
  );
}
