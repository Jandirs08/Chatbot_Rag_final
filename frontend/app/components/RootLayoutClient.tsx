"use client";

import { useEffect } from "react";
import { Loader2 } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { AppSidebar } from "./AppSidebar";
import { SidebarProvider, SidebarTrigger } from "./ui/sidebar";
import { isProtectedPath } from "@/app/lib/auth/routeAccess";
import { useAuth } from "@/app/hooks/useAuth";
import { useAuthContext } from "@/app/contexts/AuthContext";
import { useTheme } from "@/app/hooks/useTheme";
import { useInactivityTimeout } from "@/app/hooks/useInactivityTimeout";
import { BackendUnavailable } from "./BackendUnavailable";

export function RootLayoutClient({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <RootLayoutContent>{children}</RootLayoutContent>
    </SidebarProvider>
  );
}

function RootLayoutContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { isAuthenticated, isInitialized } = useAuth();
  const { error: authError, isLoading: authLoading, checkAuthStatus } =
    useAuthContext();
  const forcedLight = pathname.startsWith("/chat");
  useTheme(forcedLight);
  useInactivityTimeout();

  const shouldShowSidebar = isProtectedPath(pathname);
  const isResolvingProtectedSession = shouldShowSidebar && !isInitialized;
  const shouldRedirectToLogin =
    shouldShowSidebar && isInitialized && !isAuthenticated;
  // Backend unreachable: session can't resolve and we're not mid-retry.
  // Show a branded fallback instead of an infinite "Validando sesión…" spinner.
  const isBackendUnavailable =
    isResolvingProtectedSession && !!authError && !authLoading;

  useEffect(() => {
    if (!shouldRedirectToLogin) {
      return;
    }

    const target =
      pathname && pathname !== "/auth/login"
        ? `/auth/login?from=${pathname}`
        : "/auth/login";

    router.replace(target);
  }, [pathname, router, shouldRedirectToLogin]);

  if (isBackendUnavailable) {
    return (
      <BackendUnavailable
        onRetry={() => void checkAuthStatus()}
        isRetrying={authLoading}
      />
    );
  }

  if (isResolvingProtectedSession || shouldRedirectToLogin) {
    return <ProtectedShellLoading />;
  }

  return (
    <div
      className="relative flex h-screen w-full overflow-hidden"
      style={{ background: "hsl(var(--surface))" }}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-0 bg-noise"
      />
      {shouldShowSidebar && <AppSidebar />}

      <div className="flex flex-1 flex-col overflow-hidden">
        <main
          id="main-content"
          className="h-full flex-1 overflow-y-auto overflow-x-hidden text-foreground"
        >
          {shouldShowSidebar && (
            <div className="fixed left-4 top-4 z-40 md:hidden">
              <SidebarTrigger />
            </div>
          )}
          {shouldShowSidebar ? (
            <div className="w-full h-full p-8">{children}</div>
          ) : (
            children
          )}
        </main>
      </div>
    </div>
  );
}

function ProtectedShellLoading() {
  return (
    <div
      className="flex h-screen w-full items-center justify-center"
      style={{ background: "hsl(var(--surface))" }}
    >
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Validando sesion...
      </div>
    </div>
  );
}
