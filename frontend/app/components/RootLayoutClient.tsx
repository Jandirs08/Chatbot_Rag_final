"use client";

import { AppSidebar } from "./AppSidebar";
import { SidebarProvider, SidebarTrigger } from "./ui/sidebar";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

export function RootLayoutClient({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <RootLayoutContent>{children}</RootLayoutContent>
    </SidebarProvider>
  );
}

function RootLayoutContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

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
    <div className="flex h-full w-full overflow-hidden bg-gray-50 dark:bg-slate-950">
      {shouldShowSidebar && <AppSidebar />}

      <div className="flex-1 flex flex-col overflow-hidden">
        {shouldShowSidebar && (
          <div className="shrink-0 h-14 flex items-center px-3 border-b border-slate-200 dark:border-slate-800">
            <SidebarTrigger />
          </div>
        )}

        <main
          className={`flex-1 overflow-y-auto ${
            shouldShowSidebar ? "p-4" : "p-0"
          } text-gray-900 dark:text-white`}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
