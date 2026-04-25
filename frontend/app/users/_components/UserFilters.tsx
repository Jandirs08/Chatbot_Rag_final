"use client";

import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/app/components/ui/select";

interface UserFiltersProps {
  search: string;
  onSearchChange: (value: string) => void;
  roleFilter: string;
  onRoleChange: (value: string) => void;
  activeFilter: string;
  onActiveChange: (value: string) => void;
  total: number;
}

export function UserFilters({
  search,
  onSearchChange,
  roleFilter,
  onRoleChange,
  activeFilter,
  onActiveChange,
  total,
}: UserFiltersProps) {
  return (
    <div className="flex flex-wrap gap-4 items-end">
      <div className="space-y-2 w-full md:w-64">
        <Label htmlFor="search">Buscar</Label>
        <Input
          id="search"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Email o usuario"
        />
      </div>
      <div className="space-y-2 w-full md:w-56">
        <Label htmlFor="filter_role">Rol</Label>
        <Select value={roleFilter} onValueChange={onRoleChange}>
          <SelectTrigger id="filter_role" className="w-full">
            <SelectValue placeholder="Rol" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="admin">Administrador</SelectItem>
            <SelectItem value="user">Usuario</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2 w-full md:w-56">
        <Label htmlFor="filter_active">Estado</Label>
        <Select value={activeFilter} onValueChange={onActiveChange}>
          <SelectTrigger id="filter_active" className="w-full">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
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
  );
}
