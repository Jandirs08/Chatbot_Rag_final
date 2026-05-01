"use client";

import React from "react";
import { cn } from "@/lib/utils";

interface DashboardStatsProps {
  stats: {
    total_queries: number;
    total_users: number;
    total_pdfs: number;
  };
  isLoading: boolean;
}

function useCountUp(target: number, duration = 700) {
  const [val, setVal] = React.useState(0);
  const prefersReduced = React.useRef(
    typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  React.useEffect(() => {
    if (prefersReduced.current) { setVal(target); return; }
    if (target === 0) { setVal(0); return; }
    let raf: number;
    const start = performance.now();
    const tick = (ts: number) => {
      const p = Math.min((ts - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 4);
      setVal(Math.round(eased * target));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);

  return val;
}

const fmt = (n: number) =>
  n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, "") + "k" : String(n);

function StatItem({
  value,
  label,
  isLoading,
  delay,
}: {
  value: number;
  label: string;
  isLoading: boolean;
  delay: number;
}) {
  const animated = useCountUp(isLoading ? 0 : value);
  const target = isLoading ? 0 : value;
  const prevTarget = React.useRef<number>(target);
  const [flashing, setFlashing] = React.useState(false);

  React.useEffect(() => {
    if (prevTarget.current !== 0 && target !== prevTarget.current) {
      setFlashing(true);
      const t = setTimeout(() => setFlashing(false), 300);
      prevTarget.current = target;
      return () => clearTimeout(t);
    }
    prevTarget.current = target;
  }, [target]);

  return (
    <div
      className="animate-count-reveal"
      style={{ animationDelay: `${delay}ms` }}
    >
      {isLoading ? (
        <div className="h-9 w-20 animate-pulse rounded bg-muted mb-1.5" />
      ) : (
        <p className={cn(
          "text-3xl font-semibold font-heading tabular-nums text-foreground leading-none",
          flashing && "animate-num-flash"
        )}>
          {fmt(animated)}
        </p>
      )}
      <p className="mt-1.5 text-[11px] font-heading font-medium uppercase tracking-[0.08em] text-muted-foreground/50">
        {label}
      </p>
    </div>
  );
}

export default function DashboardStats({ stats, isLoading }: DashboardStatsProps) {
  const items = [
    { label: "Mensajes", value: stats.total_queries, delay: 0 },
    { label: "Usuarios", value: stats.total_users, delay: 80 },
    { label: "Documentos", value: stats.total_pdfs, delay: 160 },
  ];

  return (
    <section className="flex flex-wrap items-end gap-x-8 gap-y-6 sm:gap-x-12">
      {items.map((item, i) => (
        <React.Fragment key={item.label}>
          <StatItem
            value={item.value}
            label={item.label}
            isLoading={isLoading}
            delay={item.delay}
          />
          {i < items.length - 1 && (
            <div
              className="hidden sm:block self-stretch w-px bg-border/60 my-1"
              aria-hidden="true"
            />
          )}
        </React.Fragment>
      ))}
    </section>
  );
}
