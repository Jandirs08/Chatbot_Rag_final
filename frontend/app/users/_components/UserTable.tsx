"use client";

import { cn } from "@/app/lib/utils";
import { Button } from "@/app/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/app/components/ui/dropdown-menu";
import { EmptyState } from "@/app/components/ui/empty-state";
import { Skeleton } from "@/app/components/ui/skeleton";
import { Switch } from "@/app/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/app/components/ui/select";
import { MoreHorizontal, UsersRound } from "lucide-react";
import type { UserListItem } from "@/app/lib/services/userService";

interface UserTableProps {
  users: UserListItem[];
  loading: boolean;
  total: number;
  skip: number;
  limit: number;
  onSkipChange: (skip: number) => void;
  onLimitChange: (limit: number) => void;
  togglingIds: Set<string>;
  pendingActiveById: Record<string, boolean>;
  onToggleActive: (user: UserListItem, next: boolean) => void;
  onEdit: (user: UserListItem) => void;
  onResetPassword: (user: UserListItem) => void;
  onDelete: (user: UserListItem) => void;
  resettingId?: string | null;
}

function getInitials(u: UserListItem): string {
  if (u.full_name?.trim()) {
    return u.full_name.trim().split(/\s+/).map((n) => n[0]).slice(0, 2).join("").toUpperCase();
  }
  return u.username.slice(0, 2).toUpperCase();
}

export function UserTable({
  users,
  loading,
  total,
  skip,
  limit,
  onSkipChange,
  onLimitChange,
  togglingIds,
  pendingActiveById,
  onToggleActive,
  onEdit,
  onResetPassword,
  onDelete,
  resettingId,
}: UserTableProps) {
  if (loading) {
    return (
      <div className="rounded-lg border border-border overflow-hidden">
        <div className="flex items-center gap-4 px-4 py-3 border-b bg-card">
          {[48, 160, 128, 80, 72].map((w, i) => (
            <Skeleton key={i} className="h-3 rounded" style={{ width: w }} />
          ))}
        </div>
        {[...Array(5)].map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3.5 border-b last:border-0 bg-card">
            <Skeleton className="h-8 w-8 rounded-full flex-shrink-0" />
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-4 w-40 ml-auto" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="h-8 w-8 rounded" />
          </div>
        ))}
      </div>
    );
  }

  if (users.length === 0) {
    return (
      <EmptyState
        icon={<UsersRound className="h-5 w-5" />}
        title="No hay usuarios que coincidan"
        description="Ajusta filtros o crea un usuario nuevo."
      />
    );
  }

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="bg-card border-b border-border">
              <th scope="col" className="px-4 py-3 text-left text-label text-muted-foreground">
                Usuario
              </th>
              <th scope="col" className="px-4 py-3 text-left text-label text-muted-foreground">
                Email
              </th>
              <th scope="col" className="px-4 py-3 text-left text-label text-muted-foreground">
                Nombre
              </th>
              <th scope="col" className="px-4 py-3 text-left text-label text-muted-foreground">
                Rol
              </th>
              <th scope="col" className="px-4 py-3 text-left text-label text-muted-foreground">
                Estado
              </th>
              <th scope="col" className="px-4 py-3 w-12" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {users.map((u) => {
              const isActive = pendingActiveById[u.id] ?? u.is_active;
              return (
                <tr key={u.id} className="bg-card hover:bg-muted/40 transition-colors duration-150">
                  <td className="px-4 py-3 align-middle">
                    <div className="flex items-center gap-2.5">
                      <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary flex-shrink-0 select-none">
                        {getInitials(u)}
                      </div>
                      <span className="font-medium text-foreground">{u.username}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 align-middle text-muted-foreground">{u.email}</td>
                  <td className="px-4 py-3 align-middle text-muted-foreground">{u.full_name || "—"}</td>
                  <td className="px-4 py-3 align-middle">
                    <span className={cn(
                      "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border",
                      u.is_admin
                        ? "bg-primary/10 text-primary border-primary/25"
                        : "bg-muted/60 text-muted-foreground border-border"
                    )}>
                      {u.is_admin ? "Admin" : "Usuario"}
                    </span>
                  </td>
                  <td className="px-4 py-3 align-middle">
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={isActive}
                        onCheckedChange={(checked) => onToggleActive(u, Boolean(checked))}
                        disabled={togglingIds.has(u.id)}
                        aria-label={`Cambiar estado activo para ${u.username}`}
                      />
                      <span className={cn(
                        "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border",
                        isActive
                          ? "bg-success/10 text-success border-success/25"
                          : "bg-muted/60 text-muted-foreground border-border"
                      )}>
                        {isActive ? "Activo" : "Inactivo"}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 align-middle">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" aria-label="Acciones">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => onEdit(u)}>Editar</DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => onResetPassword(u)}
                          disabled={resettingId === u.id}
                        >
                          {resettingId === u.id ? "Enviando..." : "Enviar reset password"}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive focus:bg-destructive/10"
                          onClick={() => onDelete(u)}
                        >
                          Eliminar
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border bg-card">
        <Button
          variant="outline"
          size="sm"
          disabled={skip === 0}
          onClick={() => onSkipChange(Math.max(0, skip - limit))}
        >
          Anterior
        </Button>
        <span className="text-sm text-muted-foreground font-data">
          {Math.floor(skip / limit) + 1} / {Math.max(1, Math.ceil(total / limit))}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={skip + limit >= total}
          onClick={() => onSkipChange(skip + limit)}
        >
          Siguiente
        </Button>
        <Select
          value={String(limit)}
          onValueChange={(v) => {
            onLimitChange(Number(v));
            onSkipChange(0);
          }}
        >
          <SelectTrigger className="w-24">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="10">10 / pág</SelectItem>
            <SelectItem value="20">20 / pág</SelectItem>
            <SelectItem value="50">50 / pág</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
