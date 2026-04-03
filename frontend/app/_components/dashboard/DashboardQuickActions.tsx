"use client";

import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/app/components/ui/dropdown-menu";
import { Download, Monitor, Settings, Upload, ChevronRight, FileText, MessageSquare } from "lucide-react";
import { exportService } from "@/app/lib/services/exportService";

type IconComponent = React.ComponentType<{ className?: string }>;

type Action = {
  title: string;
  description: string;
  icon: IconComponent;
  href?: string;
  color: string;
  isExport?: boolean;
};

const actions: Action[] = [
  {
    title: "Ver Widget",
    description: "Previsualiza el chat embebido",
    icon: Monitor,
    href: "/widget",
    color: "blue",
  },
  {
    title: "Subir Documentos",
    description: "Añade PDFs al conocimiento",
    icon: Upload,
    href: "/docs",
    color: "emerald",
  },
  {
    title: "Configurar Bot",
    description: "Ajusta prompt y modelo",
    icon: Settings,
    href: "/admin/settings",
    color: "violet",
  },
  {
    title: "Exportar Datos",
    description: "Descarga historial de chats",
    icon: Download,
    color: "amber",
    isExport: true,
  },
];

const colorClasses: Record<string, { bg: string; icon: string; hoverBg: string }> = {
  blue: {
    bg: "bg-blue-50 dark:bg-blue-950/50",
    icon: "text-blue-600 dark:text-blue-400",
    hoverBg: "group-hover:bg-blue-100 dark:group-hover:bg-blue-950",
  },
  emerald: {
    bg: "bg-emerald-50 dark:bg-emerald-950/50",
    icon: "text-emerald-600 dark:text-emerald-400",
    hoverBg: "group-hover:bg-emerald-100 dark:group-hover:bg-emerald-950",
  },
  violet: {
    bg: "bg-violet-50 dark:bg-violet-950/50",
    icon: "text-violet-600 dark:text-violet-400",
    hoverBg: "group-hover:bg-violet-100 dark:group-hover:bg-violet-950",
  },
  amber: {
    bg: "bg-amber-50 dark:bg-amber-950/50",
    icon: "text-amber-600 dark:text-amber-400",
    hoverBg: "group-hover:bg-amber-100 dark:group-hover:bg-amber-950",
  },
};

function ActionItem({ action }: { action: Action }) {
  const colors = colorClasses[action.color];

  return (
    <div className="group flex items-center gap-4 p-3 -mx-3 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-all duration-200 cursor-pointer">
      {/* Icon with colored background */}
      <div
        className={`w-10 h-10 rounded-xl ${colors.bg} ${colors.hoverBg} flex items-center justify-center flex-shrink-0 transition-colors duration-200`}
      >
        <action.icon className={`w-5 h-5 ${colors.icon}`} />
      </div>

      {/* Text content */}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-slate-900 dark:text-white group-hover:text-slate-900 dark:group-hover:text-white transition-colors">
          {action.title}
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          {action.description}
        </p>
      </div>

      {/* Arrow indicator */}
      <ChevronRight className="w-4 h-4 text-slate-300 dark:text-slate-600 group-hover:text-slate-400 dark:group-hover:text-slate-500 transition-colors" />
    </div>
  );
}

export default function DashboardQuickActions() {
  return (
    <div className="space-y-1">
      {actions.map((action, index) => {
        if (action.isExport) {
          return (
            <DropdownMenu key={index}>
              <DropdownMenuTrigger asChild>
                <div role="button">
                  <ActionItem action={action} />
                </div>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuLabel className="text-xs font-medium text-slate-500">
                  Formato de exportación
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => exportService.exportConversations("xlsx")}
                  className="cursor-pointer"
                >
                  <FileText className="w-4 h-4 mr-2 text-emerald-600" />
                  Excel (.xlsx)
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => exportService.exportConversations("csv")}
                  className="cursor-pointer"
                >
                  <FileText className="w-4 h-4 mr-2 text-blue-600" />
                  CSV
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => exportService.exportConversations("json", { pretty: true })}
                  className="cursor-pointer"
                >
                  <MessageSquare className="w-4 h-4 mr-2 text-violet-600" />
                  JSON
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          );
        }

        return action.href ? (
          <a key={index} href={action.href} className="block">
            <ActionItem action={action} />
          </a>
        ) : (
          <div key={index}>
            <ActionItem action={action} />
          </div>
        );
      })}
    </div>
  );
}
