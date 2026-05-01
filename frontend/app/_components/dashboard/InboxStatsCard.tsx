"use client";

import React from "react";
import useSWR from "swr";
import { API_URL } from "@/app/lib/config";
import { authenticatedJsonFetcher } from "@/app/lib/services/authService";
import type { HandoffStats } from "@/app/lib/services/inboxService";
import { cn } from "@/lib/utils";

const fetcher = (url: string): Promise<HandoffStats> =>
  authenticatedJsonFetcher<HandoffStats>(url, "Error fetching inbox stats");

const REASONS = [
  {
    key: "user_request" as const,
    label: "Pedido",
    dotClass: "bg-sky-500",
    numClass: "text-sky-700 dark:text-sky-400",
  },
  {
    key: "low_confidence" as const,
    label: "Baja confianza",
    dotClass: "bg-amber-500",
    numClass: "text-amber-700 dark:text-amber-400",
  },
  {
    key: "out_of_scope" as const,
    label: "Fuera de alcance",
    dotClass: "bg-violet-500",
    numClass: "text-violet-700 dark:text-violet-400",
  },
];

interface InboxStatsCardProps {
  enabled?: boolean;
  days?: number;
}

export function InboxStatsCard({
  enabled = true,
  days = 30,
}: InboxStatsCardProps) {
  const { data, isLoading } = useSWR<HandoffStats>(
    enabled ? `${API_URL}/inbox/handoff-stats?days=${days}` : null,
    fetcher,
    { refreshInterval: 30000, revalidateOnFocus: true },
  );

  const period = data?.period_days ?? days;
  const total = data?.total ?? 0;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-4 gap-y-2 transition-opacity",
        isLoading && !data && "opacity-50",
      )}
    >
      {/* Total */}
      <div className="flex items-baseline gap-1.5">
        <span className="font-mono text-2xl font-bold leading-none text-foreground">
          {total}
        </span>
        <span className="text-[11px] font-medium text-muted-foreground">
          inbox / {period}d
        </span>
      </div>

      <div className="h-5 w-px bg-border/70" />

      {/* Per-reason stats */}
      {REASONS.map((r) => {
        const value = data?.[r.key] ?? 0;
        return (
          <div key={r.key} className="flex items-center gap-2">
            <span className={cn("h-2 w-2 rounded-full flex-none", r.dotClass)} />
            <span className={cn("font-mono text-sm font-bold", r.numClass)}>
              {value}
            </span>
            <span className="text-[11px] text-muted-foreground">{r.label}</span>
          </div>
        );
      })}
    </div>
  );
}
