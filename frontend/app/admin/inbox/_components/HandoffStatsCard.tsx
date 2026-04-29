"use client";

import React from "react";
import useSWR from "swr";
import { API_URL } from "@/app/lib/config";
import { authenticatedFetch } from "@/app/lib/services/authService";
import type { HandoffStats } from "@/app/lib/services/inboxService";
import { cn } from "@/lib/utils";

const fetcher = async (url: string): Promise<HandoffStats> => {
  const res = await authenticatedFetch(url, { method: "GET" });
  if (!res.ok) throw new Error("Error fetching handoff stats");
  return res.json();
};

const REASONS: Array<{
  key: keyof Pick<HandoffStats, "user_request" | "low_confidence" | "out_of_scope">;
  label: string;
  className: string;
}> = [
  {
    key: "user_request",
    label: "Pedido del usuario",
    className:
      "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-400",
  },
  {
    key: "low_confidence",
    label: "Baja confianza",
    className:
      "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-400",
  },
  {
    key: "out_of_scope",
    label: "Fuera de alcance",
    className:
      "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900/60 dark:bg-violet-950/30 dark:text-violet-400",
  },
];

interface HandoffStatsCardProps {
  enabled?: boolean;
  days?: number;
}

export function HandoffStatsCard({ enabled = true, days = 30 }: HandoffStatsCardProps) {
  const { data, isLoading } = useSWR<HandoffStats>(
    enabled ? `${API_URL}/inbox/handoff-stats?days=${days}` : null,
    fetcher,
    { refreshInterval: 30000, revalidateOnFocus: true },
  );

  const period = data?.period_days ?? days;
  const total = data?.total ?? 0;

  return (
    <div className="rounded-2xl border border-border/60 bg-card/80 px-4 py-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          Handoffs · últimos {period}d
        </span>
        <span className="text-[11px] font-medium text-muted-foreground">
          Total: <span className="text-foreground">{total}</span>
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {REASONS.map((r) => {
          const value = data?.[r.key] ?? 0;
          return (
            <div
              key={r.key}
              className={cn(
                "rounded-xl border px-3 py-2 transition-opacity",
                r.className,
                isLoading && !data && "opacity-60",
              )}
            >
              <div className="text-[10px] font-semibold uppercase tracking-wide opacity-80">
                {r.label}
              </div>
              <div className="mt-0.5 text-xl font-semibold leading-tight">
                {value}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
