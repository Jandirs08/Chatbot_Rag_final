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

const COLS = "8rem 1fr 5rem 4.5rem 3rem";

export function PipelineWaterfall({ stages, total }: Props) {
  // Scale bars relative to total pipeline so each stage shows its proportion.
  // Fall back to maxP95 if no valid p50s exist.
  const p50Sum = stages.reduce((acc, s) => acc + (s.p50 ?? 0), 0);
  const scaleBase = Math.max(p50Sum, ...stages.map((s) => s.p95 ?? 0), 1);

  return (
    <div>
      {/* Column headers */}
      <div
        className="grid items-center gap-3 px-2 pb-2 mb-1 border-b"
        style={{ gridTemplateColumns: COLS, borderColor: "var(--t-surface-edge)" }}
      >
        <span />
        <span />
        <span className="t-label text-right">p50</span>
        <span className="t-label text-right">p95</span>
        <span className="t-label text-right">n</span>
      </div>

      <div className="space-y-0.5">
        {stages.map((s) => {
          const p50Pct = s.p50 != null ? (s.p50 / scaleBase) * 100 : 0;
          const p95Pct = ((s.p95 ?? s.p50 ?? 0) / scaleBase) * 100;
          const barColor =
            s.severity === "crit"
              ? "var(--t-signal-deep)"
              : s.severity === "warn"
              ? "var(--t-signal)"
              : "var(--t-data)";
          const p50Opacity = s.severity === "ok" ? 0.7 : 0.9;

          return (
            <div
              key={s.key}
              className="grid items-center gap-3 px-2 py-2 rounded-md transition-colors duration-150 hover:bg-[var(--t-surface-deep)] cursor-default t-data-enter"
              style={{ gridTemplateColumns: COLS }}
            >
              <span className="t-mono">{s.label}</span>

              {/* Bar track */}
              <div
                className="relative h-6 rounded-sm overflow-hidden"
                style={{ background: "var(--t-surface)" }}
              >
                {/* p95 ghost extension — only when p50 has data */}
                {s.p50 != null && s.p95 != null && s.p95 > s.p50 && (
                  <div
                    className="absolute inset-y-0 left-0"
                    style={{
                      width: `${Math.max(2, p95Pct)}%`,
                      background: barColor,
                      opacity: p50Opacity * 0.28,
                    }}
                  />
                )}
                {/* p50 solid bar — skip when no data */}
                {s.p50 != null && (
                  <div
                    className="absolute inset-y-0 left-0 transition-[width] duration-500"
                    style={{
                      width: `${Math.max(2, p50Pct)}%`,
                      background: barColor,
                      opacity: p50Opacity,
                    }}
                  />
                )}
                {/* p95 tick */}
                {s.p50 != null && s.p95 != null && s.p95 !== s.p50 && p95Pct > p50Pct + 1 && (
                  <div
                    className="absolute inset-y-0"
                    style={{
                      left: `${Math.min(p95Pct, 99)}%`,
                      width: "1px",
                      background: barColor,
                      opacity: 0.55,
                    }}
                  />
                )}
              </div>

              <span className="t-mono text-right" data-severity={s.severity}>
                {fmtMs(s.p50)}
              </span>
              <span className="t-mono-sm text-right" style={{ color: "var(--t-ink-soft)" }}>
                {fmtMs(s.p95)}
              </span>
              <span className="t-mono-sm text-right" style={{ color: "var(--t-ink-mute)" }}>
                {s.count}
              </span>
            </div>
          );
        })}
      </div>

      {/* Total row */}
      {total != null && (
        <div
          className="grid items-center gap-3 px-2 pt-3 mt-2 border-t"
          style={{ gridTemplateColumns: COLS, borderColor: "var(--t-surface-edge)" }}
        >
          <span className="t-label">Total p50</span>
          <span />
          <span className="t-mono text-right">{fmtMs(total)}</span>
          <span />
          <span />
        </div>
      )}
    </div>
  );
}
