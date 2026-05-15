"use client";

import { cn } from "@/app/lib/utils";

type PulseDotProps = {
  color?: "primary" | "success" | "warning" | "error" | "amber" | "violet" | "cyan" | "magenta";
  size?: number;
  className?: string;
};

const colorMap = {
  primary: "bg-primary",
  success: "bg-success",
  warning: "bg-warning",
  error: "bg-error",
  amber: "bg-amber",
  violet: "bg-accent-violet",
  cyan: "bg-accent-cyan",
  magenta: "bg-accent-magenta",
};

export function PulseDot({ color = "success", size = 8, className }: PulseDotProps) {
  return (
    <span
      className={cn("relative inline-flex", className)}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <span
        className={cn(
          "absolute inset-0 rounded-full animate-ping",
          colorMap[color],
          "opacity-60"
        )}
      />
      <span
        className={cn("relative inline-flex rounded-full", colorMap[color])}
        style={{ width: size, height: size }}
      />
    </span>
  );
}
