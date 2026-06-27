"use client";

import { cn } from "@/app/lib/utils";
import { PulseDot } from "@/app/_components/motion/PulseDot";

type Severity = "ok" | "warn" | "crit" | "info";

interface SeverityBadgeProps {
  severity: Severity;
  label?: string;
  size?: "sm" | "md";
}

const severityConfig: Record<
  Severity,
  {
    container: string;
    dot: "success" | "warning" | "error" | "cyan";
    defaultLabel: string;
  }
> = {
  ok: {
    container: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    dot: "success",
    defaultLabel: "OK",
  },
  warn: {
    container: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    dot: "warning",
    defaultLabel: "Warn",
  },
  crit: {
    container: "bg-rose-500/10 text-rose-400 border-rose-500/20",
    dot: "error",
    defaultLabel: "Crítico",
  },
  info: {
    container: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
    dot: "cyan",
    defaultLabel: "Info",
  },
};

const dotSize: Record<"sm" | "md", number> = {
  sm: 6,
  md: 8,
};

export function SeverityBadge({
  severity,
  label,
  size = "md",
}: SeverityBadgeProps) {
  const { container, dot, defaultLabel } = severityConfig[severity];
  const displayLabel = label ?? defaultLabel;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border",
        "text-[10px] font-semibold tracking-wide",
        container,
      )}
    >
      <PulseDot color={dot} size={dotSize[size]} />
      {displayLabel}
    </span>
  );
}
