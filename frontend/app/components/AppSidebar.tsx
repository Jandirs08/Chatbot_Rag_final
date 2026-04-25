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
  FlaskConical,
  type LucideIcon,
} from "lucide-react";
import React, { useMemo, useCallback } from "react";
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
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "../hooks/useAuth";
import { useBotConfig } from "../hooks/useBotConfig";
import { useTheme } from "../hooks/useTheme";
import { logger } from "@/app/lib/logger";
import { toast } from "sonner";

type MenuItem = { title: string; url: string; icon: LucideIcon };

export function AppSidebar() {
  const { state, isMobile, setOpenMobile } = useSidebar();
  const { user, logout, isAdmin, isInitialized } = useAuth();
  const { data: botConfig } = useBotConfig({
    enabled: isInitialized && !!user,
    revalidateOnFocus: false,
  });
  const router = useRouter();
  const pathname = usePathname();
  const { isDark, toggle: toggleTheme } = useTheme();

  const isUrlActive = useCallback((url: string) => {
    if (url === "/") return pathname === "/";
    return pathname?.startsWith(url) ?? false;
  }, [pathname]);

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

  const operationItems = useMemo<MenuItem[]>(() => [
    { title: "Home", url: "/", icon: BarChart3 },
    { title: "Chat", url: "/chat", icon: MessageCircle },
    ...(isAdmin
      ? [{ title: "Buzón", url: "/admin/inbox", icon: MessageSquare }]
      : []),
  ], [isAdmin]);

  const channelItems = useMemo<MenuItem[]>(() => [
    { title: "Web", url: "/widget", icon: Code },
    { title: "WhatsApp", url: "/whatsapp-settings", icon: MessageSquareText },
  ], []);

  const knowledgeItems = useMemo<MenuItem[]>(() => [
    { title: "Documentos", url: "/docs", icon: FileText },
  ], []);

  const systemItems = useMemo<MenuItem[]>(() => isAdmin
    ? [
        { title: "Usuarios", url: "/users", icon: Users },
        { title: "Configuración", url: "/admin/settings", icon: Settings },
        {
          title: "Debug Chat",
          url: "/dashboard/playground",
          icon: FlaskConical,
        },
      ]
    : [], [isAdmin]);

  const botName = user ? botConfig?.bot_name : undefined;

  const renderMenuGroup = useCallback((label: string, items: MenuItem[]) => {
    if (items.length === 0) return null;

    return (
      <SidebarGroup>
        <SidebarGroupLabel className={state === "collapsed" ? "hidden" : ""}>
          {label}
        </SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            {items.map((item) => (
              <SidebarMenuItem key={item.title}>
                <SidebarMenuButton
                  asChild
                  isActive={isUrlActive(item.url)}
                  className={`transition-all duration-200 ${
                    state === "collapsed"
                      ? "flex flex-col items-center justify-center"
                      : ""
                  }`}
                  tooltip={{
                    children: item.title,
                    className:
                      "bg-slate-900 text-white text-xs rounded px-2 py-1 z-50",
                  }}
                >
                  <Link
                    href={item.url}
                    className={`flex ${
                      state === "collapsed"
                        ? "flex-col items-center justify-center"
                        : "items-center"
                    } gap-3`}
                    onClick={() => {
                      if (isMobile) setOpenMobile(false);
                    }}
                  >
                    <item.icon
                      className={`${
                        state === "collapsed" ? "w-6 h-6" : "w-5 h-5"
                      }`}
                    />
                    {state !== "collapsed" && <span>{item.title}</span>}
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    );
  }, [state, isMobile, setOpenMobile, isUrlActive]);

  return (
    <Sidebar className="flex-shrink-0 h-screen transition-all duration-200">
      <SidebarHeader className="px-3 py-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-md flex items-center justify-center bg-orange-50 text-orange-600 dark:bg-slate-800 dark:text-orange-400">
            <Bot className="w-4.5 h-4.5" />
          </div>
          <div className={state === "collapsed" ? "hidden" : ""}>
            <h2 className="text-sm font-semibold text-foreground dark:text-white leading-tight">
              {botName ?? "Asistente"}
            </h2>
            <p className="text-[11px] text-muted-foreground/70 dark:text-slate-500">
              Panel de control
            </p>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        {renderMenuGroup("Operación", operationItems)}
        {renderMenuGroup("Canales", channelItems)}
        {renderMenuGroup("Conocimiento", knowledgeItems)}
        {renderMenuGroup("Sistema", systemItems)}
      </SidebarContent>

      <SidebarFooter className="px-3 py-3 border-t border-slate-200 dark:border-slate-800">
        {user && (
          <div className="space-y-2">
            {state !== "collapsed" && (
              <div className="flex items-center gap-2 px-2">
                <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-[10px] font-medium text-muted-foreground">
                  {user.username?.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-medium text-foreground truncate leading-tight">
                    {user.username}
                  </p>
                  <p className="text-[10px] text-muted-foreground/60 truncate leading-tight">
                    {isAdmin ? "Admin" : "Usuario"}
                  </p>
                </div>
              </div>
            )}
            <button
              onClick={handleLogout}
              className={`flex items-center w-full gap-2 px-2 py-1.5 text-[12px] text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-md transition-colors ${
                state === "collapsed" ? "justify-center" : ""
              }`}
            >
              <LogOut className="w-3.5 h-3.5" />
              {state !== "collapsed" && <span>Cerrar sesión</span>}
            </button>
            <div
              className={`w-full ${
                state === "collapsed" ? "flex justify-center" : "px-2"
              }`}
            >
              <button
                onClick={toggleTheme}
                className="flex items-center gap-2 py-1 text-[11px] text-muted-foreground/60 hover:text-muted-foreground transition-colors"
                aria-label={
                  isDark ? "Cambiar a modo claro" : "Cambiar a modo oscuro"
                }
              >
                {isDark ? (
                  <Sun className="w-3.5 h-3.5" />
                ) : (
                  <Moon className="w-3.5 h-3.5" />
                )}
                {state !== "collapsed" && (
                  <span>{isDark ? "Modo claro" : "Modo oscuro"}</span>
                )}
              </button>
            </div>
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
