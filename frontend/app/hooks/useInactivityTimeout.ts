"use client";

import { useEffect, useRef, useCallback } from "react";
import { toast } from "sonner";
import { useAuth } from "@/app/hooks/useAuth";
import { usePathname } from "next/navigation";
import { isProtectedPath } from "@/app/lib/auth/routeAccess";

const IDLE_TIMEOUT_MS = 60 * 60 * 1000;  // 60 min idle → logout
const WARNING_BEFORE_MS = 2 * 60 * 1000; // warn 2 min before logout
const CHECK_MS = 30_000;                   // poll every 30 sec

const ACTIVITY_EVENTS = [
  "mousemove",
  "mousedown",
  "keydown",
  "touchstart",
  "scroll",
  "click",
] as const;

export function useInactivityTimeout() {
  const { isAuthenticated, logout } = useAuth();
  const pathname = usePathname();
  const enabled = isAuthenticated && isProtectedPath(pathname);

  const lastActiveRef = useRef(Date.now());
  const warningActiveRef = useRef(false);
  const warningToastIdRef = useRef<string | number | null>(null);
  const logoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismissWarning = useCallback(() => {
    if (warningToastIdRef.current !== null) {
      toast.dismiss(warningToastIdRef.current);
      warningToastIdRef.current = null;
    }
    if (logoutTimerRef.current !== null) {
      clearTimeout(logoutTimerRef.current);
      logoutTimerRef.current = null;
    }
    warningActiveRef.current = false;
  }, []);

  const doLogout = useCallback(async () => {
    dismissWarning();
    await logout();
  }, [logout, dismissWarning]);

  const showWarning = useCallback(
    (remainingMs: number) => {
      warningActiveRef.current = true;
      const minutes = Math.ceil(remainingMs / 60_000);

      const id = toast.warning("Tu sesión está a punto de expirar", {
        description:
          minutes > 1
            ? `Serás desconectado por inactividad en ${minutes} minutos.`
            : "Serás desconectado por inactividad en menos de 1 minuto.",
        duration: Infinity,
        action: {
          label: "Seguir en sesión",
          onClick: () => {
            lastActiveRef.current = Date.now();
            dismissWarning();
          },
        },
      });

      warningToastIdRef.current = id;
      // Precise logout after the exact remaining time
      logoutTimerRef.current = setTimeout(doLogout, remainingMs);
    },
    [dismissWarning, doLogout],
  );

  useEffect(() => {
    if (!enabled) {
      dismissWarning();
      return;
    }

    const onActivity = () => {
      lastActiveRef.current = Date.now();
      if (warningActiveRef.current) {
        dismissWarning();
      }
    };

    ACTIVITY_EVENTS.forEach((e) =>
      window.addEventListener(e, onActivity, { passive: true }),
    );

    const interval = setInterval(() => {
      const idleMs = Date.now() - lastActiveRef.current;
      const remainingMs = IDLE_TIMEOUT_MS - idleMs;

      if (warningActiveRef.current) return; // logout timer already running

      if (remainingMs <= 0) {
        doLogout();
      } else if (remainingMs <= WARNING_BEFORE_MS) {
        showWarning(remainingMs);
      }
    }, CHECK_MS);

    return () => {
      clearInterval(interval);
      ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, onActivity));
      dismissWarning();
    };
  }, [enabled, dismissWarning, doLogout, showWarning]);
}
