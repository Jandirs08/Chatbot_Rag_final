"use client";

import React from "react";
import type { Sample } from "@/app/hooks/useRingBuffer";

interface Props {
  samples: Sample[];
  width?: number;
  height?: number;
  severity?: "ok" | "warn" | "crit" | "info";
  invert?: boolean;
  fill?: boolean;
  className?: string;
  ariaLabel?: string;
  baseline?: "min" | "zero";
}

const COLORS: Record<NonNullable<Props["severity"]>, string> = {
  ok:   "var(--t-data)",
  warn: "var(--t-signal)",
  crit: "var(--t-signal-deep)",
  info: "var(--t-ink-mute)",
};

export function Sparkline({
  samples,
  width = 120,
  height = 32,
  severity = "ok",
  fill = false,
  className,
  ariaLabel,
  baseline = "min",
}: Props) {
  const valid = samples.filter((s) => s.v != null && Number.isFinite(s.v)) as Array<{ t: number; v: number }>;

  if (valid.length < 2) {
    return (
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className={className}
        aria-hidden="true"
      >
        <line
          x1={0}
          y1={height / 2}
          x2={width}
          y2={height / 2}
          stroke="var(--t-ink-faint)"
          strokeWidth={1}
          strokeDasharray="2 3"
        />
      </svg>
    );
  }

  const values = valid.map((s) => s.v);
  const max = Math.max(...values);
  const min = baseline === "zero" ? 0 : Math.min(...values);
  const range = Math.max(0.0001, max - min);

  const stepX = width / Math.max(1, valid.length - 1);
  const points = valid.map((s, i) => {
    const x = i * stepX;
    const norm = (s.v - min) / range;
    const y = height - 4 - norm * (height - 8);
    return [x, y] as const;
  });

  const linePath = points
    .map(([x, y], i) => (i === 0 ? `M ${x.toFixed(2)} ${y.toFixed(2)}` : `L ${x.toFixed(2)} ${y.toFixed(2)}`))
    .join(" ");

  const areaPath = fill
    ? `${linePath} L ${(width).toFixed(2)} ${height} L 0 ${height} Z`
    : null;

  const color = COLORS[severity];
  const lastY = points[points.length - 1][1];
  const lastX = points[points.length - 1][0];

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      role="img"
      aria-label={ariaLabel ?? "Tendencia reciente"}
    >
      {areaPath && (
        <path
          d={areaPath}
          fill={color}
          fillOpacity={0.08}
          className="t-spark-path"
        />
      )}
      <path
        d={linePath}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
        className="t-spark-path"
      />
      <circle cx={lastX} cy={lastY} r={2} fill={color} />
    </svg>
  );
}
