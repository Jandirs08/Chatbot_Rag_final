"use client";

import {
  Bot,
  FileText,
  Settings,
  BarChart3,
  Code,
  User,
  MessageCircle,
  LogOut,
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
import { useAuth } from "../hooks/useAuth";
import { Button } from "./ui/button";
import { useRouter } from "next/navigation";

const menuItems = [
  {
    title: "Dashboard",
    url: "/",
    icon: BarChart3,
  },
  {
    title: "Chat",
    url: "/chat",
    icon: MessageCircle,
  },
  {
    title: "Widget",
    url: "/widget",
    icon: Code,
  },
  {
    title: "Documentos",
    url: "/Documents",
    icon: FileText,
  },
  {
    title: "Configuración",
    url: "/configuracion",
    icon: Settings,
  },
  {
    title: "Cuenta",
    url: "/cuenta",
    icon: User,
  },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const { user, logout, isAdmin } = useAuth();
  const router = useRouter();

  const handleLogout = async () => {
    try {
      await logout();
      router.push("/auth/login");
    } catch (error) {
      console.error("Error al cerrar sesión:", error);
    }
  };

  return (
    <Sidebar className="border-r border-border/50">
      <SidebarHeader className="p-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg gradient-primary flex items-center justify-center">
            <Bot className="w-6 h-6 text-white" />
          </div>
          <div className={state === "collapsed" ? "hidden" : ""}>
            <h2 className="text-lg font-bold text-foreground">RAG Bot</h2>
            <p className="text-sm text-muted-foreground">Becas Grupo Romero</p>
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
              {menuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    className="hover:bg-primary/10 hover:text-primary transition-all duration-200"
                  >
                    <a href={item.url} className="flex items-center gap-3">
                      <item.icon className="w-5 h-5" />
                      {state !== "collapsed" && <span>{item.title}</span>}
                    </a>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-4 border-t border-border/50">
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
              variant="ghost"
              size="sm"
              onClick={handleLogout}
              className="w-full justify-start gap-2 text-muted-foreground hover:text-foreground"
            >
              <LogOut className="w-4 h-4" />
              {state !== "collapsed" && <span>Cerrar Sesión</span>}
            </Button>
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
