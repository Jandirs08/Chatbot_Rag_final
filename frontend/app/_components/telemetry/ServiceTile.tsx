"use client";

import React from "react";
import { HealthGlyph, type Severity } from "./HealthGlyph";
import { Sparkline } from "./Sparkline";
import { HelpTooltip } from "./HelpTooltip";
import { Badge } from "@/app/components/ui/badge";
import type { Sample } from "@/app/hooks/useRingBuffer";

type Variant = "db" | "cache" | "vector" | "engine";

interface Props {
  name: string;
  variant: Variant;
  severity: Severity;
  primary: string;
  secondary?: string;
  tertiary?: string;
  samples?: Sample[];
  className?: string;
  tooltip?: React.ReactNode;
}

const BADGE_VARIANT: Record<Severity, "success" | "warning" | "destructive" | "outline"> = {
  ok: "success",
  warn: "warning",
  crit: "destructive",
  info: "outline",
};

const STATUS_TEXT: Record<Severity, string> = {
  ok: "Conectado",
  warn: "Degradado",
  crit: "Crítico",
  info: "Sin datos",
};

const ICONS: Record<Variant, React.ReactNode> = {
  db: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <ellipse cx="7" cy="3" rx="5" ry="1.7" stroke="currentColor" strokeWidth="1.2" />
      <path d="M2 3v8c0 .94 2.24 1.7 5 1.7s5-.76 5-1.7V3" stroke="currentColor" strokeWidth="1.2" />
      <path d="M2 7c0 .94 2.24 1.7 5 1.7s5-.76 5-1.7" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  ),
  cache: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <rect x="2" y="3" width="10" height="8" rx="1" stroke="currentColor" strokeWidth="1.2" />
      <path d="M2 6.5h10M2 8.5h10" stroke="currentColor" strokeWidth="0.9" />
    </svg>
  ),
  vector: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="7" cy="7" r="1.4" fill="currentColor" />
      <circle cx="3.5" cy="4.5" r="0.8" fill="currentColor" />
      <circle cx="10.5" cy="6" r="0.8" fill="currentColor" />
      <circle cx="9" cy="10.5" r="0.8" fill="currentColor" />
      <circle cx="4.2" cy="9.5" r="0.8" fill="currentColor" />
    </svg>
  ),
  engine: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M7 1.5L9 5.5L13 6L10 9L10.7 13L7 11L3.3 13L4 9L1 6L5 5.5L7 1.5Z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
    </svg>
  ),
};

export function ServiceTile({ name, variant, severity, primary, secondary, tertiary, samples, className, tooltip }: Props) {
  return (
    <div className={`t-tile flex flex-col gap-3 ${className ?? ""}`} data-severity={severity}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2" style={{ color: "var(--t-ink-soft)" }}>
          {ICONS[variant]}
          <span className="t-label" style={{ color: "var(--t-ink-mid)" }}>{name}</span>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={BADGE_VARIANT[severity]} className="text-xs">
            {STATUS_TEXT[severity]}
          </Badge>
          {tooltip && <HelpTooltip content={tooltip} />}
        </div>
      </div>

      <div className="flex items-end gap-3">
        <span className="t-mono-xl" data-severity={severity}>{primary}</span>
        {samples && samples.length >= 2 && (
          <span className="pb-1">
            <Sparkline samples={samples} severity={severity} width={80} height={20} />
          </span>
        )}
      </div>

      {(secondary || tertiary) && (
        <div className="flex items-center gap-3 text-[11px]" style={{ color: "var(--t-ink-soft)" }}>
          {secondary && <span className="t-mono-sm">{secondary}</span>}
          {tertiary && <span className="t-mono-sm">· {tertiary}</span>}
        </div>
      )}
    </div>
  );
}
