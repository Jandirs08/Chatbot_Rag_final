"use client";

import { useState } from "react";
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
import type { CreateUserData } from "@/app/lib/services/userService";
import { PasswordPolicyHints } from "./PasswordPolicyHints";
import {
  EMPTY_HINTS,
  evaluatePassword,
  isValidPassword,
} from "./passwordHints";

interface UserCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (payload: CreateUserData) => Promise<void>;
  onError: (message: string) => void;
}

export function UserCreateDialog({
  open,
  onOpenChange,
  onSubmit,
  onError,
}: UserCreateDialogProps) {
  const [form, setForm] = useState<CreateUserData>({
    email: "",
    password: "",
    full_name: "",
    is_admin: true,
  });
  const [role, setRole] = useState("admin");
  const [hints, setHints] = useState(EMPTY_HINTS);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const reset = () => {
    setForm({ email: "", password: "", full_name: "", is_admin: true });
    setRole("admin");
    setHints(EMPTY_HINTS);
  };

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
    if (isSubmitting) return;
    if (!isValidPassword(hints)) {
      onError(
        "La contraseña debe tener mínimo 8 caracteres, una mayúscula y un carácter especial.",
      );
      return;
    }
    const payload: CreateUserData = {
      email: form.email,
      password: form.password,
      full_name: form.full_name,
      is_admin: role === "admin",
    };
    setIsSubmitting(true);
    try {
      await onSubmit(payload);
      reset();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Crear Usuario</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              value={form.email}
              onChange={handleChange}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Contraseña</Label>
            <Input
              id="password"
              name="password"
              type="password"
              value={form.password}
              onChange={handleChange}
              required
            />
            <PasswordPolicyHints hints={hints} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="full_name">Nombre completo</Label>
            <Input
              id="full_name"
              name="full_name"
              value={form.full_name || ""}
              onChange={handleChange}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="role">Rol</Label>
            <Select value={role} onValueChange={(v) => setRole(v)}>
              <SelectTrigger id="role" className="w-full">
                <SelectValue placeholder="Selecciona un rol" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">Administrador</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2 justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Creando..." : "Crear"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
