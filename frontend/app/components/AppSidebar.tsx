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
import React from "react";
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
import { getBotConfig } from "../lib/services/botConfigService";
import { logger } from "@/app/lib/logger";
import { toast } from "sonner";

type MenuItem = { title: string; url: string; icon: LucideIcon };

export function AppSidebar() {
  const { state, isMobile, setOpenMobile } = useSidebar();
  const { user, logout, isAdmin } = useAuth();
  const router = useRouter();
  const [isDark, setIsDark] = React.useState(false);
  const [botName, setBotName] = React.useState<string | undefined>(undefined);
  const pathname = usePathname();

  const isUrlActive = (url: string) => {
    if (url === "/") return pathname === "/";
    return pathname?.startsWith(url) ?? false;
  };

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
        {/* Operación del bot */}
        <SidebarGroup>
          <SidebarGroupLabel className={state === "collapsed" ? "hidden" : ""}>
            Operación
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {([
                { title: "Home", url: "/", icon: BarChart3 },
                { title: "Chat", url: "/chat", icon: MessageCircle },
                ...(isAdmin ? [{ title: "Buzón", url: "/admin/inbox", icon: MessageSquare }] : []),
              ] as MenuItem[]).map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={isUrlActive(item.url)}
                    className={`transition-all duration-200 ${state === "collapsed" ? "flex flex-col items-center justify-center" : ""}`}
                    tooltip={{
                      children: item.title,
                      className:
                        "bg-slate-900 text-white text-xs rounded px-2 py-1 z-50",
                    }}
                  >
                    <Link
                      href={item.url}
                      className={`flex ${state === "collapsed" ? "flex-col items-center justify-center" : "items-center"} gap-3`}
                      onClick={() => {
                        if (isMobile) setOpenMobile(false);
                      }}
                    >
                      <item.icon className={`${state === "collapsed" ? "w-6 h-6" : "w-5 h-5"}`} />
                      {state !== "collapsed" && <span>{item.title}</span>}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Canales */}
        <SidebarGroup>
          <SidebarGroupLabel className={state === "collapsed" ? "hidden" : ""}>
            Canales
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {([
                { title: "Web", url: "/widget", icon: Code },
                { title: "WhatsApp", url: "/whatsapp-settings", icon: MessageSquareText },
              ] as MenuItem[]).map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={isUrlActive(item.url)}
                    className={`transition-all duration-200 ${state === "collapsed" ? "flex flex-col items-center justify-center" : ""}`}
                    tooltip={{
                      children: item.title,
                      className:
                        "bg-slate-900 text-white text-xs rounded px-2 py-1 z-50",
                    }}
                  >
                    <Link
                      href={item.url}
                      className={`flex ${state === "collapsed" ? "flex-col items-center justify-center" : "items-center"} gap-3`}
                      onClick={() => {
                        if (isMobile) setOpenMobile(false);
                      }}
                    >
                      <item.icon className={`${state === "collapsed" ? "w-6 h-6" : "w-5 h-5"}`} />
                      {state !== "collapsed" && <span>{item.title}</span>}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Conocimiento */}
        <SidebarGroup>
          <SidebarGroupLabel className={state === "collapsed" ? "hidden" : ""}>
            Conocimiento
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {([{ title: "Documentos", url: "/docs", icon: FileText }] as MenuItem[]).map(
                (item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      isActive={isUrlActive(item.url)}
                      className={`transition-all duration-200 ${state === "collapsed" ? "flex flex-col items-center justify-center" : ""}`}
                      tooltip={{
                        children: item.title,
                        className: "bg-slate-900 text-white text-xs rounded px-2 py-1 z-50",
                      }}
                    >
                      <Link
                        href={item.url}
                        className={`flex ${state === "collapsed" ? "flex-col items-center justify-center" : "items-center"} gap-3`}
                        onClick={() => {
                          if (isMobile) setOpenMobile(false);
                        }}
                      >
                        <item.icon className={`${state === "collapsed" ? "w-6 h-6" : "w-5 h-5"}`} />
                        {state !== "collapsed" && <span>{item.title}</span>}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ),
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Sistema */}
        <SidebarGroup>
          <SidebarGroupLabel className={state === "collapsed" ? "hidden" : ""}>
            Sistema
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {(
                [
                  ...(isAdmin ? [{ title: "Usuarios", url: "/users", icon: Users }] : []),
                  ...(isAdmin ? [{ title: "Configuración", url: "/admin/settings", icon: Settings }] : []),
                  ...(isAdmin ? [{ title: "Debug Chat", url: "/dashboard/playground", icon: FlaskConical }] : []),
                ] as MenuItem[]
              ).map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={isUrlActive(item.url)}
                    className={`transition-all duration-200 ${state === "collapsed" ? "flex flex-col items-center justify-center" : ""}`}
                    tooltip={{
                      children: item.title,
                      className: "bg-slate-900 text-white text-xs rounded px-2 py-1 z-50",
                    }}
                  >
                    <Link
                      href={item.url}
                      className={`flex ${state === "collapsed" ? "flex-col items-center justify-center" : "items-center"} gap-3`}
                      onClick={() => {
                        if (isMobile) setOpenMobile(false);
                      }}
                    >
                      <item.icon className={`${state === "collapsed" ? "w-6 h-6" : "w-5 h-5"}`} />
                      {state !== "collapsed" && <span>{item.title}</span>}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
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
              className={`flex items-center w-full gap-2 px-2 py-1.5 text-[12px] text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-md transition-colors ${state === "collapsed" ? "justify-center" : ""}`}
            >
              <LogOut className="w-3.5 h-3.5" />
              {state !== "collapsed" && <span>Cerrar sesión</span>}
            </button>
            <div
              className={`w-full ${state === "collapsed" ? "flex justify-center" : "px-2"}`}
            >
              <button
                onClick={toggleTheme}
                className={`flex items-center gap-2 py-1 text-[11px] text-muted-foreground/60 hover:text-muted-foreground transition-colors ${state === "collapsed" ? "" : ""}`}
                aria-label={isDark ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
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
