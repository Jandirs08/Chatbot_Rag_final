"use client";

import { usePathname } from "next/navigation";
import { AppSidebar } from "./AppSidebar";
import { SidebarProvider, SidebarTrigger } from "./ui/sidebar";
import { isProtectedPath } from "@/app/lib/auth/routeAccess";
import { useTheme } from "@/app/hooks/useTheme";

export function RootLayoutClient({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <RootLayoutContent>{children}</RootLayoutContent>
    </SidebarProvider>
  );
}

function RootLayoutContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const forcedLight = pathname.startsWith("/chat");
  useTheme(forcedLight);

  const shouldShowSidebar = isProtectedPath(pathname);

  return (
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
  );
}
