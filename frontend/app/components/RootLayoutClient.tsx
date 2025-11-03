"use client";

import { AppSidebar } from "./AppSidebar";
import { SidebarProvider, SidebarTrigger } from "./ui/sidebar";
import { usePathname } from "next/navigation";
import { useAuth } from "../hooks/useAuth";

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
  
  // Rutas que no necesitan sidebar
  const isChatRoute = pathname === "/chat";
  const isAuthRoute = pathname.startsWith("/auth");
  
  // Mostrar sidebar solo si está autenticado y no es una ruta especial
  const shouldShowSidebar = isAuthenticated && !isChatRoute && !isAuthRoute;

  // Evitar mostrar loading global; el middleware gestiona redirecciones

  return (
    <div className="flex h-full bg-background">
      {shouldShowSidebar && <AppSidebar />}
      <div className="flex-1 flex flex-col">
        {shouldShowSidebar && (
          <div className="ml-2 mt-5">
            <SidebarTrigger className="text-primary hover:text-accent transition-colors" />
          </div>
        )}
        <main className={`flex-1 ${isChatRoute || isAuthRoute ? "p-0" : "p-4"}`}>
          {children}
        </main>
      </div>
    </div>
  );
}
