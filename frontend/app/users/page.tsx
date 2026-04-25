"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useUsers, useUsersMutations } from "@/app/hooks/useUsers";
import { Button } from "@/app/components/ui/button";
import { Card, CardContent } from "@/app/components/ui/card";
import type {
  CreateUserData,
  UserListItem,
} from "@/app/lib/services/userService";
import { DeleteUserDialog } from "./_components/DeleteUserDialog";
import { UserCreateDialog } from "./_components/UserCreateDialog";
import { UserEditDialog } from "./_components/UserEditDialog";
import { UserFilters } from "./_components/UserFilters";
import { UserTable } from "./_components/UserTable";

export default function UsuariosPage() {
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editingUser, setEditingUser] = useState<UserListItem | null>(null);
  const [deleteUser, setDeleteUser] = useState<UserListItem | null>(null);
  const [togglingIds, setTogglingIds] = useState<Set<string>>(new Set());
  const [pendingActiveById, setPendingActiveById] = useState<
    Record<string, boolean>
  >({});

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [activeFilter, setActiveFilter] = useState("all");
  const [skip, setSkip] = useState(0);
  const [limit, setLimit] = useState(10);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 400);
    return () => clearTimeout(t);
  }, [search]);

  const { data, error: listError, isLoading } = useUsers(
    {
      skip,
      limit,
      search: debouncedSearch || undefined,
      role:
        roleFilter !== "all" ? (roleFilter as "admin" | "user") : undefined,
      is_active:
        activeFilter === "all" ? undefined : activeFilter === "active",
    },
    {
      keepPreviousData: true,
      revalidateOnFocus: true,
    },
  );
  const {
    createUser: createUserAction,
    updateUser: updateUserAction,
    deleteUser: deleteUserAction,
    requestPasswordReset,
  } = useUsersMutations();

  const users = data?.items ?? [];
  const total = data?.total ?? 0;
  const loading = isLoading && !data;
  const pageError =
    error || (listError instanceof Error ? listError.message : null);

  const handleCreateUser = async (payload: CreateUserData) => {
    setError(null);
    try {
      await createUserAction(payload);
      setShowCreate(false);
      toast.success("Usuario creado correctamente");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al crear usuario");
      toast.error("Error al crear usuario");
    }
  };

  const handleEditSubmit = async (
    id: string,
    payload: Record<string, unknown>,
  ) => {
    try {
      await updateUserAction(id, payload);
      setEditingUser(null);
      toast.success("Usuario actualizado correctamente");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Error al actualizar usuario",
      );
    }
  };

  const handleDelete = async () => {
    if (!deleteUser) return;
    try {
      await deleteUserAction(deleteUser.id);
      toast.success("Usuario eliminado");
    } catch {
      toast.error("Error al eliminar usuario");
    } finally {
      setDeleteUser(null);
    }
  };

  const handleResetPassword = async (u: UserListItem) => {
    try {
      await requestPasswordReset(u.email);
      toast.success(`Correo de recuperación enviado a ${u.email}`);
    } catch {
      toast.error("No se pudo enviar el correo de recuperación");
    }
  };

  const toggleActive = async (u: UserListItem, nextChecked: boolean) => {
    setTogglingIds((prev) => new Set(prev).add(u.id));
    setPendingActiveById((prev) => ({ ...prev, [u.id]: nextChecked }));
    try {
      const updated = await updateUserAction(u.id, { is_active: nextChecked });
      toast.success(
        updated.is_active ? "Usuario activado" : "Usuario desactivado",
      );
    } catch {
      toast.error("No se pudo actualizar el estado del usuario");
    } finally {
      setTogglingIds((prev) => {
        const next = new Set(prev);
        next.delete(u.id);
        return next;
      });
      setPendingActiveById((prev) => {
        const next = { ...prev };
        delete next[u.id];
        return next;
      });
    }
  };

  return (
    <div className="space-y-6 p-6">
      <UserFilters
        search={search}
        onSearchChange={(v) => {
          setSearch(v);
          setSkip(0);
        }}
        roleFilter={roleFilter}
        onRoleChange={(v) => {
          setRoleFilter(v);
          setSkip(0);
        }}
        activeFilter={activeFilter}
        onActiveChange={(v) => {
          setActiveFilter(v);
          setSkip(0);
        }}
        total={total}
      />
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Gestión de Usuarios</h1>
        <Button onClick={() => setShowCreate(true)}>Crear Usuario</Button>
      </div>

      {pageError && <p className="text-red-600">{pageError}</p>}

      <Card>
        <CardContent>
          <UserTable
            users={users}
            loading={loading}
            total={total}
            skip={skip}
            limit={limit}
            onSkipChange={setSkip}
            onLimitChange={setLimit}
            togglingIds={togglingIds}
            pendingActiveById={pendingActiveById}
            onToggleActive={toggleActive}
            onEdit={setEditingUser}
            onResetPassword={handleResetPassword}
            onDelete={setDeleteUser}
          />
        </CardContent>
      </Card>

      <UserCreateDialog
        open={showCreate}
        onOpenChange={setShowCreate}
        onSubmit={handleCreateUser}
        onError={(message) => {
          setError(message);
          toast.error(message);
        }}
      />

      <UserEditDialog
        user={editingUser}
        onClose={() => setEditingUser(null)}
        onSubmit={handleEditSubmit}
      />

      <DeleteUserDialog
        user={deleteUser}
        onClose={() => setDeleteUser(null)}
        onConfirm={handleDelete}
      />
    </div>
  );
}
