"use client";

import { useMemo } from "react";
import {
  depSeverity,
  fmtPct,
  fmtUptime,
  type HealthReadyData,
  type SystemStatusData,
  type ObservabilityData,
} from "../_utils";

interface Props {
  health: HealthReadyData | null;
  status: SystemStatusData | null;
  obs: ObservabilityData | null;
}

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

function ServiceTile({
  icon,
  name,
  latency,
  severity,
  warn = false,
}: {
  icon: string;
  name: string;
  latency: string;
  severity: "ok" | "warn" | "crit" | "info";
  warn?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors ${
        warn
          ? "border-amber-500/30 bg-amber-500/5"
          : "border-border/50 bg-muted/30"
      }`}
    >
      <span className="text-sm flex-shrink-0" aria-hidden="true">
        {icon}
      </span>
      <div className="min-w-0">
        <div className="text-xs font-semibold leading-none">{name}</div>
        <div
          className={`text-[10px] font-mono mt-0.5 leading-none ${
            warn ? "text-amber-500" : "text-muted-foreground"
          }`}
        >
          {latency}
        </div>
      </div>
      <StatusDot severity={severity} />
    </div>
  );
}

export function ServicesStrip({ health, status, obs }: Props) {
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

  const ringColor =
    healthPct >= 90 ? "#34d399" : healthPct >= 50 ? "#fbbf24" : "#f87171";

  const uptimeLabel = status?.uptime_seconds
    ? fmtUptime(status.uptime_seconds)
    : obs?.uptime_seconds
      ? fmtUptime(obs.uptime_seconds)
      : null;

  const t60 = obs?.throughput?.["60m"];
  const successRate = t60 && t60.chats > 0 ? 1 - t60.error_rate : null;
  const reqPerMin = t60?.chats_per_min ?? null;

  const successColor =
    successRate == null
      ? "text-muted-foreground"
      : successRate >= 0.99
        ? "text-emerald-400"
        : successRate >= 0.95
          ? "text-amber-400"
          : "text-rose-400";

  return (
    <div className="px-5 py-2.5 border-b border-border/60 bg-muted/10">
      <div className="flex items-center gap-3 flex-wrap">
        {/* Health ring compact */}
        <div className="flex items-center gap-2 pr-3 border-r border-border/50">
          <svg width={32} height={32} viewBox="0 0 32 32" aria-hidden="true">
            <circle
              cx={16}
              cy={16}
              r={13}
              fill="none"
              stroke="hsl(var(--border))"
              strokeWidth={2.5}
            />
            <circle
              cx={16}
              cy={16}
              r={13}
              fill="none"
              stroke={ringColor}
              strokeWidth={2.5}
              strokeDasharray={`${(healthPct / 100) * 81.68} 81.68`}
              strokeLinecap="round"
              transform="rotate(-90 16 16)"
              style={{ transition: "stroke-dasharray 0.6s ease" }}
            />
          </svg>
          <div>
            <div
              className="text-xs font-bold font-mono leading-none"
              style={{ color: ringColor }}
            >
              {healthPct}%
            </div>
            <div className="text-[9px] text-muted-foreground leading-none mt-0.5">
              {uptimeLabel ?? "salud"}
            </div>
          </div>
        </div>

        {/* Service tiles */}
        <div className="flex items-center gap-2 flex-wrap flex-1">
          <ServiceTile
            icon="🗄"
            name="MongoDB"
            latency={
              health?.mongodb?.latency_ms != null
                ? `${health.mongodb.latency_ms} ms`
                : "—"
            }
            severity={mongoSev}
          />
          <ServiceTile
            icon="⚡"
            name="Redis"
            latency={health?.redis?.backend ?? health?.redis?.status ?? "—"}
            severity={redisSev}
          />
          <ServiceTile
            icon="🔍"
            name="Qdrant"
            latency={
              health?.qdrant?.latency_ms != null
                ? `${health.qdrant.latency_ms} ms`
                : "—"
            }
            severity={qdrantSev}
            warn={qdrantSev === "warn"}
          />
          <ServiceTile
            icon="🧠"
            name="RAG Engine"
            latency={status ? `v${status.version}` : "—"}
            severity={ragSev}
          />
        </div>

        {/* Live summary numbers */}
        <div className="flex items-center gap-4 pl-3 border-l border-border/50">
          <div className="text-center">
            <div className={`text-xs font-mono font-bold ${successColor}`}>
              {fmtPct(successRate, 1)}
            </div>
            <div className="text-[9px] text-muted-foreground uppercase tracking-wide mt-0.5">
              Éxito
            </div>
          </div>
          <div className="text-center">
            <div className="text-xs font-mono font-bold text-cyan-400">
              {reqPerMin != null ? reqPerMin.toFixed(1) : "—"}
            </div>
            <div className="text-[9px] text-muted-foreground uppercase tracking-wide mt-0.5">
              Req/min
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
