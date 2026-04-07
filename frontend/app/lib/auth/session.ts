import type { User } from "@/app/lib/services/authService";

export interface AuthSessionSnapshot {
  user: User;
  accessToken: string;
  expiresAt: number | null;
}
