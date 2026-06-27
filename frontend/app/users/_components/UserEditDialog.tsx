"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/app/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/app/components/ui/dialog";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/app/components/ui/select";
import { Switch } from "@/app/components/ui/switch";
import type { UserListItem } from "@/app/lib/services/userService";
import { PasswordPolicyHints } from "./PasswordPolicyHints";
import {
  EMPTY_HINTS,
  evaluatePassword,
  isValidPassword,
} from "./passwordHints";

interface EditFormState {
  email: string;
  full_name: string;
  role: string;
  is_active: boolean;
  password: string;
}

interface UserEditDialogProps {
  user: UserListItem | null;
  onClose: () => void;
  onSubmit: (id: string, payload: Record<string, unknown>) => Promise<void>;
}

export function UserEditDialog({
  user,
  onClose,
  onSubmit,
}: UserEditDialogProps) {
  const [form, setForm] = useState<EditFormState>({
    email: "",
    full_name: "",
    role: "admin",
    is_active: true,
    password: "",
  });
  const [hints, setHints] = useState(EMPTY_HINTS);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (user) {
      setForm({
        email: user.email,
        full_name: user.full_name || "",
        role: user.is_admin ? "admin" : "user",
        is_active: user.is_active,
        password: "",
      });
      setHints(EMPTY_HINTS);
      setIsSubmitting(false);
    }
  }, [user]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
    if (name === "password") {
      setHints(evaluatePassword(value));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (isSubmitting) return;
    const payload: Record<string, unknown> = {
      email: form.email !== user.email ? form.email : undefined,
      full_name: form.full_name,
      is_admin: form.role === "admin",
      is_active: form.is_active,
    };
    if (form.password) {
      if (!isValidPassword(hints)) {
        toast.error("La nueva contraseña no cumple la política");
        return;
      }
      payload.password = form.password;
    }
    setIsSubmitting(true);
    try {
      await onSubmit(user.id, payload);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog
      open={Boolean(user)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Editar Usuario</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit_email">Email</Label>
            <Input
              id="edit_email"
              name="email"
              type="email"
              value={form.email}
              onChange={handleChange}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit_full_name">Nombre completo</Label>
            <Input
              id="edit_full_name"
              name="full_name"
              value={form.full_name}
              onChange={handleChange}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit_role">Rol</Label>
            <Select
              value={form.role}
              onValueChange={(v) => setForm((prev) => ({ ...prev, role: v }))}
            >
              <SelectTrigger id="edit_role" className="w-full">
                <SelectValue placeholder="Selecciona un rol" />
              </SelectTrigger>
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
                checked={!!form.is_active}
                onCheckedChange={(checked) =>
                  setForm((prev) => ({ ...prev, is_active: Boolean(checked) }))
                }
                aria-label="Cambiar estado activo"
              />
              <span className="text-sm text-muted-foreground">
                {form.is_active ? "Activo" : "Inactivo"}
              </span>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit_password">Nueva contraseña (opcional)</Label>
            <Input
              id="edit_password"
              name="password"
              type="password"
              value={form.password}
              onChange={handleChange}
            />
            <PasswordPolicyHints hints={hints} />
          </div>
          <div className="flex gap-2 justify-end">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Guardando..." : "Guardar"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
