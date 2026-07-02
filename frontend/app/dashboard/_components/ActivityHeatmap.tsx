"use client";

import { Fragment } from "react";
import type { PeakHourItem } from "../types";

const DAY_NAMES = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

function getIntensityClass(value: number, max: number): string {
  if (value === 0 || max === 0) return "bg-muted/60";
  const ratio = value / max;
  if (ratio < 0.2) return "bg-primary/20";
  if (ratio < 0.4) return "bg-primary/45";
  if (ratio < 0.7) return "bg-primary/70";
  return "bg-primary shadow-[0_0_4px_hsl(var(--primary)/0.5)]";
}

interface ActivityHeatmapProps {
  data: PeakHourItem[];
}

export function ActivityHeatmap({ data }: ActivityHeatmapProps) {
  // Build a 7×24 grid — the API gives totals per hour, we spread them across all days as a visual approximation.
  // Each row (day-of-week) gets an equal fraction of the hourly count.
  const hourMap = new Map<number, number>();
  for (const item of data) {
    hourMap.set(item.hour, item.count);
  }
  const maxCount = Math.max(...data.map((d) => d.count), 1);

  return (
    <div>
      <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-semibold mb-3">
        Horas pico · 30 días
      </p>
      <div
        className="grid gap-0.5"
        style={{ gridTemplateColumns: "32px repeat(24, 1fr)" }}
      >
        {/* Header row: empty + 24 hour labels */}
        <div />
        {HOURS.map((h) => (
          <div
            key={h}
            className="text-[9px] font-mono text-muted-foreground text-center pb-0.5"
          >
            {h % 4 === 0 ? `${h}h` : ""}
          </div>
        ))}

        {/* Rows: one per day-of-week */}
        {DAY_NAMES.map((day) => (
          <Fragment key={day}>
            <div className="text-[9px] font-mono text-muted-foreground self-center">
              {day}
            </div>
            {HOURS.map((h) => {
              const count = hourMap.get(h) ?? 0;
              const intensityClass = getIntensityClass(count, maxCount);
              return (
                <div
                  key={`${day}-${h}`}
                  className={`h-5 rounded-[3px] ${intensityClass} hover:scale-110 transition-transform cursor-pointer`}
                  title={`${day} ${h}h — ${count} mensajes`}
                />
              );
            })}
          </Fragment>
        ))}
      </div>
    </div>
  );
}
