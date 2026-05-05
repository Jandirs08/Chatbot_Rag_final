import "server-only";

import { cookies, headers } from "next/headers";
import { decodeJwt } from "jose";
import { API_URL } from "@/app/lib/config";
import type { User } from "@/app/lib/services/authService";
import type { AuthSessionSnapshot } from "./session";
import { SSR_ACCESS_TOKEN_HEADER } from "./session";
import { ACCESS_TOKEN_COOKIE, decodeTokenExpiry } from "./sessionRefresh";
import { verifyAccessToken } from "./jwtVerify";

const SERVER_SESSION_TIMEOUT_MS = 3_000;

async function fetchCurrentUser(accessToken: string): Promise<User | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), SERVER_SESSION_TIMEOUT_MS);

  try {
    const response = await fetch(`${API_URL}/auth/me`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
      signal: controller.signal,
    });

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as User;
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

function buildUserFromToken(accessToken: string): User | null {
  try {
    const payload = decodeJwt(accessToken);
    const sub = typeof payload.sub === "string" ? payload.sub : null;
    const email = typeof payload.email === "string" ? payload.email : null;
    if (!sub || !email) return null;
    return {
      id: sub,
      username: email.split("@")[0],
      email,
      full_name: undefined,
      is_active: true,
      is_admin: Boolean(payload.is_admin),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      last_login: undefined,
    };
  } catch {
    return null;
  }
}

export async function resolveServerSession(): Promise<AuthSessionSnapshot | null> {
  const headerStore = headers();
  const cookieStore = cookies();
  const forwardedAccessToken =
    headerStore.get(SSR_ACCESS_TOKEN_HEADER)?.trim() || null;
  const accessToken =
    forwardedAccessToken ?? cookieStore.get(ACCESS_TOKEN_COOKIE)?.value ?? null;

  if (!accessToken) {
    return null;
  }

  const user = await fetchCurrentUser(accessToken);
  if (user) {
    return { user, accessToken, expiresAt: decodeTokenExpiry(accessToken) };
  }

  // Backend unavailable or slow — verify signature + expiry before using
  // the token locally to avoid accepting expired tokens.
  const claims = await verifyAccessToken(accessToken);
  if (!claims) return null;
  const fallbackUser = buildUserFromToken(accessToken);
  if (!fallbackUser) return null;

  return {
    user: fallbackUser,
    accessToken,
    expiresAt: decodeTokenExpiry(accessToken),
  };
}
