export function normalizePath(pathname: string): string {
  if (!pathname) {
    return "/";
  }

  const normalizedPath = pathname.replace(/\/+$/, "").toLowerCase();
  return normalizedPath || "/";
}

export function isPublicPath(pathname: string): boolean {
  const path = normalizePath(pathname);

  if (
    path === "/chat" ||
    path === "/widget-loader.js" ||
    path === "/favicon.ico" ||
    path === "/404" ||
    path === "/500" ||
    path === "/not-found"
  ) {
    return true;
  }

  if (path.startsWith("/auth")) {
    return true;
  }

  if (path.startsWith("/_next") || path.startsWith("/public")) {
    return true;
  }

  return false;
}

export function isProtectedPath(pathname: string): boolean {
  return !isPublicPath(pathname);
}

export function shouldRedirectAuthenticatedUser(pathname: string): boolean {
  return normalizePath(pathname) === "/auth/login";
}
