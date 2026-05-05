"use client";

import { useState, useEffect } from "react";
import { Button } from "@/app/components/ui/button";
import { Switch } from "@/app/components/ui/switch";
import { Clock, Settings, Upload } from "lucide-react";
import { cn } from "@/lib/utils";

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Buenos días";
  if (h < 19) return "Buenas tardes";
  return "Buenas noches";
}

function getDateStr() {
  return new Date().toLocaleDateString("es-PE", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

interface DashboardHeaderProps {
  isBotActive: boolean;
  isLoading: boolean;
  relativeLastActivity: string;
  onToggle: (checked: boolean) => void;
}

export default function DashboardHeader({
  isBotActive,
  isLoading,
  relativeLastActivity,
  onToggle,
}: DashboardHeaderProps) {
  const [greeting, setGreeting] = useState("");
  const [dateStr, setDateStr] = useState("");

  useEffect(() => {
    setGreeting(getGreeting());
    setDateStr(getDateStr());
  }, []);

  return (
    <header className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
      <div className="space-y-4">
        <div className="space-y-0.5">
          <h1 className="text-foreground">{greeting}</h1>
          <p className="text-sm text-muted-foreground capitalize">{dateStr}</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div
            className={cn(
              "inline-flex items-center gap-2.5 px-3.5 py-1.5 rounded-full border text-sm font-medium transition-all duration-300",
              isBotActive
                ? "border-success/25 bg-success/5 text-success"
                : "border-error/25 bg-error/5 text-error",
            )}
          >
            <span className="relative flex-shrink-0 inline-flex w-2 h-2">
              <span
                className={cn(
                  "absolute inset-0 rounded-full",
                  isBotActive ? "animate-halo-green" : "animate-halo-red",
                )}
              />
              <span
                className={cn(
                  "relative block w-full h-full rounded-full",
                  isBotActive ? "bg-success animate-status-pulse" : "bg-error animate-status-pulse-fast",
                )}
              />
            </span>
            <span>{isBotActive ? "Sistema Activo" : "Sistema Pausado"}</span>
            <Switch
              checked={isBotActive}
              onCheckedChange={onToggle}
              disabled={isLoading}
              className="ml-1 data-[state=checked]:bg-success h-5 w-9"
            />
          </div>

          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="w-3.5 h-3.5" />
            Última actividad: {relativeLastActivity}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2.5">
        <a href="/dashboard/settings" aria-label="Configurar Bot">
          <Button variant="outline" size="sm">
            <Settings className="w-4 h-4" />
            Configuración
          </Button>
        </a>
        <a href="/docs" aria-label="Subir Documentos">
          <Button size="sm">
            <Upload className="w-4 h-4" />
            Subir PDF
          </Button>
        </a>
      </div>
    </header>
  );
}
