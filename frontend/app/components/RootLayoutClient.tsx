"use client";

import { AppSidebar } from "./AppSidebar";
import { SidebarProvider, SidebarTrigger } from "./ui/sidebar";
import { usePathname } from "next/navigation";
import { useAuth } from "../hooks/useAuth";
import { useEffect } from "react";

export function RootLayoutClient({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <RootLayoutContent>{children}</RootLayoutContent>
    </SidebarProvider>
  );
}

// Componente interno para acceder al contexto del sidebar y auth
function RootLayoutContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { isAuthenticated, isLoading } = useAuth();
  useEffect(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem("theme") : null;
    const isDarkSaved = saved === "dark";
    const forceLight = pathname === "/chat" || pathname === "/widget";
    if (typeof document !== "undefined") {
      if (forceLight) {
        document.documentElement.classList.remove("dark");
      } else {
        document.documentElement.classList.toggle("dark", isDarkSaved);
      }
    }
  }, [pathname]);
  
  // Rutas que no necesitan sidebar
  const isChatRoute = pathname === "/chat";
  const isAuthRoute = pathname.startsWith("/auth");
  const isWidgetRoute = pathname === "/widget";
  
  // Mostrar sidebar solo si está autenticado y no es una ruta especial
  const shouldShowSidebar = isAuthenticated && !isChatRoute && !isAuthRoute;

  // Evitar mostrar loading global; el middleware gestiona redirecciones

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50 dark:bg-slate-950">
      {shouldShowSidebar && <AppSidebar />}
      <div className="flex-1 h-full flex flex-col overflow-hidden">
        {shouldShowSidebar && (
          <div className="ml-2 mt-5">
            <SidebarTrigger className="text-primary hover:text-accent transition-colors" />
          </div>
        )}
        <main className={`flex-1 h-full overflow-y-auto ${isChatRoute || isAuthRoute || isWidgetRoute ? "p-0" : "p-4"} text-gray-900 dark:text-white`}>
          {children}
        </main>
      </div>
    </div>
  );
}
