"use client";

import useSWR from "swr";
import { homeService } from "@/app/lib/services/homeService";
import { getBotRuntime } from "@/app/lib/services/botConfigService";

export function useOverview() {
  return useSWR("home:overview", () => homeService.getOverview(), {
    revalidateOnFocus: false,
    dedupingInterval: 120_000,
  });
}

export function useStatsHistory(days: 7 | 30 | 90 = 7) {
  return useSWR(
    ["home:stats-history", days],
    () => homeService.getStatsHistory(days),
    { revalidateOnFocus: false, dedupingInterval: 300_000 },
  );
}

export function useHandoffStats() {
  return useSWR("home:handoff-stats", () => homeService.getHandoffStats(), {
    revalidateOnFocus: false,
    dedupingInterval: 120_000,
  });
}

export function useRecentConversations(limit = 5) {
  return useSWR(
    ["home:recent-convos", limit],
    () => homeService.getRecentConversations(limit),
    { revalidateOnFocus: false, dedupingInterval: 60_000 },
  );
}

export function useHomeBotRuntime() {
  return useSWR("home:bot-runtime", getBotRuntime, {
    revalidateOnFocus: false,
    dedupingInterval: 300_000,
  });
}
