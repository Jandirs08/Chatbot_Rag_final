"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useReducer,
  type ReactNode,
} from "react";
import { logger } from "@/app/lib/logger";
import type { AuthSessionSnapshot } from "@/app/lib/auth/session";
import {
  AUTH_SESSION_EXPIRED_EVENT,
  AUTH_STATE_INVALIDATED_EVENT,
  authService,
  TokenManager,
} from "@/app/lib/services/authService";
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

interface AuthProviderProps {
  children: ReactNode;
  initialSession?: AuthSessionSnapshot | null;
}

export function AuthProvider({
  children,
  initialSession = null,
}: AuthProviderProps) {
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const bootstrapRef = React.useRef(false);

  const checkAuthStatus = useCallback(async () => {
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
      logger.error("Auth check failed:", error);
      dispatch({ type: "AUTH_LOGOUT" });
    } finally {
      dispatch({ type: "SET_LOADING", payload: false });
    }
  }, []);

  useEffect(() => {
    if (bootstrapRef.current) return;
    bootstrapRef.current = true;

    if (initialSession) {
      return;
    }

    void checkAuthStatus();
  }, [checkAuthStatus, initialSession]);

  const refreshAuth = useCallback(async () => {
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
    }
  }, []);

  useEffect(() => {
    const handleSessionExpired = () => {
      dispatch({ type: "AUTH_LOGOUT" });
    };

    const handleStateInvalidated = () => {
      void checkAuthStatus();
    };

    window.addEventListener(AUTH_SESSION_EXPIRED_EVENT, handleSessionExpired);
    window.addEventListener(
      AUTH_STATE_INVALIDATED_EVENT,
      handleStateInvalidated,
    );

    return () => {
      window.removeEventListener(
        AUTH_SESSION_EXPIRED_EVENT,
        handleSessionExpired,
      );
      window.removeEventListener(
        AUTH_STATE_INVALIDATED_EVENT,
        handleStateInvalidated,
      );
    };
  }, [checkAuthStatus]);

  const login = async (email: string, password: string) => {
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
      const errorMessage =
        error instanceof Error ? error.message : "Login failed";
      dispatch({ type: "AUTH_FAILURE", payload: errorMessage });
      throw error;
    }
  };

  const logout = useCallback(async () => {
    try {
      await authService.logout();
    } finally {
      dispatch({ type: "AUTH_LOGOUT" });
    }
  }, []);

  const clearError = () => {
    dispatch({ type: "CLEAR_ERROR" });
  };

  const contextValue: AuthContextType = {
    ...state,
    login,
    logout,
    refreshAuth,
    clearError,
    checkAuthStatus,
  };

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
