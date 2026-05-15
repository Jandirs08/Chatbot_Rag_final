"use client";

import { AlertCircle, AlertTriangle } from "lucide-react";
import type { Severity } from "@/app/_components/telemetry";

interface Props {
  overall: Severity;
  error?: unknown;
  hasData: boolean;
}

export function AlertBanner({ overall, error, hasData }: Props) {
  return (
    <>
      {overall === "crit" && (
        <div className="t-crit-banner flex items-start gap-3 mb-8">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" style={{ color: "var(--t-signal-deep)" }} />
          <div>
            <p className="t-section-title" style={{ color: "var(--t-signal-deep)" }}>Sistema en estado crítico</p>
            <p className="t-small mt-1">Revisa la sección de Servicios Externos y los Indicadores Clave para identificar el problema.</p>
          </div>
        </div>
      )}
      {overall === "warn" && (
        <div className="t-warn-banner flex items-start gap-3 mb-8">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" style={{ color: "var(--t-signal)" }} />
          <div>
            <p className="t-section-title" style={{ color: "var(--t-signal)" }}>Atención requerida</p>
            <p className="t-small mt-1">Una o más métricas están fuera de sus objetivos normales.</p>
          </div>
        </div>
      )}
      {error != null && !hasData && (
        <div className="flex items-center gap-3 mb-12 px-4 py-3 rounded-sm" style={{ background: "var(--t-signal-soft)", color: "var(--t-signal-deep)" }}>
          <AlertCircle className="h-4 w-4" />
          <span className="t-small" style={{ color: "var(--t-signal-deep)" }}>
            No se pudo cargar las métricas. Verifica tu conexión.
          </span>
        </div>
      )}
    </>
  );
}
