import "server-only";

import { cookies, headers } from "next/headers";
import { API_URL } from "@/app/lib/config";
import type { User } from "@/app/lib/services/authService";
import type { AuthSessionSnapshot } from "./session";
import { SSR_ACCESS_TOKEN_HEADER } from "./session";
import { ACCESS_TOKEN_COOKIE, decodeTokenExpiry } from "./sessionRefresh";

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
  if (!user) {
    return null;
  }

  return {
    user,
    accessToken,
    expiresAt: decodeTokenExpiry(accessToken),
  };
}
