"use client";

import { MetricCard } from "@/app/_components/shared/MetricCard";

type KpiColor = "indigo" | "cyan" | "emerald" | "amber";

interface KpiCardProps {
  label: string;
  value: number;
  total?: number;
  color: KpiColor;
  sparklineData: number[];
}

const hoverColorMap: Record<KpiColor, string> = {
  indigo: "hover:border-violet-500/20",
  cyan: "hover:border-cyan-500/20",
  emerald: "hover:border-emerald-500/20",
  amber: "hover:border-amber-500/20",
};

export function KpiCard({
  label,
  value,
  total,
  color,
  sparklineData,
}: KpiCardProps) {
  const sub = total != null ? `${total.toLocaleString()} total` : undefined;

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
