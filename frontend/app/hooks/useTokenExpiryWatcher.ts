"use client";

import { useEffect } from "react";
import { useAuth } from "@/app/hooks/useAuth";
import { authService, TokenManager } from "@/app/lib/services/authService";
import { logger } from "@/app/lib/logger";

const CHECK_INTERVAL_MS = 60_000;
const REFRESH_THRESHOLD_MS = 2 * 60_000;

export function useTokenExpiryWatcherWithFlag(isAuthenticated: boolean) {
  useEffect(() => {
    if (!isAuthenticated) return;

    let cancelled = false;
    let refreshing = false;

    const tick = async () => {
      if (cancelled || refreshing) return;
      if (typeof document !== "undefined" && document.visibilityState !== "visible") {
        return;
      }

      const expiry = TokenManager.getExpiryTime();
      if (expiry === null) return;

      const remaining = expiry - Date.now();
      if (remaining > REFRESH_THRESHOLD_MS) return;

      refreshing = true;
      try {
        await authService.refreshToken({ silent: true });
      } catch (error) {
        logger.warn("Proactive token refresh failed:", error);
      } finally {
        refreshing = false;
      }
    };

    const interval = window.setInterval(() => {
      void tick();
    }, CHECK_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [isAuthenticated]);
}

export function useTokenExpiryWatcher() {
  const { isAuthenticated } = useAuth();
  useTokenExpiryWatcherWithFlag(isAuthenticated);
}
