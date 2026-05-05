"use client";

import React from "react";

export interface GatingItem {
  key: string;
  label: string;
  count: number;
}

interface Props {
  items: GatingItem[];
  total: number;
}

export function GatingBars({ items, total }: Props) {
  if (items.length === 0 || total === 0) {
    return <p className="t-small">Sin eventos en la ventana actual.</p>;
  }

  const max = Math.max(...items.map((i) => i.count), 1);
  const sorted = [...items].sort((a, b) => b.count - a.count);

  return (
    <div className="space-y-2">
      {sorted.map((item) => {
        const widthPct = (item.count / max) * 100;
        const sharePct = (item.count / total) * 100;
        return (
          <div key={item.key} className="grid grid-cols-[1fr_3.5rem_3rem] items-center gap-3">
            <div className="relative h-5 rounded-sm overflow-hidden" style={{ background: "var(--t-surface)" }}>
              <div
                className="absolute inset-y-0 left-0 transition-[width] duration-500"
                style={{ width: `${widthPct}%`, background: "var(--t-data)", opacity: 0.45 }}
              />
              <span
                className="absolute inset-y-0 left-2 flex items-center text-[12px] font-medium"
                style={{ color: "var(--t-ink)" }}
              >
                {item.label}
              </span>
            </div>
            <span className="t-mono text-right">{item.count}</span>
            <span className="t-mono-sm text-right">{sharePct.toFixed(0)}%</span>
          </div>
        );
      })}
    </div>
  );
}
