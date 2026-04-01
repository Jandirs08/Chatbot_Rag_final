import "server-only";

import { cookies } from "next/headers";
import { API_URL } from "@/app/lib/config";
import type { AuthResponse, User } from "@/lib/services/authService";
import type { AuthSessionSnapshot } from "./session";

function decodeTokenExpiry(token: string): number | null {
  try {
    const [, payload] = token.split(".");
    if (!payload) {
      return null;
    }

    const decodedPayload = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as { exp?: number };

    return decodedPayload.exp ? decodedPayload.exp * 1000 : null;
  } catch {
    return null;
  }
}

async function fetchCurrentUser(accessToken: string): Promise<User | null> {
  try {
    const response = await fetch(`${API_URL}/auth/me`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as User;
  } catch {
    return null;
  }
}

async function refreshSession(
  refreshToken: string,
): Promise<AuthResponse | null> {
  try {
    const response = await fetch(`${API_URL}/auth/refresh`, {
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

    return (await response.json()) as AuthResponse;
  } catch {
    return null;
  }
}

export async function resolveServerSession(): Promise<AuthSessionSnapshot | null> {
  const cookieStore = cookies();
  const accessToken = cookieStore.get("access_token")?.value ?? null;
  const refreshToken = cookieStore.get("refresh_token")?.value ?? null;

  if (!accessToken && !refreshToken) {
    return null;
  }

  if (accessToken) {
    const user = await fetchCurrentUser(accessToken);

    if (user) {
      return {
        user,
        accessToken,
        refreshToken,
        expiresAt: decodeTokenExpiry(accessToken),
      };
    }
  }

  if (!refreshToken) {
    return null;
  }

  const refreshedSession = await refreshSession(refreshToken);
  if (!refreshedSession) {
    return null;
  }

  const user = await fetchCurrentUser(refreshedSession.access_token);
  if (!user) {
    return null;
  }

  return {
    user,
    accessToken: refreshedSession.access_token,
    refreshToken: refreshedSession.refresh_token ?? refreshToken,
    expiresAt: Date.now() + refreshedSession.expires_in * 1000,
  };
}
