import { NextResponse } from "next/server";
import { API_URL } from "@/app/lib/config";

export interface SessionTokens {
  access_token: string;
  token_type?: string;
  expires_in: number;
  refresh_token?: string | null;
}

export const ACCESS_TOKEN_COOKIE = "access_token";
export const REFRESH_TOKEN_COOKIE = "refresh_token";

const legacyCookies = ["auth_token", "session_id"] as const;

function getCookieBaseOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
  };
}

function decodeBase64Url(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");

  if (typeof atob === "function") {
    return atob(padded);
  }

  if (typeof Buffer !== "undefined") {
    return Buffer.from(padded, "base64").toString("utf8");
  }

  throw new Error("Base64 decoder unavailable");
}

export function decodeTokenExpiry(token: string): number | null {
  try {
    const [, payload] = token.split(".");
    if (!payload) {
      return null;
    }

    const decodedPayload = JSON.parse(decodeBase64Url(payload)) as {
      exp?: number;
    };

    return decodedPayload.exp ? decodedPayload.exp * 1000 : null;
  } catch {
    return null;
  }
}

export function isTokenExpired(
  token: string,
  skewMs: number = 60_000,
): boolean {
  const expiry = decodeTokenExpiry(token);

  if (expiry === null) {
    return false;
  }

  return expiry <= Date.now() + skewMs;
}

// Dedupe concurrent refresh attempts by token within the same runtime instance.
// Note: Edge/Node workers do not share memory across instances; this only
// dedupes within a single worker. Cross-instance protection requires a
// distributed lock (Redis, etc.) and is out of scope here.
const inFlightRefreshes = new Map<string, Promise<SessionTokens | null>>();
const SERVER_AUTH_TIMEOUT_MS = 10_000;

async function fetchServerAuth(
  input: string,
  init: RequestInit,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), SERVER_AUTH_TIMEOUT_MS);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

async function performSessionRefresh(
  refreshToken: string,
): Promise<SessionTokens | null> {
  try {
    const response = await fetchServerAuth(`${API_URL}/auth/refresh`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ refresh_token: refreshToken }),
      cache: "no-store",
    });

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as SessionTokens;
  } catch {
    return null;
  }
}

export async function requestSessionRefresh(
  refreshToken: string,
): Promise<SessionTokens | null> {
  const existing = inFlightRefreshes.get(refreshToken);
  if (existing) {
    return existing;
  }

  const pending = performSessionRefresh(refreshToken).finally(() => {
    inFlightRefreshes.delete(refreshToken);
  });

  inFlightRefreshes.set(refreshToken, pending);
  return pending;
}

export function applySessionCookies(
  response: NextResponse,
  tokens: SessionTokens,
  currentRefreshToken?: string | null,
): void {
  const baseOptions = getCookieBaseOptions();
  const maxAge = tokens.expires_in || 3600;

  response.cookies.set(ACCESS_TOKEN_COOKIE, tokens.access_token, {
    ...baseOptions,
    maxAge,
  });

  const refreshToken = tokens.refresh_token ?? currentRefreshToken ?? null;
  if (refreshToken) {
    response.cookies.set(REFRESH_TOKEN_COOKIE, refreshToken, {
      ...baseOptions,
      maxAge: 7 * 24 * 60 * 60,
    });
  }
}

export function clearSessionCookies(response: NextResponse): void {
  response.cookies.delete(ACCESS_TOKEN_COOKIE);
  response.cookies.delete(REFRESH_TOKEN_COOKIE);

  for (const cookieName of legacyCookies) {
    response.cookies.delete(cookieName);
  }
}

export function toClientSessionResponse(tokens: SessionTokens) {
  return {
    access_token: tokens.access_token,
    token_type: tokens.token_type ?? "bearer",
    expires_in: tokens.expires_in,
  };
}
