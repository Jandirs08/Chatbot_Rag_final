"use client";

import React from "react";
import { Sparkline } from "./Sparkline";
import { HelpTooltip } from "./HelpTooltip";
import type { Sample } from "@/app/hooks/useRingBuffer";
import type { Severity } from "./HealthGlyph";

interface Props {
  label: string;
  value: string;
  sub?: string;
  severity?: Severity;
  samples?: Sample[];
  hero?: boolean;
  tooltip?: React.ReactNode;
}

/**
 * Single metric with sparkline. Hero = bigger display + wider chart.
 * No glow, no count-up, no card border.
 */
export function TelemetryMetric({ label, value, sub, severity = "ok", samples, hero = false, tooltip }: Props) {
  return (
    <div className="flex flex-col gap-2 min-w-0">
      <div className="flex items-center gap-1.5">
        <span className="t-label">{label}</span>
        {tooltip && <HelpTooltip content={tooltip} />}
      </div>
      <div className="flex items-end gap-3">
        <span
          key={value}
          className={hero ? "t-display t-num-fade" : "t-mono-xl t-num-fade"}
          data-severity={severity}
        >
          {value}
        </span>
        {samples && samples.length >= 2 && (
          <span className="pb-1.5">
            <Sparkline
              samples={samples}
              severity={severity}
              width={hero ? 240 : 90}
              height={hero ? 56 : 22}
              fill={hero}
            />
          </span>
        )}
      </div>
      {sub && <span className="t-small">{sub}</span>}
    </div>
  );
}
