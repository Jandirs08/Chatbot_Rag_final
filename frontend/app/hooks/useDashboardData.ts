"use client";

import useSWR, { type SWRConfiguration } from "swr";
import { botService, type BotState } from "@/app/lib/services/botService";
import {
  statsService,
  type HistoryPoint,
  type Stats,
} from "@/app/lib/services/statsService";
import {
  BOT_STATE_SWR_KEY,
  DASHBOARD_STATS_SWR_KEY,
  buildStatsHistorySWRKey,
  type StatsHistorySWRKey,
} from "@/app/lib/swrKeys";

interface UseSWRDataOptions<Data>
  extends Omit<SWRConfiguration<Data, Error>, "fetcher"> {
  enabled?: boolean;
}

export function useBotState(options: UseSWRDataOptions<BotState> = {}) {
  const { enabled = true, ...swrOptions } = options;

  return useSWR<BotState, Error>(
    enabled ? BOT_STATE_SWR_KEY : null,
    () => botService.getState(),
    swrOptions,
  );
}

export function useDashboardStats(options: UseSWRDataOptions<Stats> = {}) {
  const { enabled = true, ...swrOptions } = options;

  return useSWR<Stats, Error>(
    enabled ? DASHBOARD_STATS_SWR_KEY : null,
    () => statsService.getStats(),
    swrOptions,
  );
}

export function useStatsHistory(
  days: number,
  options: UseSWRDataOptions<HistoryPoint[]> = {},
) {
  const { enabled = true, ...swrOptions } = options;
  const key = buildStatsHistorySWRKey(days, enabled);

  return useSWR<HistoryPoint[], Error>(
    key,
    ([, selectedDays]: StatsHistorySWRKey) => statsService.getHistory(selectedDays),
    swrOptions,
  );
}
