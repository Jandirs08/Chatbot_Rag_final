"use client";

import React from "react";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/app/components/ui/popover";
import { Switch } from "@/app/components/ui/switch";
import { ListFilter } from "lucide-react";
import type { FilterConfig } from "./utils";

interface ConversationFiltersProps {
  config: FilterConfig;
  onChange: React.Dispatch<React.SetStateAction<FilterConfig>>;
}

const todayString = () => {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
};

const lastWeekRange = () => {
  const t = new Date();
  const end = new Date(t.getFullYear(), t.getMonth(), t.getDate());
  const start = new Date(end);
  start.setDate(end.getDate() - 7);
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { start: fmt(start), end: fmt(end) };
};

export function ConversationFilters({
  config,
  onChange,
}: ConversationFiltersProps) {
  const today = todayString();
  const week = lastWeekRange();

  const isAll = !config.startDate && !config.endDate;
  const isToday = config.startDate === today && config.endDate === today;
  const isLastWeek =
    config.startDate === week.start && config.endDate === week.end;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          aria-label="Filtros"
          className="h-10 w-10 rounded-xl border-border/60 bg-background text-muted-foreground hover:bg-muted"
        >
          <ListFilter className="w-4 h-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-80 rounded-2xl border-border/60 p-4 shadow-xl"
      >
        <div className="space-y-4">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Fechas
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant={isAll ? "default" : "outline"}
              size="sm"
              onClick={() =>
                onChange((f) => ({ ...f, startDate: "", endDate: "" }))
              }
            >
              Todo
            </Button>
            <Button
              variant={isToday ? "default" : "outline"}
              size="sm"
              onClick={() =>
                onChange((f) => ({ ...f, startDate: today, endDate: today }))
              }
            >
              Hoy
            </Button>
            <Button
              variant={isLastWeek ? "default" : "outline"}
              size="sm"
              onClick={() =>
                onChange((f) => ({
                  ...f,
                  startDate: week.start,
                  endDate: week.end,
                }))
              }
            >
              Última Semana
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <Input
                type="date"
                aria-label="Fecha de inicio (AAAA-MM-DD)"
                value={config.startDate}
                onChange={(e) =>
                  onChange((f) => ({ ...f, startDate: e.target.value }))
                }
                placeholder="Desde"
              />
            </div>
            <div className="flex-1">
              <Input
                type="date"
                aria-label="Fecha de fin (AAAA-MM-DD)"
                value={config.endDate}
                onChange={(e) =>
                  onChange((f) => ({ ...f, endDate: e.target.value }))
                }
                placeholder="Hasta"
              />
            </div>
          </div>
          <div className="pt-2 space-y-2">
            <div className="text-xs font-semibold text-foreground">Calidad</div>
            <label className="flex items-center gap-2 text-sm">
              <Switch
                checked={config.hideTrivial}
                onCheckedChange={(v) =>
                  onChange((f) => ({ ...f, hideTrivial: !!v }))
                }
              />
              <span>Ocultar con ≤2 mensajes totales</span>
            </label>
          </div>
          <div className="pt-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                onChange({
                  search: "",
                  startDate: "",
                  endDate: "",
                  hideTrivial: false,
                })
              }
            >
              Limpiar Filtros
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
