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
} from "@/lib/services/authService";
import type { User } from "@/lib/services/authService";

export interface AuthState {
  user: User | null;
  token: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
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
        refreshToken: string | null;
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
      refreshToken: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
    };
  }

  return {
    user: initialSession.user,
    token: initialSession.accessToken,
    refreshToken: initialSession.refreshToken,
    isAuthenticated: true,
    isLoading: false,
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
        refreshToken: action.payload.refreshToken,
        isAuthenticated: true,
        isLoading: false,
        error: null,
      };

    case "AUTH_FAILURE":
      return {
        ...state,
        user: null,
        token: null,
        refreshToken: null,
        isAuthenticated: false,
        isLoading: false,
        error: action.payload,
      };

    case "AUTH_LOGOUT":
      return {
        user: null,
        token: null,
        refreshToken: null,
        isAuthenticated: false,
        isLoading: false,
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

  useEffect(() => {
    if (!initialSession) {
      return;
    }

    TokenManager.setSession({
      accessToken: initialSession.accessToken,
      refreshToken: initialSession.refreshToken,
      expiresAt: initialSession.expiresAt,
    });

    const isSameSession =
      state.isAuthenticated &&
      state.user?.id === initialSession.user.id &&
      state.token === initialSession.accessToken &&
      state.refreshToken === initialSession.refreshToken;

    if (isSameSession) {
      return;
    }

    dispatch({
      type: "AUTH_SUCCESS",
      payload: {
        user: initialSession.user,
        token: initialSession.accessToken,
        refreshToken: initialSession.refreshToken,
      },
    });
  }, [
    initialSession,
    state.isAuthenticated,
    state.refreshToken,
    state.token,
    state.user,
  ]);

  const checkAuthStatus = useCallback(async () => {
    dispatch({ type: "SET_LOADING", payload: true });

    try {
      await authService.initFromCookie();
      const user = await authService.getCurrentUser();
      dispatch({
        type: "AUTH_SUCCESS",
        payload: {
          user,
          token: TokenManager.getAccessToken(),
          refreshToken: TokenManager.getRefreshToken(),
        },
      });
    } catch (error) {
      logger.error("Auth check failed:", error);
      dispatch({ type: "AUTH_LOGOUT" });
    } finally {
      dispatch({ type: "SET_LOADING", payload: false });
    }
  }, []);

  const refreshAuth = useCallback(async () => {
    try {
      const response = await authService.refreshToken();
      const user = await authService.getCurrentUser();
      dispatch({
        type: "AUTH_SUCCESS",
        payload: {
          user,
          token: response.access_token,
          refreshToken: response.refresh_token,
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

  useEffect(() => {
    if (!state.isAuthenticated) {
      return;
    }

    const expiryTime = TokenManager.getExpiryTime();
    if (!expiryTime) {
      return;
    }

    const refreshDelayMs = Math.max(1000, expiryTime - Date.now() - 60_000);
    const refreshTimeout = window.setTimeout(() => {
      void refreshAuth();
    }, refreshDelayMs);

    return () => window.clearTimeout(refreshTimeout);
  }, [refreshAuth, state.isAuthenticated, state.token]);

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
          refreshToken: response.refresh_token,
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
