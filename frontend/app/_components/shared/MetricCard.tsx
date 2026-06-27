"use client";

import { cn } from "@/app/lib/utils";
import { FadeIn } from "@/app/_components/motion/FadeIn";
import { Sparkline } from "@/app/_components/charts/Sparkline";

type Variant = "hero" | "compact" | "mini";
type Color = "indigo" | "cyan" | "emerald" | "amber" | "default";

interface MetricCardProps {
  label: string;
  value: string | number;
  sub?: string;
  variant?: Variant;
  color?: Color;
  sparklineData?: number[];
  trend?: { value: number; up: boolean };
  className?: string;
}

const colorConfig: Record<
  Color,
  { text: string; gradient: string; sparkline: string }
> = {
  indigo: {
    text: "text-violet-400",
    gradient: "from-violet-500/60 via-violet-500/20 to-transparent",
    sparkline: "hsl(255 75% 60%)",
  },
  cyan: {
    text: "text-cyan-400",
    gradient: "from-cyan-500/60 via-cyan-500/20 to-transparent",
    sparkline: "hsl(188 90% 42%)",
  },
  emerald: {
    text: "text-emerald-400",
    gradient: "from-emerald-500/60 via-emerald-500/20 to-transparent",
    sparkline: "hsl(154 65% 45%)",
  },
  amber: {
    text: "text-amber-400",
    gradient: "from-amber-500/60 via-amber-500/20 to-transparent",
    sparkline: "hsl(38 85% 52%)",
  },
  default: {
    text: "text-foreground",
    gradient: "from-border/60 via-border/20 to-transparent",
    sparkline: "hsl(var(--primary))",
  },
};

const valueSize: Record<Variant, string> = {
  hero: "text-5xl tracking-tight",
  compact: "text-3xl",
  mini: "text-lg inline",
};

export function MetricCard({
  label,
  value,
  sub,
  variant = "compact",
  color = "default",
  sparklineData,
  trend,
  className,
}: MetricCardProps) {
  const { text, gradient, sparkline } = colorConfig[color];
  const showSparkline =
    variant === "hero" && sparklineData && sparklineData.length >= 2;

  return (
    <FadeIn className={cn("h-full", className)}>
      <div className="bg-card rounded-xl border border-border shadow-sm p-4 relative overflow-hidden h-full flex flex-col">
        {/* Bottom accent line */}
        <span
          className={cn(
            "absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r",
            gradient,
          )}
          aria-hidden="true"
        />

        {/* Label */}
        <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground font-semibold mb-3">
          {label}
        </p>

        {/* Value */}
        <p
          className={cn(
            "font-heading font-bold tabular-nums leading-none",
            text,
            valueSize[variant],
          )}
        >
          {value}
        </p>

        {/* Sub */}
        {sub && <p className="text-[11px] text-muted-foreground mt-1">{sub}</p>}

        {/* Trend badge */}
        {trend && (
          <p
            className={cn(
              "text-[11px] font-semibold mt-1.5",
              trend.up ? "text-emerald-400" : "text-rose-400",
            )}
          >
            {trend.up ? "▲" : "▼"} {Math.abs(trend.value)}%
          </p>
        )}

        {/* Sparkline (hero only) */}
        {showSparkline && (
          <div className="mt-3">
            <Sparkline
              data={sparklineData!}
              width={120}
              height={32}
              color={sparkline}
              className="w-full"
            />
          </div>
        )}
      </div>
    </FadeIn>
  );
}
