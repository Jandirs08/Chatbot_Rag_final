import type { User } from "@/lib/services/authService";

export interface AuthSessionSnapshot {
  user: User;
  accessToken: string;
  expiresAt: number | null;
}
