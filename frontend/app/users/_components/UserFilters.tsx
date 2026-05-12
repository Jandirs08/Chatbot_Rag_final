"use client";

import { Search } from "lucide-react";
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
}

export function UserFilters({
  search,
  onSearchChange,
  roleFilter,
  onRoleChange,
  activeFilter,
  onActiveChange,
}: UserFiltersProps) {
  return (
    <div className="flex flex-wrap gap-4 items-end rounded-lg border border-border bg-card px-4 py-3">
      <div className="space-y-1.5 w-full md:w-64">
        <Label htmlFor="search" className="text-label text-muted-foreground">Buscar</Label>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            id="search"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Email o usuario"
            className="pl-8"
          />
        </div>
      </div>
      <div className="space-y-1.5 w-full md:w-44">
        <Label htmlFor="filter_role" className="text-label text-muted-foreground">Rol</Label>
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
      <div className="space-y-1.5 w-full md:w-44">
        <Label htmlFor="filter_active" className="text-label text-muted-foreground">Estado</Label>
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
    </div>
  );
}
