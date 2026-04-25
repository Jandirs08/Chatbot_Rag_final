"use client";

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
}: UserTableProps) {
  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-6 w-48" />
        {[...Array(5)].map((_, i) => (
          <div key={i} className="flex items-center justify-between">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-8 w-24" />
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
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="text-left border-b">
            <th className="py-2 text-gray-500 font-medium">Usuario</th>
            <th className="py-2 text-gray-500 font-medium">Email</th>
            <th className="py-2 text-gray-500 font-medium">Nombre</th>
            <th className="py-2 text-gray-500 font-medium">Activo</th>
            <th className="py-2 text-gray-500 font-medium">Rol</th>
            <th className="py-2 text-gray-500 font-medium">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id} className="border-b">
              <td className="py-2 align-middle">{u.username}</td>
              <td className="py-2 align-middle">{u.email}</td>
              <td className="py-2 align-middle">{u.full_name || "-"}</td>
              <td className="py-2 align-middle">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={pendingActiveById[u.id] ?? u.is_active}
                    onCheckedChange={(checked) =>
                      onToggleActive(u, Boolean(checked))
                    }
                    disabled={togglingIds.has(u.id)}
                    aria-label={`Cambiar estado activo para ${u.username}`}
                  />
                  <span className="text-sm text-muted-foreground">
                    {(pendingActiveById[u.id] ?? u.is_active)
                      ? "Activo"
                      : "Inactivo"}
                  </span>
                </div>
              </td>
              <td className="py-2 align-middle">
                {u.is_admin ? "Administrador" : "Usuario"}
              </td>
              <td className="py-2 align-middle">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" aria-label="Acciones">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => onEdit(u)}>
                      Editar
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onResetPassword(u)}>
                      Enviar reset password
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-red-600 focus:text-red-600"
                      onClick={() => onDelete(u)}
                    >
                      Eliminar
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex items-center justify-end gap-2 mt-4">
        <Button
          variant="outline"
          size="sm"
          disabled={skip === 0}
          onClick={() => onSkipChange(Math.max(0, skip - limit))}
          className="dark:bg-slate-700 dark:text-white dark:border-slate-600 dark:hover:bg-slate-600"
        >
          Anterior
        </Button>
        <span className="text-sm">
          Página {Math.floor(skip / limit) + 1} de{" "}
          {Math.max(1, Math.ceil(total / limit))}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={skip + limit >= total}
          onClick={() => onSkipChange(skip + limit)}
          className="dark:bg-slate-700 dark:text-white dark:border-slate-600 dark:hover:bg-slate-600"
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
            <SelectItem value="10">10</SelectItem>
            <SelectItem value="20">20</SelectItem>
            <SelectItem value="50">50</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
