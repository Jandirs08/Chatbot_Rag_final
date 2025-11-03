"use client";
import { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { toast } from "sonner";
import { Switch } from "../components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogFooter, AlertDialogCancel, AlertDialogAction, AlertDialogTrigger } from "../components/ui/alert-dialog";
import { Skeleton } from "../components/ui/skeleton";
import { useRequireAdmin } from "../hooks";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "../components/ui/select";
import { userService, CreateUserData, UserListItem, PaginatedUsersResponse } from "../lib/services/userService";

export default function UsuariosPage() {
  const { isAuthorized } = useRequireAdmin();
  const [users, setUsers] = useState<UserListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<CreateUserData>({ email: "", password: "", full_name: "", is_admin: true });
  const [role, setRole] = useState<string>("admin");
  const [passwordHints, setPasswordHints] = useState({ len: false, upper: false, special: false });
  const [editingUser, setEditingUser] = useState<UserListItem | null>(null);
  const [editForm, setEditForm] = useState<{ email: string; full_name: string; role: string; is_active: boolean; password: string }>({ email: "", full_name: "", role: "admin", is_active: true, password: "" });
  const [editPasswordHints, setEditPasswordHints] = useState({ len: false, upper: false, special: false });
  const [togglingIds, setTogglingIds] = useState<Set<string>>(new Set());
  // Filtros y paginación
  const [search, setSearch] = useState<string>("");
  const [debouncedSearch, setDebouncedSearch] = useState<string>("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [activeFilter, setActiveFilter] = useState<string>("all");
  const [skip, setSkip] = useState<number>(0);
  const [limit, setLimit] = useState<number>(10);
  const [total, setTotal] = useState<number>(0);

  // Debounce del buscador
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 400);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    if (!isAuthorized) return;
    setLoading(true);
    (async () => {
      try {
        const params: any = { skip, limit };
        if (debouncedSearch) params.search = debouncedSearch;
        if (roleFilter !== 'all') params.role = roleFilter;
        if (activeFilter !== 'all') params.is_active = activeFilter === 'active';
        const data: PaginatedUsersResponse = await userService.listUsers(params);
        setUsers(data.items);
        setTotal(data.total);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error al cargar usuarios");
      } finally {
        setLoading(false);
      }
    })();
  }, [isAuthorized, debouncedSearch, roleFilter, activeFilter, skip, limit]);

  if (!isAuthorized) return null;

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    setForm(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
    if (name === 'password') {
      const len = value.length >= 8;
      const upper = /[A-Z]/.test(value);
      const special = /[^A-Za-z0-9]/.test(value);
      setPasswordHints({ len, upper, special });
    }
  };

  const onEditChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    setEditForm(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
    if (name === 'password') {
      const len = value.length >= 8;
      const upper = /[A-Z]/.test(value);
      const special = /[^A-Za-z0-9]/.test(value);
      setEditPasswordHints({ len, upper, special });
    }
  };

  const createUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    // Validación de política de contraseña
    if (!passwordHints.len || !passwordHints.upper || !passwordHints.special) {
      setError("La contraseña debe tener mínimo 8 caracteres, una mayúscula y un carácter especial.");
      return;
    }
    try {
      const payload: CreateUserData = {
        email: form.email,
        password: form.password,
        full_name: form.full_name,
        is_admin: role === 'admin',
      };
      const created = await userService.createUser(payload);
      setUsers(prev => [created, ...prev]);
      setShowCreate(false);
      setForm({ email: "", password: "", full_name: "", is_admin: true });
      setRole('admin');
      setPasswordHints({ len: false, upper: false, special: false });
      toast.success("Usuario creado correctamente");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al crear usuario");
      toast.error("Error al crear usuario");
    }
  };

  const openEdit = (u: UserListItem) => {
    setEditingUser(u);
    setEditForm({
      email: u.email,
      full_name: u.full_name || "",
      role: u.is_admin ? "admin" : "user",
      is_active: u.is_active,
      password: "",
    });
    setEditPasswordHints({ len: false, upper: false, special: false });
  };

  const saveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    try {
      const updatePayload: any = {
        email: editForm.email !== editingUser.email ? editForm.email : undefined,
        full_name: editForm.full_name,
        is_admin: editForm.role === 'admin',
        is_active: editForm.is_active,
      };
      if (editForm.password) {
        if (!editPasswordHints.len || !editPasswordHints.upper || !editPasswordHints.special) {
          toast.error("La nueva contraseña no cumple la política");
          return;
        }
        updatePayload.password = editForm.password;
      }

      const updated = await userService.updateUser(editingUser.id, updatePayload);
      setUsers(prev => prev.map(u => (u.id === updated.id ? updated : u)));
      setEditingUser(null);
      toast.success("Usuario actualizado correctamente");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al actualizar usuario");
    }
  };

  const toggleActive = async (u: UserListItem, nextChecked: boolean) => {
    // Optimista: actualiza UI enseguida
    setTogglingIds(prev => new Set(prev).add(u.id));
    const prevUsers = users;
    setUsers(prev => prev.map(x => (x.id === u.id ? { ...x, is_active: nextChecked } : x)));
    try {
      const updated = await userService.updateUser(u.id, { is_active: nextChecked });
      setUsers(prev => prev.map(x => (x.id === updated.id ? updated : x)));
      toast.success(updated.is_active ? "Usuario activado" : "Usuario desactivado");
    } catch (err) {
      // Revertir si falla
      setUsers(prevUsers);
      toast.error("No se pudo actualizar el estado del usuario");
    } finally {
      setTogglingIds(prev => {
        const next = new Set(prev);
        next.delete(u.id);
        return next;
      });
    }
  };

  return (
    <div className="space-y-6 p-6">
      {/* Filtros */}
      <div className="flex flex-wrap gap-4 items-end">
        <div className="space-y-2 w-64">
          <Label htmlFor="search">Buscar</Label>
          <Input id="search" value={search} onChange={(e) => { setSearch(e.target.value); setSkip(0); }} placeholder="Email o usuario" />
        </div>
        <div className="space-y-2 w-56">
          <Label htmlFor="filter_role">Rol</Label>
          <Select value={roleFilter} onValueChange={(v) => { setRoleFilter(v); setSkip(0); }}>
            <SelectTrigger id="filter_role" className="w-full"><SelectValue placeholder="Rol" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="admin">Administrador</SelectItem>
              <SelectItem value="user">Usuario</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2 w-56">
          <Label htmlFor="filter_active">Estado</Label>
          <Select value={activeFilter} onValueChange={(v) => { setActiveFilter(v); setSkip(0); }}>
            <SelectTrigger id="filter_active" className="w-full"><SelectValue placeholder="Estado" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="active">Activo</SelectItem>
              <SelectItem value="inactive">Inactivo</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Total: {total}</span>
        </div>
      </div>
            <div className="flex items-center justify-between">
              <h1 className="text-3xl font-bold">Gestión de Usuarios</h1>
              <Button onClick={() => setShowCreate(true)}>Crear Usuario</Button>
            </div>

      {error && <p className="text-red-600">{error}</p>}

      <Card>
        <CardHeader>
          <CardTitle>Usuarios</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
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
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left border-b">
                    <th className="py-2">Usuario</th>
                    <th className="py-2">Email</th>
                    <th className="py-2">Nombre</th>
                    <th className="py-2">Activo</th>
                    <th className="py-2">Rol</th>
                    <th className="py-2">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(u => (
                    <tr key={u.id} className="border-b">
                      <td className="py-2">{u.username}</td>
                      <td className="py-2">{u.email}</td>
                      <td className="py-2">{u.full_name || "-"}</td>
                      <td className="py-2">
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={u.is_active}
                            onCheckedChange={(checked) => toggleActive(u, Boolean(checked))}
                            disabled={togglingIds.has(u.id)}
                            aria-label={`Cambiar estado activo para ${u.username}`}
                          />
                          <span className="text-sm text-muted-foreground">{u.is_active ? "Activo" : "Inactivo"}</span>
                        </div>
                      </td>
                      <td className="py-2">{u.is_admin ? "Administrador" : "Usuario"}</td>
                      <td className="py-2">
                        <div className="flex gap-2">
                          <Button variant="outline" size="sm" onClick={() => openEdit(u)}>Editar</Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="destructive" size="sm">Eliminar</Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>¿Eliminar usuario?</AlertDialogTitle>
                              </AlertDialogHeader>
                              <p className="text-sm text-muted-foreground">Esta acción no se puede deshacer.</p>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction onClick={async () => {
                                  try {
                                    await userService.deleteUser(u.id);
                                    setUsers(prev => prev.filter(x => x.id !== u.id));
                                    toast.success("Usuario eliminado");
                                  } catch (err) {
                                    toast.error("No se pudo eliminar el usuario");
                                  }
                                }}>Eliminar</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {/* Paginación simple */}
              <div className="flex items-center justify-end gap-2 mt-4">
                <Button variant="outline" size="sm" disabled={skip===0} onClick={() => setSkip(Math.max(0, skip - limit))}>Anterior</Button>
                <span className="text-sm">Página {Math.floor(skip/limit)+1} de {Math.max(1, Math.ceil(total/limit))}</span>
                <Button variant="outline" size="sm" disabled={skip+limit>=total} onClick={() => setSkip(skip + limit)}>Siguiente</Button>
                <Select value={String(limit)} onValueChange={(v)=>{ setLimit(Number(v)); setSkip(0); }}>
                  <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">10</SelectItem>
                    <SelectItem value="20">20</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Crear Usuario</DialogTitle>
          </DialogHeader>
          <form onSubmit={createUser} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" name="email" type="email" value={form.email} onChange={onChange} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Contraseña</Label>
                  <Input id="password" name="password" type="password" value={form.password} onChange={onChange} required />
                  <div className="text-xs text-muted-foreground space-y-1 mt-1">
                    <p>Requisitos de contraseña:</p>
                    <p className={passwordHints.len ? "text-green-600" : ""}>• 8 caracteres mínimo</p>
                    <p className={passwordHints.upper ? "text-green-600" : ""}>• Al menos una mayúscula</p>
                    <p className={passwordHints.special ? "text-green-600" : ""}>• Al menos un carácter especial</p>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="full_name">Nombre completo</Label>
                  <Input id="full_name" name="full_name" value={form.full_name || ""} onChange={onChange} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="role">Rol</Label>
                  <Select value={role} onValueChange={(v) => setRole(v)}>
                    <SelectTrigger id="role" className="w-full"><SelectValue placeholder="Selecciona un rol" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Administrador</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
            <div className="flex gap-2 justify-end">
              <Button type="button" variant="secondary" onClick={() => setShowCreate(false)}>Cancelar</Button>
              <Button type="submit">Crear</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingUser} onOpenChange={(open)=> !open && setEditingUser(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar Usuario</DialogTitle>
          </DialogHeader>
          <form onSubmit={saveEdit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="edit_email">Email</Label>
                  <Input id="edit_email" name="email" type="email" value={editForm.email} onChange={onEditChange} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit_full_name">Nombre completo</Label>
                  <Input id="edit_full_name" name="full_name" value={editForm.full_name} onChange={onEditChange} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit_role">Rol</Label>
                  <Select value={editForm.role} onValueChange={(v) => setEditForm(prev => ({ ...prev, role: v }))}>
                    <SelectTrigger id="edit_role" className="w-full"><SelectValue placeholder="Selecciona un rol" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Administrador</SelectItem>
                      <SelectItem value="user">Usuario</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit_is_active">Activo</Label>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={!!editForm.is_active}
                      onCheckedChange={(checked) => setEditForm(prev => ({ ...prev, is_active: Boolean(checked) }))}
                      aria-label="Cambiar estado activo"
                    />
                    <span className="text-sm text-muted-foreground">{editForm.is_active ? "Activo" : "Inactivo"}</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit_password">Nueva contraseña (opcional)</Label>
                  <Input id="edit_password" name="password" type="password" value={editForm.password} onChange={onEditChange} />
                  <div className="text-xs text-muted-foreground space-y-1 mt-1">
                    <p>Requisitos de contraseña:</p>
                    <p className={editPasswordHints.len ? "text-green-600" : ""}>• 8 caracteres mínimo</p>
                    <p className={editPasswordHints.upper ? "text-green-600" : ""}>• Al menos una mayúscula</p>
                    <p className={editPasswordHints.special ? "text-green-600" : ""}>• Al menos un carácter especial</p>
                  </div>
                </div>
            <div className="flex gap-2 justify-end">
              <Button type="button" variant="secondary" onClick={() => setEditingUser(null)}>Cancelar</Button>
              <Button type="submit">Guardar</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}