"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import { useSWRConfig } from "swr";
import { logger } from "@/app/lib/logger";
import type { AuthSessionSnapshot } from "@/app/lib/auth/session";
import {
  AUTH_SESSION_EXPIRED_EVENT,
  AUTH_STATE_INVALIDATED_EVENT,
  ApiError,
  authService,
  TokenManager,
} from "@/app/lib/services/authService";
import { isPublicPath } from "@/app/lib/auth/routeAccess";
import { useTokenExpiryWatcherWithFlag } from "@/app/hooks/useTokenExpiryWatcher";
import type { User } from "@/app/lib/services/authService";

export interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isInitialized: boolean;
  error: string | null;
}

export interface AuthContextType extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshAuth: () => Promise<void>;
  clearError: () => void;
  checkAuthStatus: () => Promise<void>;
}

type AuthAction =
  | { type: "AUTH_START" }
  | {
      type: "AUTH_SUCCESS";
      payload: {
        user: User;
        token: string | null;
      };
    }
  | { type: "AUTH_FAILURE"; payload: string }
  | { type: "AUTH_LOGOUT" }
  | { type: "CLEAR_ERROR" }
  | { type: "AUTH_RETRYABLE_FAILURE"; payload: string }
  | { type: "SET_LOADING"; payload: boolean };

function createAuthState(
  initialSession: AuthSessionSnapshot | null | undefined,
): AuthState {
  if (!initialSession) {
    return {
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
      isInitialized: false,
      error: null,
    };
  }

  return {
    user: initialSession.user,
    token: initialSession.accessToken,
    isAuthenticated: true,
    isLoading: false,
    isInitialized: true,
    error: null,
  };
}

function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case "AUTH_START":
      return {
        ...state,
        isLoading: true,
        error: null,
      };

    case "AUTH_SUCCESS":
      return {
        ...state,
        user: action.payload.user,
        token: action.payload.token,
        isAuthenticated: true,
        isLoading: false,
        isInitialized: true,
        error: null,
      };

    case "AUTH_FAILURE":
      return {
        ...state,
        user: null,
        token: null,
        isAuthenticated: false,
        isLoading: false,
        isInitialized: true,
        error: action.payload,
      };

    case "AUTH_LOGOUT":
      return {
        user: null,
        token: null,
        isAuthenticated: false,
        isLoading: false,
        isInitialized: true,
        error: null,
      };

    case "AUTH_RETRYABLE_FAILURE":
      return {
        ...state,
        user: null,
        token: null,
        isAuthenticated: false,
        isLoading: false,
        isInitialized: false,
        error: action.payload,
      };

    case "CLEAR_ERROR":
      return {
        ...state,
        error: null,
      };

    case "SET_LOADING":
      return {
        ...state,
        isLoading: action.payload,
      };

    default:
      return state;
  }
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function getLoginErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) {
      const inactive = error.message.toLowerCase().includes("inactive");
      return inactive
        ? "Tu usuario está inactivo. Pide a un administrador que reactive la cuenta."
        : "Correo o contraseña incorrectos. Revisa los datos e inténtalo otra vez.";
    }

    if (error.status === 403) {
      return "No tienes permisos para entrar al panel. Usa una cuenta autorizada.";
    }

    if (error.status === 429) {
      return "Demasiados intentos seguidos. Espera un momento antes de volver a intentar.";
    }

    if (error.status >= 500) {
      return "El servidor no pudo procesar el inicio de sesión. Revisa que el backend esté activo.";
    }

    return (
      error.message ||
      "No se pudo iniciar sesión. Revisa los datos e inténtalo otra vez."
    );
  }

  if (error instanceof DOMException && error.name === "AbortError") {
    return "Estamos tardando más de lo normal. Inténtalo nuevamente en unos segundos.";
  }

  if (error instanceof TypeError) {
    return "No pudimos conectarnos en este momento. Inténtalo nuevamente en unos segundos.";
  }

  if (error instanceof Error) {
    if (
      error.message === "No se pudo persistir la sesión" ||
      error.message === "No se pudo persistir la sesion"
    ) {
      return "El login fue válido, pero no se pudo guardar la sesión en el navegador. Recarga la página e inténtalo otra vez.";
    }
    return error.message || "No se pudo iniciar sesión.";
  }

  return "No se pudo iniciar sesión. Inténtalo otra vez.";
}

interface AuthProviderProps {
  children: ReactNode;
  initialSession?: AuthSessionSnapshot | null;
}

export function AuthProvider({
  children,
  initialSession = null,
}: AuthProviderProps) {
  const pathname = usePathname();
  const { cache, mutate: globalMutate } = useSWRConfig();
  const [state, dispatch] = useReducer(
    authReducer,
    initialSession,
    createAuthState,
  );

  // On first mount, sync the SSR-resolved session into the client-side
  // TokenManager (a module-level singleton that doesn't survive SSR).
  // We intentionally do NOT dispatch AUTH_SUCCESS here because
  // createAuthState() already initialised the reducer with the correct user
  // and is_admin value — a redundant dispatch would trigger a second render
  // that briefly shows the sidebar without admin items (the race condition).
  const syncedRef = React.useRef(false);
  useEffect(() => {
    if (syncedRef.current) return;
    syncedRef.current = true;

    if (!initialSession) {
      TokenManager.clearTokens();
      return;
    }

    TokenManager.setSession({
      accessToken: initialSession.accessToken,
      expiresAt: initialSession.expiresAt,
    });
    // initialSession is an SSR mount-time snapshot, never changes at runtime
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const bootstrapRef = React.useRef(false);
  const checkInFlightRef = React.useRef(false);
  const refreshAuthInFlightRef = React.useRef(false);

  const checkAuthStatus = useCallback(async () => {
    if (checkInFlightRef.current) return;
    checkInFlightRef.current = true;
    dispatch({ type: "SET_LOADING", payload: true });

    try {
      // getCurrentUser uses credentials:include — the middleware cookie is
      // present even when TokenManager is empty after a page reload.
      const user = await authService.getCurrentUser();
      dispatch({
        type: "AUTH_SUCCESS",
        payload: {
          user,
          token: TokenManager.getAccessToken(),
        },
      });
    } catch (error) {
      if (error instanceof ApiError && [401, 403].includes(error.status)) {
        logger.warn("Auth check rejected:", error);
        dispatch({ type: "AUTH_LOGOUT" });
        return;
      }

      logger.warn("Auth check unavailable, keeping session unresolved:", error);
      dispatch({
        type: "AUTH_RETRYABLE_FAILURE",
        payload: "No se pudo validar la sesion. Reintentando...",
      });
    } finally {
      checkInFlightRef.current = false;
      dispatch({ type: "SET_LOADING", payload: false });
    }
  }, []);

  useEffect(() => {
    if (bootstrapRef.current) return;
    bootstrapRef.current = true;

    if (initialSession) {
      return;
    }

    if (isPublicPath(pathname)) {
      dispatch({ type: "AUTH_LOGOUT" });
      return;
    }

    void checkAuthStatus();
  }, [checkAuthStatus, initialSession, pathname]);

  const retryCountRef = React.useRef(0);
  useEffect(() => {
    if (initialSession || state.isInitialized || !state.error) {
      retryCountRef.current = 0;
      return;
    }

    if (state.isLoading || isPublicPath(pathname)) {
      return;
    }

    const MAX_RETRIES = 5;
    if (retryCountRef.current >= MAX_RETRIES) {
      return;
    }

    const delay = Math.min(2000 * Math.pow(2, retryCountRef.current), 60_000);
    retryCountRef.current += 1;

    const retryId = window.setTimeout(() => {
      void checkAuthStatus();
    }, delay);

    return () => window.clearTimeout(retryId);
  }, [
    checkAuthStatus,
    initialSession,
    pathname,
    state.isInitialized,
    state.isLoading,
    state.error,
  ]);

  const refreshAuth = useCallback(async () => {
    if (refreshAuthInFlightRef.current) return;
    refreshAuthInFlightRef.current = true;
    try {
      const response = await authService.refreshToken();
      const user = await authService.getCurrentUser();
      dispatch({
        type: "AUTH_SUCCESS",
        payload: {
          user,
          token: response.access_token,
        },
      });
    } catch (error) {
      logger.error("Failed to refresh auth:", error);
      dispatch({ type: "AUTH_LOGOUT" });
      throw error;
    } finally {
      refreshAuthInFlightRef.current = false;
    }
  }, []);

  useEffect(() => {
    const handleSessionExpired = () => {
      dispatch({ type: "AUTH_LOGOUT" });
    };

    let lastInvalidatedCheck = 0;
    const handleStateInvalidated = () => {
      const now = Date.now();
      if (now - lastInvalidatedCheck < 60_000) return;
      lastInvalidatedCheck = now;
      void checkAuthStatus();
    };

    const handleCrossTabLogout = (e: StorageEvent) => {
      if (e.key !== "auth:logout-event" || e.newValue === null) return;
      TokenManager.clearTokens();
      dispatch({ type: "AUTH_LOGOUT" });
      if (!isPublicPath(window.location.pathname)) {
        const from = window.location.pathname;
        window.location.replace(`/auth/login?from=${encodeURIComponent(from)}`);
      }
      try {
        localStorage.removeItem("auth:logout-event");
      } catch {
        // Ignore storage cleanup errors.
      }
    };

    window.addEventListener(AUTH_SESSION_EXPIRED_EVENT, handleSessionExpired);
    window.addEventListener(
      AUTH_STATE_INVALIDATED_EVENT,
      handleStateInvalidated,
    );
    window.addEventListener("storage", handleCrossTabLogout);

    return () => {
      window.removeEventListener(
        AUTH_SESSION_EXPIRED_EVENT,
        handleSessionExpired,
      );
      window.removeEventListener(
        AUTH_STATE_INVALIDATED_EVENT,
        handleStateInvalidated,
      );
      window.removeEventListener("storage", handleCrossTabLogout);
    };
  }, [checkAuthStatus]);

  useTokenExpiryWatcherWithFlag(state.isAuthenticated);

  useEffect(() => {
    if (!state.isAuthenticated) return;
    if (isPublicPath(pathname)) return;

    let lastCheck = 0;
    const THROTTLE_MS = 60_000;
    const REVALIDATE_INTERVAL_MS = 5 * 60_000;

    const maybeCheck = () => {
      const now = Date.now();
      if (now - lastCheck < THROTTLE_MS) return;
      lastCheck = now;
      void checkAuthStatus();
    };

    const handleVisibility = () => {
      if (document.visibilityState !== "visible") return;
      maybeCheck();
    };

    document.addEventListener("visibilitychange", handleVisibility);

    const interval = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      lastCheck = Date.now();
      void checkAuthStatus();
    }, REVALIDATE_INTERVAL_MS);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.clearInterval(interval);
    };
  }, [checkAuthStatus, pathname, state.isAuthenticated]);

  const login = useCallback(async (email: string, password: string) => {
    try {
      dispatch({ type: "AUTH_START" });

      const response = await authService.login({ email, password });
      const user = await authService.getCurrentUser();

      dispatch({
        type: "AUTH_SUCCESS",
        payload: {
          user,
          token: response.access_token,
        },
      });
    } catch (error) {
      dispatch({ type: "AUTH_FAILURE", payload: getLoginErrorMessage(error) });
      throw error;
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await authService.logout();
    } finally {
      dispatch({ type: "AUTH_LOGOUT" });
      try {
        for (const key of Array.from((cache as Map<string, unknown>).keys())) {
          globalMutate(key, undefined, { revalidate: false });
        }
      } catch {
        // Cache wipe is best-effort.
      }
    }
  }, [cache, globalMutate]);

  const clearError = useCallback(() => {
    dispatch({ type: "CLEAR_ERROR" });
  }, []);

  const contextValue = useMemo<AuthContextType>(
    () => ({
      ...state,
      login,
      logout,
      refreshAuth,
      clearError,
      checkAuthStatus,
    }),
    [state, login, logout, refreshAuth, clearError, checkAuthStatus],
  );

  return (
    <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>
  );
}

export function useAuthContext(): AuthContextType {
  const context = useContext(AuthContext);

  if (context === undefined) {
    throw new Error("useAuthContext must be used within an AuthProvider");
  }

  return context;
}

export default AuthContext;
