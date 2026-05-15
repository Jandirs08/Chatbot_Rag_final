"use client";

import { HelpTooltip, ServiceTile } from "@/app/_components/telemetry";
import type { Sample } from "@/app/hooks/useRingBuffer";
import { depSeverity } from "../_utils";
import type { HealthReadyData, SystemStatusData } from "../_utils";

interface Props {
  healthData: HealthReadyData | undefined;
  statusData: SystemStatusData | undefined;
  mongoLatBuf: Sample[];
  qdrantLatBuf: Sample[];
}

export function ServicesSection({ healthData, statusData, mongoLatBuf, qdrantLatBuf }: Props) {
  return (
    <section className="t-section-card">
      <div className="flex items-center gap-2 mb-5">
        <p className="t-section-title">Servicios Externos — Estado Actual</p>
        <HelpTooltip content="Dependencias críticas que el backend necesita para funcionar. Si alguno cae (rojo), afecta al chat." />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <ServiceTile
          name="MongoDB"
          variant="db"
          severity={depSeverity(healthData?.mongodb)}
          primary={healthData?.mongodb?.latency_ms != null ? `${healthData.mongodb.latency_ms} ms` : "—"}
          secondary={healthData?.mongodb?.status}
          samples={mongoLatBuf}
          tooltip="Base de datos principal. Si cae, usuarios no pueden guardar conversaciones."
        />
        <ServiceTile
          name="Redis"
          variant="cache"
          severity={depSeverity(healthData?.redis)}
          primary={healthData?.redis?.backend ?? healthData?.redis?.status ?? "—"}
          secondary={depSeverity(healthData?.redis) === "warn" ? "fallback memoria" : undefined}
          tooltip="Cache en memoria. Si falla, fallback a memoria del sistema."
        />
        <ServiceTile
          name="Qdrant"
          variant="vector"
          severity={depSeverity(healthData?.qdrant)}
          primary={healthData?.qdrant?.latency_ms != null ? `${healthData.qdrant.latency_ms} ms` : "—"}
          secondary={
            statusData?.qdrant_circuit_breaker
              ? `CB ${statusData.qdrant_circuit_breaker.state}`
              : healthData?.qdrant?.points_count != null
              ? `${healthData.qdrant.points_count.toLocaleString("es-PE")} vectores`
              : undefined
          }
          samples={qdrantLatBuf}
          tooltip="Motor de búsqueda vectorial. Si cae, no hay búsqueda semántica."
        />
        <ServiceTile
          name="RAG Engine"
          variant="engine"
          severity={statusData?.rag_available ? "ok" : statusData ? "warn" : "info"}
          primary={statusData ? (statusData.rag_available ? "disponible" : "no disponible") : "—"}
          secondary={statusData ? `v${statusData.version}` : undefined}
          tooltip="Motor de recuperación aumentada por generación. Orquesta búsqueda + LLM."
        />
      </div>
    </section>
  );
}
