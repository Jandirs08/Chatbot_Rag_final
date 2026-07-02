"use client";

import type { HandoffStatsData } from "../types";

interface HandoffSectionProps {
  data: HandoffStatsData;
}

const BARS = [
  {
    key: "user_request" as const,
    label: "Solicitud de usuario",
    colorBar: "bg-gradient-to-r from-accent-violet/80 to-accent-violet",
    colorText: "text-accent-violet",
  },
  {
    key: "low_confidence" as const,
    label: "Bot sin confianza",
    colorBar: "bg-gradient-to-r from-accent-cyan/80 to-accent-cyan",
    colorText: "text-accent-cyan",
  },
  {
    key: "out_of_scope" as const,
    label: "Fuera de alcance",
    colorBar: "bg-gradient-to-r from-amber/80 to-amber",
    colorText: "text-amber",
  },
];

export function HandoffSection({ data }: HandoffSectionProps) {
  const total = data.total ?? 0;

  return (
    <div>
      <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-semibold mb-4">
        Escalaciones · {data.period_days ?? 30} días
      </p>

      {total === 0 ? (
        <p className="text-sm text-muted-foreground italic">
          Sin escalaciones en el período.
        </p>
      ) : (
        <div className="space-y-4">
          {BARS.map(({ key, label, colorBar, colorText }) => {
            const value = data[key] ?? 0;
            const pct = total > 0 ? Math.round((value / total) * 100) : 0;
            return (
              <div key={key}>
                <div className="flex items-baseline justify-between mb-1.5">
                  <span className="text-sm text-muted-foreground">{label}</span>
                  <span
                    className={`font-bold font-mono text-sm tabular-nums ${colorText}`}
                  >
                    {value}
                    <span className="text-[11px] ml-1.5 text-muted-foreground">
                      ({pct}%)
                    </span>
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full rounded-full origin-left ${colorBar}`}
                    style={{
                      transform: `scaleX(${pct / 100})`,
                      transition:
                        "transform 700ms cubic-bezier(0.16, 1, 0.3, 1)",
                    }}
                  />
                </div>
              </div>
            );
          })}
          <p className="font-mono text-[11px] text-muted-foreground pt-1 tabular-nums">
            {total} escalaciones en total
          </p>
        </div>
      )}
    </div>
  );
}
