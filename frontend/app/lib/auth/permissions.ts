import type { User } from "@/app/lib/services/authService";

export type Permission =
  | "manage_documents"
  | "manage_users"
  | "view_debug"
  | "manage_bot_config";

export function hasPermission(user: User | null | undefined, permission: Permission): boolean {
  void permission;
  return Boolean(user?.is_admin && user?.is_active);
}
