"use client";

import { AppSidebar } from "./AppSidebar";
import { SidebarProvider, SidebarTrigger } from "./ui/sidebar";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { useBrandColor } from "@/app/hooks/useBrandColor";

export function RootLayoutClient({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <RootLayoutContent>{children}</RootLayoutContent>
    </SidebarProvider>
  );
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

  // ⭐️ regla única
  const shouldShowSidebar =
    !pathname.startsWith("/chat") && !pathname.startsWith("/auth"); // <- o login si es otra ruta

  return (
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
  );
}
