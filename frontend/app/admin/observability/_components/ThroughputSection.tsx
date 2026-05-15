"use client";

import { HelpTooltip, type Severity } from "@/app/_components/telemetry";
import { THROUGHPUT_WINDOWS } from "../_utils";
import type { ObservabilityData } from "../_utils";

interface Props {
  throughput: ObservabilityData["throughput"];
}

export function ThroughputSection({ throughput }: Props) {
  return (
    <section className="t-section-card lg:col-span-2">
      <div className="flex items-center gap-2 mb-5">
        <p className="t-section-title">Volumen de Tráfico</p>
        <HelpTooltip content="Chats procesados en diferentes ventanas. Error rate muestra problemas operacionales." />
      </div>
      <div className="space-y-3">
        {THROUGHPUT_WINDOWS.map((win) => {
          const row = throughput[win];
          if (!row) return null;
          const errPct = row.error_rate * 100;
          const sev: Severity = errPct >= 5 ? "crit" : errPct > 0 ? "warn" : "ok";
          return (
            <div key={win} className="flex flex-col gap-1.5 p-3 rounded-md" style={{ background: "var(--t-surface-deep)" }}>
              <div className="flex items-center justify-between">
                <span className="t-label">Últimos {win}</span>
                <span className="t-mono-sm">{row.chats.toLocaleString("es-PE")} chats</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="t-mono-sm">{row.chats_per_min.toFixed(1)}/min</span>
                <span className="t-mono-sm" data-severity={sev}>
                  Error: {errPct.toFixed(2)}%
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
