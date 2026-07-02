"use client";

import { MetricCard } from "@/app/_components/shared/MetricCard";
import { Skeleton } from "@/app/components/ui/skeleton";

type KpiColor = "teal" | "indigo" | "cyan" | "emerald" | "amber";

interface KpiCardProps {
  label: string;
  value: number;
  total?: number;
  color: KpiColor;
  sparklineData: number[];
  loading?: boolean;
}

const hoverColorMap: Record<KpiColor, string> = {
  teal: "hover:border-primary/25",
  indigo: "hover:border-accent-violet/25",
  cyan: "hover:border-accent-cyan/25",
  emerald: "hover:border-success/25",
  amber: "hover:border-amber/25",
};

export function KpiCard({
  label,
  value,
  total,
  color,
  sparklineData,
  loading = false,
}: KpiCardProps) {
  const sub = total != null ? `${total.toLocaleString()} total` : undefined;

  if (loading) {
    return (
      <div className="bg-card rounded-xl border border-border shadow-sm p-4 h-full">
        <Skeleton className="h-2.5 w-20 mb-4" />
        <Skeleton className="h-10 w-28" />
      </div>
    );
  }

  return (
    <div className={`relative transition-colors ${hoverColorMap[color]}`}>
      <MetricCard
        label={label}
        value={value}
        sub={sub}
        variant="hero"
        color={color}
        sparklineData={sparklineData}
      />
    </div>
  );
}
