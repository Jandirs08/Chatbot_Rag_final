"use client";

import React from "react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/app/components/ui/dropdown-menu";
import { Download, Monitor, Settings, Upload, FileText, MessageSquare } from "lucide-react";
import { exportService } from "@/app/lib/services/exportService";
import { cn } from "@/lib/utils";

type IconComponent = React.ComponentType<{ className?: string }>;

type Action = {
  title: string;
  description: string;
  icon: IconComponent;
  href?: string;
  isExport?: boolean;
};

const actions: Action[] = [
  {
    title: "Ver Widget",
    description: "Previsualiza el chat embebido",
    icon: Monitor,
    href: "/widget",
  },
  {
    title: "Subir Documentos",
    description: "Añade PDFs al conocimiento",
    icon: Upload,
    href: "/docs",
  },
  {
    title: "Configurar Bot",
    description: "Ajusta prompt y modelo",
    icon: Settings,
    href: "/admin/settings",
  },
  {
    title: "Exportar Datos",
    description: "Descarga historial de chats",
    icon: Download,
    isExport: true,
  },
];

const tileBase = cn(
  "group flex flex-col gap-3 p-4 rounded-xl border border-border/60 bg-card",
  "hover:bg-primary/5 hover:border-primary/20",
  "transition-all duration-200 hover:-translate-y-0.5",
  "hover:shadow-[0_4px_20px_rgb(79_53_204_/_0.10)]",
  "cursor-pointer animate-count-reveal select-none",
);

function TileContent({ action }: { action: Action }) {
  return (
    <>
      <div className="w-8 h-8 rounded-lg bg-primary/8 flex items-center justify-center group-hover:bg-primary/14 transition-colors duration-200">
        <action.icon className="w-4 h-4 text-primary" />
      </div>
      <div>
        <p className="text-sm font-medium text-foreground">{action.title}</p>
        <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{action.description}</p>
      </div>
    </>
  );
}

export default function DashboardQuickActions() {
  return (
    <div className="grid grid-cols-2 gap-2.5">
      {actions.map((action, index) => {
        const delay = index * 55;

        if (action.isExport) {
          return (
            <DropdownMenu key={index}>
              <DropdownMenuTrigger asChild>
                <div
                  role="button"
                  aria-label={action.title}
                  className={tileBase}
                  style={{ animationDelay: `${delay}ms` }}
                >
                  <TileContent action={action} />
                </div>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">
                  Formato de exportación
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => exportService.exportConversations("xlsx")}
                  className="cursor-pointer"
                >
                  <FileText className="w-4 h-4 mr-2 text-success" />
                  Excel (.xlsx)
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => exportService.exportConversations("csv")}
                  className="cursor-pointer"
                >
                  <FileText className="w-4 h-4 mr-2 text-primary" />
                  CSV
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => exportService.exportConversations("json", { pretty: true })}
                  className="cursor-pointer"
                >
                  <MessageSquare className="w-4 h-4 mr-2 text-primary" />
                  JSON
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          );
        }

        return (
          <a
            key={index}
            href={action.href}
            aria-label={action.title}
            className={tileBase}
            style={{ animationDelay: `${delay}ms` }}
          >
            <TileContent action={action} />
          </a>
        );
      })}
    </div>
  );
}
