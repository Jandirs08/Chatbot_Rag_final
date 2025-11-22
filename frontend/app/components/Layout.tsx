import { SidebarTrigger } from "./ui/sidebar";

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  return (
    <div className="h-screen overflow-hidden flex w-full bg-gradient-to-br from-background via-muted/30 to-secondary/10">
      <main className="flex-1 h-full overflow-auto p-6">{children}</main>
    </div>
  );
}
