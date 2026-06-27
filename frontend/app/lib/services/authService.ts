import { API_URL } from "@/app/lib/config";
import {
  ApiError,
  fetchWithRetrySafe,
  parseApiError,
  publicFetch,
} from "@/app/lib/fetchUtils";
import { logger } from "@/app/lib/logger";

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterData {
  username: string;
  email: string;
  password: string;
  full_name?: string;
}

export interface User {
  id: string;
  username: string;
  email: string;
  full_name?: string;
  is_active: boolean;
  is_admin: boolean;
  created_at: string;
  updated_at: string;
  last_login?: string;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string | null;
}

export interface AuthError {
  detail: string;
}

export const AUTH_SESSION_EXPIRED_EVENT = "auth:session-expired";
export const AUTH_STATE_INVALIDATED_EVENT = "auth:state-invalidated";

let sessionExpirationInFlight: Promise<void> | null = null;
let refreshInFlight: Promise<AuthResponse> | null = null;

function dispatchAuthEvent(eventName: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(eventName));
}

async function expireSession(): Promise<void> {
  if (!sessionExpirationInFlight) {
    sessionExpirationInFlight = (async () => {
      try {
        await fetch("/api/auth/logout", { method: "POST" });
      } catch {
        // Best-effort cookie cleanup only.
      } finally {
        TokenManager.clearTokens();
        dispatchAuthEvent(AUTH_SESSION_EXPIRED_EVENT);
        sessionExpirationInFlight = null;
      }
    })();
  }

  await sessionExpirationInFlight;
}

class TokenManager {
  private static accessToken: string | null = null;
  private static expiryTime: number | null = null;

  static setTokens(accessToken: string, expiresIn: number): void {
    this.setSession({
      accessToken,
      expiresAt: Date.now() + expiresIn * 1000,
    });
  }

  static setSession({
    accessToken,
    expiresAt,
  }: {
    accessToken: string;
    expiresAt: number | null;
  }): void {
    this.accessToken = accessToken;
    this.expiryTime = expiresAt;
  }

  static getAccessToken(): string | null {
    return this.accessToken;
  }

  static getExpiryTime(): number | null {
    return this.expiryTime;
  }

  static getToken(): string | null {
    return this.getAccessToken();
  }

  static clearTokens(): void {
    this.accessToken = null;
    this.expiryTime = null;
  }

  static isTokenValid(): boolean {
    if (!this.accessToken) {
      return false;
    }

    return this.expiryTime === null || this.expiryTime > Date.now();
  }
}

export const authService = {
  async register(userData: RegisterData): Promise<User> {
    try {
      const response = await publicFetch(`${API_URL}/auth/register`, {
        method: "POST",
        body: JSON.stringify(userData),
      });

      if (!response.ok) {
        throw await parseApiError(response, "Error al registrar usuario");
      }

      return await response.json();
    } catch (error) {
      logger.error("Register error:", error);
      throw error;
    }
  },

  async login(credentials: LoginCredentials): Promise<AuthResponse> {
    try {
      const response = await publicFetch(`${API_URL}/auth/login`, {
        method: "POST",
        body: JSON.stringify(credentials),
      });

      if (!response.ok) {
        throw await parseApiError(response, "Error al iniciar sesión");
      }

      const authData: AuthResponse = await response.json();

      const cookieResponse = await publicFetch("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({
          access_token: authData.access_token,
          refresh_token: authData.refresh_token,
          expires_in: authData.expires_in,
        }),
      });

      if (!cookieResponse.ok) {
        throw new Error("No se pudo persistir la sesión");
      }

      TokenManager.setTokens(authData.access_token, authData.expires_in);

      return authData;
    } catch (error) {
      logger.error("Login error:", error);
      throw error;
    }
  },

  async logout(): Promise<void> {
    try {
      // /api/auth/logout (Next.js route) lee refresh_token y access_token de cookies HttpOnly
      // y los reenvía al backend para revocación vía TokenBlacklist. Esa única llamada cubre
      // ambos tokens — la llamada directa duplicada al backend (anterior) era redundante y no
      // enviaba refresh_token, dejando esa revocación a medias.
      await publicFetch("/api/auth/logout", { method: "POST" });
    } catch {
      // Ignore network failures on logout.
    } finally {
      TokenManager.clearTokens();
      try {
        localStorage.setItem("auth:logout-event", Date.now().toString());
      } catch {
        // localStorage unavailable (SSR, private mode edge cases)
      }
    }
  },

  async getCurrentUser(): Promise<User> {
    const response = await authenticatedFetch(`${API_URL}/auth/me`, {
      method: "GET",
    });

    if (!response.ok) {
      throw await parseApiError(response, "No se pudo obtener el usuario");
    }

    return response.json();
  },

  async refreshToken({
    silent = false,
  }: { silent?: boolean } = {}): Promise<AuthResponse> {
    if (refreshInFlight) {
      return refreshInFlight;
    }

    const inFlight = (async () => {
      try {
        const response = await publicFetch("/api/auth/refresh", {
          method: "POST",
        });

        if (!response.ok) {
          throw new Error("Token invalido");
        }

        const authData: AuthResponse = await response.json();
        TokenManager.setTokens(authData.access_token, authData.expires_in);

        return authData;
      } catch (error) {
        // Always revoke the server-side refresh cookie on a failed refresh,
        // regardless of the silent flag. The silent flag controls only UX
        // feedback (toasts, redirects) — leaving the backend cookie active
        // after a rejected refresh would leave stale credentials on the server.
        // Callers that join a shared refreshInFlight promise inherit the
        // closure's silent value, so branching here on silent produces
        // incorrect server-side cleanup for non-silent callers.
        await expireSession();
        throw error;
      } finally {
        refreshInFlight = null;
      }
    })();

    refreshInFlight = inFlight;
    return inFlight;
  },

  async requestPasswordReset(email: string): Promise<void> {
    const response = await publicFetch(`${API_URL}/auth/forgot-password`, {
      method: "POST",
      body: JSON.stringify({ email }),
    });

    if (!response.ok) {
      throw await parseApiError(response, `Error ${response.status}`);
    }
  },

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const response = await publicFetch(`${API_URL}/auth/reset-password`, {
      method: "POST",
      body: JSON.stringify({ token, new_password: newPassword }),
    });

    if (!response.ok) {
      throw await parseApiError(response, `Error ${response.status}`);
    }
  },

  isAuthenticated: () => TokenManager.isTokenValid(),
  getAuthToken: () => TokenManager.getAccessToken(),

  async initFromCookie(): Promise<void> {
    if (TokenManager.isTokenValid()) {
      return;
    }

    TokenManager.clearTokens();

    try {
      await authService.refreshToken({ silent: true });
    } catch {
      // No active session or expired refresh cookie.
    }
  },
};

async function maybeDispatchInvalidSession(
  url: string,
  response: Response,
): Promise<void> {
  if (response.status !== 403) return;

  if (url.endsWith("/auth/me")) {
    dispatchAuthEvent(AUTH_STATE_INVALIDATED_EVENT);
    return;
  }

  try {
    const cloned = response.clone();
    const data = await cloned.json();
    if (
      data &&
      typeof data === "object" &&
      (data as { code?: unknown }).code === "INVALID_SESSION"
    ) {
      dispatchAuthEvent(AUTH_STATE_INVALIDATED_EVENT);
    }
  } catch {
    // Body not JSON or unreadable: do not dispatch.
  }
}

export const authenticatedFetch = async (
  url: string,
  options: RequestInit = {},
): Promise<Response> => {
  let token = TokenManager.getAccessToken();

  const getHeaders = (currentToken: string | null) => {
    const headers = new Headers(options.headers);
    headers.set("Content-Type", "application/json");
    if (currentToken) {
      headers.set("Authorization", `Bearer ${currentToken}`);
    }
    return headers;
  };

  let response = await fetchWithRetrySafe(url, {
    ...options,
    credentials: "include",
    headers: getHeaders(token),
  });

  if (response.status === 401) {
    // Re-read: syncedRef (AuthProvider) may have populated TokenManager
    // while the fetch was in-flight (child effects run before parent effects).
    token = TokenManager.getAccessToken();
    if (token && TokenManager.isTokenValid()) {
      response = await fetchWithRetrySafe(url, {
        ...options,
        credentials: "include",
        headers: getHeaders(token),
      });
    }

    if (response.status === 401) {
      try {
        await authService.refreshToken();
        token = TokenManager.getAccessToken();
        response = await fetchWithRetrySafe(url, {
          ...options,
          credentials: "include",
          headers: getHeaders(token),
        });

        if (response.status === 401) {
          await expireSession();
        }
      } catch {
        return response;
      }
    }
  }

  await maybeDispatchInvalidSession(url, response);

  return response;
};

export async function authenticatedJsonFetcher<T = unknown>(
  url: string,
  errorMessage = "Error fetching data",
): Promise<T> {
  const response = await authenticatedFetch(url, { method: "GET" });
  if (!response.ok) {
    throw new Error(errorMessage);
  }
  return response.json();
}

export type HistoryFetchResult = {
  items: unknown[];
  total: number;
  truncated: boolean;
};

export async function authenticatedHistoryFetcher(
  url: string,
): Promise<HistoryFetchResult> {
  const response = await authenticatedFetch(url, { method: "GET" });
  if (!response.ok) {
    throw new Error("Error fetching chat history");
  }
  const items = await response.json();
  const totalHeader = response.headers.get("X-Total-Messages");
  const truncatedHeader = response.headers.get("X-Truncated");
  const total = totalHeader
    ? Number(totalHeader)
    : Array.isArray(items)
      ? items.length
      : 0;
  return {
    items: Array.isArray(items) ? items : [],
    total: Number.isFinite(total) ? total : 0,
    truncated: truncatedHeader === "1",
  };
}

export const authenticatedUpload = async (
  url: string,
  options: RequestInit = {},
): Promise<Response> => {
  let token = TokenManager.getAccessToken();

  const getHeaders = (currentToken: string | null) => {
    const headers = new Headers(options.headers);
    if (currentToken) {
      headers.set("Authorization", `Bearer ${currentToken}`);
    }
    return headers;
  };

  let response = await fetch(url, {
    ...options,
    credentials: "include",
    headers: getHeaders(token),
  });

  if (response.status === 401) {
    token = TokenManager.getAccessToken();
    if (token && TokenManager.isTokenValid()) {
      response = await fetch(url, {
        ...options,
        credentials: "include",
        headers: getHeaders(token),
      });
    }

    if (response.status === 401) {
      try {
        await authService.refreshToken();
        token = TokenManager.getAccessToken();
        response = await fetch(url, {
          ...options,
          credentials: "include",
          headers: getHeaders(token),
        });

        if (response.status === 401) {
          await expireSession();
        }
      } catch {
        return response;
      }
    }
  }

  await maybeDispatchInvalidSession(url, response);

  return response;
};

export { TokenManager };
export { ApiError };
