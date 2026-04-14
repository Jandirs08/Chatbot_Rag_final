import type { ListUsersParams } from "@/app/lib/services/userService";

export const BOT_CONFIG_SWR_KEY = "bot-config";
export const BOT_STATE_SWR_KEY = "bot-state";
export const DASHBOARD_STATS_SWR_KEY = "dashboard-stats";
export const STATS_HISTORY_SWR_KEY = "stats-history";
export const USERS_SWR_KEY = "users";

export interface NormalizedUsersSWRParams {
  skip: number;
  limit: number;
  search: string;
  role: "" | "admin" | "user";
  is_active: boolean | "all";
}

export type UsersSWRKey = readonly [
  typeof USERS_SWR_KEY,
  NormalizedUsersSWRParams,
];

export type StatsHistorySWRKey = readonly [typeof STATS_HISTORY_SWR_KEY, number];

export function normalizeUsersSWRParams(
  params: ListUsersParams = {},
): NormalizedUsersSWRParams {
  return {
    skip: params.skip ?? 0,
    limit: params.limit ?? 10,
    search: params.search?.trim() ?? "",
    role: params.role ?? "",
    is_active:
      typeof params.is_active === "boolean" ? params.is_active : "all",
  };
}

export function buildUsersSWRKey(
  params: ListUsersParams = {},
  enabled = true,
): UsersSWRKey | null {
  if (!enabled) {
    return null;
  }

  return [USERS_SWR_KEY, normalizeUsersSWRParams(params)];
}

export function buildStatsHistorySWRKey(
  days: number,
  enabled = true,
): StatsHistorySWRKey | null {
  if (!enabled) {
    return null;
  }

  return [STATS_HISTORY_SWR_KEY, days];
}
