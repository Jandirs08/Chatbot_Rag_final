"use client";

import { useId } from "react";

interface Props {
  percentage: number;
  severity: "ok" | "warn" | "crit";
  uptimeLabel: string;
}

const RADIUS = 45;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS; // ~282.7

const severityColor: Record<"ok" | "warn" | "crit", string> = {
  ok: "#34d399",
  warn: "#fbbf24",
  crit: "#f87171",
};

export function HealthRing({ percentage, severity, uptimeLabel }: Props) {
  const uid = useId();
  const gradientId = `ringGrad-${uid}`;
  const clampedPct = Math.max(0, Math.min(100, percentage));
  const dashArray = `${(clampedPct / 100) * CIRCUMFERENCE} ${CIRCUMFERENCE}`;
  const color = severityColor[severity];

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: 110, height: 110 }}>
        <svg
          width={110}
          height={110}
          viewBox="0 0 110 110"
          style={{ transform: "rotate(-90deg)" }}
        >
          <defs>
            <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#34d399" />
              <stop offset="100%" stopColor="#22d3ee" />
            </linearGradient>
          </defs>
          {/* Background track */}
          <circle
            cx={55}
            cy={55}
            r={RADIUS}
            fill="none"
            stroke="hsl(var(--border))"
            strokeWidth={9}
          />
          {/* Foreground arc */}
          <circle
            cx={55}
            cy={55}
            r={RADIUS}
            fill="none"
            stroke={severity === "ok" ? `url(#${gradientId})` : color}
            strokeWidth={9}
            strokeLinecap="round"
            strokeDasharray={dashArray}
            style={{
              transition: "stroke-dasharray 1s ease, stroke-dashoffset 1s ease",
            }}
          />
        </svg>
        {/* Center label — not rotated */}
        <div
          className="absolute inset-0 flex flex-col items-center justify-center"
          aria-label={`${clampedPct}% de salud del sistema`}
        >
          <span
            className="text-2xl font-extrabold tabular-nums leading-none"
            style={{ color }}
          >
            {Math.round(clampedPct)}%
          </span>
          <span className="text-[9px] uppercase tracking-[0.12em] text-muted-foreground mt-0.5">
            Health
          </span>
        </div>
      </div>
      <span className="text-xs text-muted-foreground text-center leading-tight">
        {uptimeLabel}
      </span>
    </div>
  );
}
