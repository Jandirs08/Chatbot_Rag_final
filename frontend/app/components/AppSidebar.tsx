"use client";

import {
  Bot,
  FileText,
  Settings,
  BarChart3,
  Code,
  Users,
  MessageCircle,
  MessageSquareText,
  MessageSquare,
  LogOut,
  Sun,
  Moon,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from "./ui/sidebar";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "../hooks/useAuth";
import { Button } from "./ui/button";
// removed Switch in favor of a simple toggle button
import { useRouter } from "next/navigation";
import { getBotConfig } from "../lib/services/botConfigService";
import { logger } from "@/app/lib/logger";
import { toast } from "sonner";

const baseMenuItems = [
  {
    title: "Home",
    url: "/",
    icon: BarChart3,
  },
  {
    title: "Chat",
    url: "/chat",
    icon: MessageCircle,
  },
  {
    title: "Web",
    url: "/widget",
    icon: Code,
  },
  {
    title: "WhatsApp",
    url: "/configuracion-whatsapp",
    icon: MessageSquareText,
  },
  {
    title: "Documentos",
    url: "/Documents",
    icon: FileText,
  },
  // removed standalone Ajustes page; settings live under Admin now
  {
    title: "Playground",
    url: "/dashboard/playground",
    icon: Code,
  },
];

const integrationItems = baseMenuItems.filter(
  (item) => item.title === "Widget" || item.title === "Configuración WhatsApp",
);

const mainMenuItems = baseMenuItems.filter(
  (item) => item.title !== "Widget" && item.title !== "Configuración WhatsApp",
);

export function AppSidebar() {
  const { state } = useSidebar();
  const { user, logout, isAdmin } = useAuth();
  const router = useRouter();
  const [isDark, setIsDark] = React.useState(false);
  const [botName, setBotName] = React.useState<string | undefined>(undefined);
  const pathname = usePathname();

  const handleLogout = async () => {
    try {
      const toastId = toast.loading("Cerrando sesión...");
      await logout();
      toast.dismiss(toastId);
      router.push("/auth/login");
    } catch (error) {
      logger.error("Error al cerrar sesión:", error);
    }
  };

  React.useEffect(() => {
    if (typeof document !== "undefined") {
      const saved = localStorage.getItem("theme");
      const isDarkClass =
        saved === "dark" || document.documentElement.classList.contains("dark");
      document.documentElement.classList.toggle("dark", isDarkClass);
      setIsDark(isDarkClass);
    }
  }, []);

  React.useEffect(() => {
    (async () => {
      try {
        const cfg = await getBotConfig();
        setBotName(cfg.bot_name || undefined);
      } catch (_e) {
        setBotName(undefined);
      }
    })();
  }, []);

  const toggleTheme = () => {
    if (typeof document === "undefined") return;
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
    setIsDark(next);
  };

  return (
    <Sidebar className="border-r border-border/50 bg-white dark:bg-slate-900 dark:border-slate-800 flex-shrink-0 h-full transition-all duration-300">
      <SidebarHeader className="p-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-orange-100 text-orange-600 dark:bg-slate-800 dark:text-orange-500">
            <Bot className="w-6 h-6" />
          </div>
          <div className={state === "collapsed" ? "hidden" : ""}>
            <h2 className="text-lg font-bold text-foreground dark:text-white">
              {botName ?? "Asistente"}
            </h2>
            <p className="text-sm text-muted-foreground dark:text-slate-400">
              {botName ?? "Becas Grupo Romero"}
            </p>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel
            className={
              state === "collapsed" ? "hidden" : "text-primary font-semibold"
            }
          >
            Gestión del Bot
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {(isAdmin
                ? [
                    ...mainMenuItems,
                    {
                      title: "Buzón",
                      url: "/admin/inbox",
                      icon: MessageSquare,
                    },
                    { title: "Usuarios", url: "/usuarios", icon: Users },
                    {
                      title: "Configuración",
                      url: "/admin/settings",
                      icon: Settings,
                    },
                  ]
                : mainMenuItems
              ).map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname === item.url}
                    className={`hover:bg-primary/10 hover:text-primary transition-all duration-200 dark:hover:bg-slate-800 dark:hover:text-white ${state === "collapsed" ? "flex flex-col items-center justify-center" : ""}`}
                    tooltip={{
                      children: item.title,
                      className:
                        "bg-slate-900 text-white text-xs rounded px-2 py-1 z-50",
                    }}
                  >
                    <Link
                      href={item.url}
                      className={`flex ${state === "collapsed" ? "flex-col items-center justify-center" : "items-center"} gap-3`}
                    >
                      <item.icon
                        className={`${state === "collapsed" ? "w-6 h-6" : "w-5 h-5"}`}
                      />
                      {state !== "collapsed" && <span>{item.title}</span>}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel
            className={
              state === "collapsed" ? "hidden" : "text-primary font-semibold"
            }
          >
            Integraciones
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {integrationItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname === item.url}
                    className={`hover:bg-primary/10 hover:text-primary transition-all duration-200 ${state === "collapsed" ? "flex flex-col items-center justify-center" : ""}`}
                    tooltip={{
                      children: item.title,
                      className:
                        "bg-slate-900 text-white text-xs rounded px-2 py-1 z-50",
                    }}
                  >
                    <Link
                      href={item.url}
                      className={`flex ${state === "collapsed" ? "flex-col items-center justify-center" : "items-center"} gap-3`}
                    >
                      <item.icon
                        className={`${state === "collapsed" ? "w-6 h-6" : "w-5 h-5"}`}
                      />
                      {state !== "collapsed" && <span>{item.title}</span>}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-4 border-t border-border/50 dark:border-slate-800">
        {user && (
          <div className="space-y-3">
            {state !== "collapsed" && (
              <div className="px-2">
                <p className="text-sm font-medium text-foreground truncate">
                  {user.username}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {user.email}
                </p>
                {isAdmin && (
                  <span className="inline-block mt-1 px-2 py-1 text-xs bg-primary/10 text-primary rounded-full">
                    Administrador
                  </span>
                )}
              </div>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={handleLogout}
              className={`w-full gap-2 text-gray-500 hover:text-red-600 dark:text-slate-400 dark:hover:text-red-500 border-border/50 hover:bg-transparent dark:border-slate-700 ${state === "collapsed" ? "justify-center" : "justify-start"}`}
            >
              <LogOut className="w-4 h-4" />
              {state !== "collapsed" && <span>Cerrar Sesión</span>}
            </Button>
            <div
              className={`w-full ${state === "collapsed" ? "flex justify-center" : "px-2"}`}
            >
              {state === "collapsed" ? (
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => {
                    const next = !isDark;
                    document.documentElement.classList.toggle("dark", next);
                    localStorage.setItem("theme", next ? "dark" : "light");
                    setIsDark(next);
                  }}
                  className="h-8 w-8 bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700 dark:hover:bg-slate-700"
                  aria-label={
                    isDark ? "Cambiar a modo claro" : "Cambiar a modo oscuro"
                  }
                >
                  {isDark ? (
                    <Sun className="w-4 h-4 text-yellow-500" />
                  ) : (
                    <Moon className="w-4 h-4 text-orange-400" />
                  )}
                </Button>
              ) : (
                <div className="relative inline-flex items-center gap-2">
                  <Sun className="w-4 h-4 text-gray-500 dark:text-slate-400" />
                  <div
                    role="button"
                    aria-label={
                      isDark ? "Cambiar a modo claro" : "Cambiar a modo oscuro"
                    }
                    onClick={() => {
                      const next = !isDark;
                      document.documentElement.classList.toggle("dark", next);
                      localStorage.setItem("theme", next ? "dark" : "light");
                      setIsDark(next);
                    }}
                    className={`relative h-7 w-14 rounded-full transition-colors ${isDark ? "bg-slate-800" : "bg-gray-200"}`}
                  >
                    <div
                      className={`absolute top-0.5 ${isDark ? "right-0.5" : "left-0.5"} h-6 w-6 rounded-full bg-white shadow transition-all flex items-center justify-center`}
                    >
                      {isDark ? (
                        <Moon className="w-4 h-4 text-slate-700" />
                      ) : (
                        <Sun className="w-4 h-4 text-yellow-500" />
                      )}
                    </div>
                  </div>
                  <Moon className="w-4 h-4 text-gray-500 dark:text-slate-400" />
                </div>
              )}
            </div>
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
import React from "react";
