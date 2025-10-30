"use client";

import { AppSidebar } from "./AppSidebar";
import { SidebarProvider, SidebarTrigger, useSidebar } from "./ui/sidebar"; // Import useSidebar
import { Button } from "./ui/button"; // Import Button
import { PanelLeft } from "lucide-react"; // Import PanelLeft icon
import { usePathname } from "next/navigation"; // Import usePathname

export function RootLayoutClient({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <RootLayoutContent>{children}</RootLayoutContent>
    </SidebarProvider>
  );
}

// Nuevo componente interno para acceder al contexto del sidebar
function RootLayoutContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isChatRoute = pathname === "/chat";

  return (
    <div className="flex h-full bg-background">
      {!isChatRoute && <AppSidebar />}
      <div className="flex-1 flex flex-col">
        {!isChatRoute && (
          <div className="ml-2 mt-5">
            <SidebarTrigger className="text-primary hover:text-accent transition-colors" />
          </div>
        )}
        <main className={`flex-1 ${isChatRoute ? "p-0" : "p-4"}`}>
          {children}
        </main>
      </div>
    </div>
  );
}
