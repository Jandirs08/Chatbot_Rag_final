"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { AppSidebar } from "./AppSidebar";
import { SidebarProvider, SidebarTrigger } from "./ui/sidebar";
import { useBrandColor } from "@/app/hooks/useBrandColor";
import { useAuth } from "@/app/hooks/useAuth";
import { isProtectedPath } from "@/app/lib/auth/routeAccess";

export function RootLayoutClient({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <RootLayoutContent>{children}</RootLayoutContent>
    </SidebarProvider>
  );
}

function AuthRouteGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  const pathname = usePathname();
  const isCurrentRouteProtected = isProtectedPath(pathname);
  const hasRedirectedRef = useRef(false);

  useEffect(() => {
    if (!isCurrentRouteProtected || isAuthenticated) {
      hasRedirectedRef.current = false;
      return;
    }

    if (hasRedirectedRef.current) {
      return;
    }

    hasRedirectedRef.current = true;
    window.location.replace("/auth/login");
  }, [isAuthenticated, isCurrentRouteProtected]);

  if (isCurrentRouteProtected && !isAuthenticated) {
    return null;
  }

  return <>{children}</>;
}

function RootLayoutContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  useBrandColor();

  useEffect(() => {
    const saved = localStorage.getItem("theme");
    const isDarkSaved = saved === "dark";
    const forceLight = pathname.startsWith("/chat");

    if (forceLight) {
      document.documentElement.classList.remove("dark");
    } else {
      document.documentElement.classList.toggle("dark", isDarkSaved);
    }
  }, [pathname]);

  const shouldShowSidebar = isProtectedPath(pathname);

  return (
    <AuthRouteGuard>
      <div
        className="flex h-screen w-full overflow-hidden"
        style={{ background: "hsl(var(--surface))" }}
      >
        {shouldShowSidebar && <AppSidebar />}

        <div className="flex flex-1 flex-col overflow-hidden">
          <main className="h-full flex-1 overflow-y-auto overflow-x-hidden text-foreground">
            {shouldShowSidebar && (
              <div className="fixed left-4 top-4 z-40 md:hidden">
                <SidebarTrigger />
              </div>
            )}
            {shouldShowSidebar ? (
              <div className="w-full p-8">{children}</div>
            ) : (
              children
            )}
          </main>
        </div>
      </div>
    </AuthRouteGuard>
  );
}
