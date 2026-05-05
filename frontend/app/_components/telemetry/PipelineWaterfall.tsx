"use client";

import React from "react";
import type { Severity } from "./HealthGlyph";

export interface WaterfallStage {
  key: string;
  label: string;
  short: string;
  p50: number | null;
  p95: number | null;
  count: number;
  severity: Severity;
}

interface Props {
  stages: WaterfallStage[];
  total: number | null;
}

const fmtMs = (n: number | null | undefined) => {
  if (n == null) return "—";
  return n < 1000 ? `${Math.round(n)} ms` : `${(n / 1000).toFixed(n < 10000 ? 2 : 1)} s`;
};

export function PipelineWaterfall({ stages, total }: Props) {
  const stageTotal = stages.reduce((acc, s) => acc + (s.p50 ?? 0), 0);
  const denom = Math.max(stageTotal, 1);

  return (
    <div className="space-y-2">
      {stages.map((s) => {
        const pct = ((s.p50 ?? 0) / denom) * 100;
        return (
          <div
            key={s.key}
            className="grid grid-cols-[7.5rem_1fr_4.5rem_3.5rem] items-center gap-3 t-data-enter"
          >
            <span className="t-mono-sm">{s.label}</span>
            <div className="relative h-5 rounded-sm overflow-hidden" style={{ background: "var(--t-surface)" }}>
              <div
                className="absolute inset-y-0 left-0 transition-[width] duration-500"
                data-severity-bg={s.severity === "warn" || s.severity === "crit" ? s.severity : undefined}
                style={{
                  width: `${Math.max(2, pct)}%`,
                  background:
                    s.severity === "crit"
                      ? "var(--t-signal-deep)"
                      : s.severity === "warn"
                      ? "var(--t-signal)"
                      : "var(--t-data)",
                  opacity: s.severity === "ok" ? 0.55 : 0.85,
                }}
              />
            </div>
            <span className="t-mono text-right">{fmtMs(s.p50)}</span>
            <span className="t-mono-sm text-right">{pct.toFixed(0)}%</span>
          </div>
        );
      })}
      {total != null && (
        <div className="grid grid-cols-[7.5rem_1fr_4.5rem_3.5rem] items-center gap-3 pt-2 mt-1 border-t" style={{ borderColor: "var(--t-surface-edge)" }}>
          <span className="t-label">Total p50</span>
          <span />
          <span className="t-mono text-right">{fmtMs(total)}</span>
          <span />
        </div>
      )}
    </div>
  );
}
