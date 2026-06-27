"use client";

import { useMemo } from "react";
import {
  depSeverity,
  fmtMs,
  fmtNum,
  fmtPct,
  fmtUsd,
  fmtUptime,
  type HealthReadyData,
  type SystemStatusData,
  type ObservabilityData,
} from "../_utils";
import { HealthRing } from "./HealthRing";

interface Props {
  health: HealthReadyData | null;
  status: SystemStatusData | null;
  obs: ObservabilityData | null;
}

// Mini sparkline from up to 6 values
function Sparkline({ values, color }: { values: number[]; color: string }) {
  if (values.length < 2) {
    return <svg width={40} height={20} aria-hidden="true" />;
  }
  const max = Math.max(...values, 1);
  const pts = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * 38 + 1;
      const y = 18 - (v / max) * 14;
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <svg
      width={40}
      height={20}
      viewBox="0 0 40 20"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      <polyline
        points={pts}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// Colored dot only (no label)
function StatusDot({
  severity,
}: {
  severity: "ok" | "warn" | "crit" | "info";
}) {
  const colors: Record<string, string> = {
    ok: "#34d399",
    warn: "#fbbf24",
    crit: "#f87171",
    info: "#22d3ee",
  };
  return (
    <span
      className="inline-block rounded-full flex-shrink-0"
      style={{
        width: 7,
        height: 7,
        background: colors[severity] ?? colors.info,
      }}
      aria-label={severity}
    />
  );
}

export function ServicePanel({ health, status, obs }: Props) {
  const mongoSev = depSeverity(health?.mongodb);
  const redisSev = depSeverity(health?.redis);
  const qdrantSev = depSeverity(health?.qdrant);
  const ragSev: "ok" | "warn" | "crit" | "info" = status
    ? status.rag_available
      ? "ok"
      : "warn"
    : "info";

  const healthPct = useMemo(() => {
    if (!health && !status) return 90;
    const m = mongoSev === "ok" ? 25 : mongoSev === "warn" ? 10 : 0;
    const r = redisSev === "ok" ? 25 : redisSev === "warn" ? 15 : 0;
    const q = qdrantSev === "ok" ? 25 : qdrantSev === "warn" ? 15 : 0;
    const rag = status ? (status.rag_available ? 25 : 0) : 12;
    return m + r + q + rag;
  }, [health, status, mongoSev, redisSev, qdrantSev]);

  const ringSeverity: "ok" | "warn" | "crit" =
    healthPct >= 90 ? "ok" : healthPct >= 50 ? "warn" : "crit";

  const uptimeLabel = status?.uptime_seconds
    ? `uptime ${fmtUptime(status.uptime_seconds)}`
    : obs?.uptime_seconds
      ? `uptime ${fmtUptime(obs.uptime_seconds)}`
      : "uptime —";

  const t60 = obs?.throughput?.["60m"];
  const successRate = t60 && t60.chats > 0 ? 1 - t60.error_rate : null;
  const reqPerMin = t60?.chats_per_min ?? null;
  const totalTokens =
    obs?.tokens != null ? obs.tokens.tokens_in + obs.tokens.tokens_out : null;
  const estimatedCost = obs?.tokens?.estimated_cost_usd ?? null;

  // Tiny decorative latency history from available values
  const mongoLatValues =
    health?.mongodb?.latency_ms != null
      ? [
          health.mongodb.latency_ms * 0.8,
          health.mongodb.latency_ms * 1.1,
          health.mongodb.latency_ms * 0.9,
          health.mongodb.latency_ms,
        ]
      : [];
  const qdrantLatValues =
    health?.qdrant?.latency_ms != null
      ? [
          health.qdrant.latency_ms * 1.2,
          health.qdrant.latency_ms * 0.9,
          health.qdrant.latency_ms * 1.1,
          health.qdrant.latency_ms,
        ]
      : [];

  return (
    <aside
      className="sticky top-[49px] h-[calc(100vh-49px)] overflow-y-auto flex flex-col gap-5 p-4 border-r border-border bg-muted/20"
      style={{ scrollbarWidth: "thin" }}
    >
      {/* Health Ring */}
      <div className="flex justify-center pt-2">
        <HealthRing
          percentage={healthPct}
          severity={ringSeverity}
          uptimeLabel={uptimeLabel}
        />
      </div>

      {/* Dependencies */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            Dependencias
          </span>
          <hr className="flex-1 border-border/40" />
        </div>

        {/* MongoDB */}
        <ServiceRow
          icon="🗄"
          iconColor="rgba(34,211,238,0.15)"
          name="MongoDB"
          latency={
            health?.mongodb?.latency_ms != null
              ? `${health.mongodb.latency_ms} ms`
              : "—"
          }
          severity={mongoSev}
          sparkValues={mongoLatValues}
          sparkColor="#22d3ee"
        />
        {/* Redis */}
        <ServiceRow
          icon="⚡"
          iconColor="rgba(251,191,36,0.15)"
          name="Redis"
          latency={health?.redis?.backend ?? health?.redis?.status ?? "—"}
          severity={redisSev}
          sparkValues={[]}
          sparkColor="#fbbf24"
        />
        {/* Qdrant */}
        <ServiceRow
          icon="🔍"
          iconColor={
            qdrantSev === "warn"
              ? "rgba(251,191,36,0.12)"
              : "rgba(139,92,246,0.15)"
          }
          name="Qdrant"
          latency={
            health?.qdrant?.latency_ms != null
              ? `${health.qdrant.latency_ms} ms`
              : "—"
          }
          severity={qdrantSev}
          sparkValues={qdrantLatValues}
          sparkColor={qdrantSev === "warn" ? "#fbbf24" : "#a78bfa"}
          warn={qdrantSev === "warn"}
        />
        {/* RAG Engine */}
        <ServiceRow
          icon="🧠"
          iconColor="rgba(52,211,153,0.15)"
          name="RAG Engine"
          latency={status ? `v${status.version}` : "—"}
          severity={ragSev}
          sparkValues={[]}
          sparkColor="#34d399"
        />
      </div>

      {/* Summary stats */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            Resumen
          </span>
          <hr className="flex-1 border-border/40" />
        </div>

        <SummaryRow
          label="Tasa éxito"
          value={fmtPct(successRate, 1)}
          valueColor={
            successRate == null
              ? undefined
              : successRate >= 0.99
                ? "#34d399"
                : successRate >= 0.95
                  ? "#fbbf24"
                  : "#f87171"
          }
        />
        <SummaryRow
          label="Req/min"
          value={reqPerMin != null ? reqPerMin.toFixed(1) : "—"}
          valueColor="#22d3ee"
        />
        <SummaryRow label="Tokens" value={fmtNum(totalTokens)} />
        <SummaryRow
          label="Costo aprox."
          value={fmtUsd(estimatedCost)}
          valueColor="#a78bfa"
        />
        <SummaryRow label="Vacíos conocim." value="→ Dashboard" />
      </div>
    </aside>
  );
}

function ServiceRow({
  icon,
  iconColor,
  name,
  latency,
  severity,
  sparkValues,
  sparkColor,
  warn = false,
}: {
  icon: string;
  iconColor: string;
  name: string;
  latency: string;
  severity: "ok" | "warn" | "crit" | "info";
  sparkValues: number[];
  sparkColor: string;
  warn?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-2 p-2 rounded-lg mb-1.5 bg-muted/40 border ${warn ? "border-amber-500/30" : "border-border/50"}`}
    >
      <div
        className="w-6 h-6 rounded-md flex items-center justify-center text-sm flex-shrink-0"
        style={{ background: iconColor }}
        aria-hidden="true"
      >
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-semibold leading-none truncate">
          {name}
        </div>
        <div
          className={`text-[10px] font-mono mt-0.5 leading-none ${warn ? "text-amber-500" : "text-muted-foreground"}`}
        >
          {latency}
        </div>
      </div>
      {sparkValues.length >= 2 && (
        <Sparkline values={sparkValues} color={sparkColor} />
      )}
      <StatusDot severity={severity} />
    </div>
  );
}

function SummaryRow({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <div className="flex justify-between items-center py-1.5 text-xs border-b border-border/30">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={`font-mono font-semibold ${!valueColor ? "text-foreground" : ""}`}
        style={valueColor ? { color: valueColor } : undefined}
      >
        {value}
      </span>
    </div>
  );
}
