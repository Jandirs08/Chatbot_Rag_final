"use client";

import { AppSidebar } from "./AppSidebar";
import { SidebarProvider, SidebarTrigger } from "./ui/sidebar";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { useBrandColor } from "@/app/hooks/useBrandColor";
import { useAuth } from "@/app/hooks/useAuth";

export function RootLayoutClient({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <RootLayoutContent>{children}</RootLayoutContent>
    </SidebarProvider>
  );
}

/**
 * Renders a full-screen skeleton while the auth context is restoring the
 * session from the httpOnly cookie (initFromCookie). This is the single,
 * authoritative place to gate rendering — no component ever needs to check
 * authLoading individually.
 *
 * Only applied to sidebar pages (authenticated admin routes). The /chat and
 * /auth pages bypass this component and are always visible.
 */
function AuthLoadingGate({ children }: { children: React.ReactNode }) {
  const { isLoading } = useAuth();
  const pathname = usePathname();

  const isProtectedRoute =
    !pathname.startsWith("/chat") && !pathname.startsWith("/auth");

  if (isProtectedRoute && isLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Cargando sesión…</p>
        </div>
      </div>
    );
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

  const shouldShowSidebar =
    !pathname.startsWith("/chat") && !pathname.startsWith("/auth");

  return (
    <AuthLoadingGate>
      <div className="flex h-screen w-full overflow-hidden" style={{ background: 'hsl(var(--surface))' }}>
        {shouldShowSidebar && <AppSidebar />}

        <div className="flex-1 flex flex-col overflow-hidden">
          <main className="flex-1 h-full overflow-y-auto overflow-x-hidden text-foreground">
            {shouldShowSidebar && (
              <div className="md:hidden fixed left-4 top-4 z-40">
                <SidebarTrigger />
              </div>
            )}
            {shouldShowSidebar ? (
              <div className="w-full p-8">
                {children}
              </div>
            ) : (
              children
            )}
          </main>
        </div>
      </div>
    </AuthLoadingGate>
  );
}
