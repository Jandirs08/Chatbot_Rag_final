import type { User } from "@/app/lib/services/authService";

export const SSR_ACCESS_TOKEN_HEADER = "x-auth-access-token";

export interface AuthSessionSnapshot {
  user: User;
  accessToken: string;
  expiresAt: number | null;
}
