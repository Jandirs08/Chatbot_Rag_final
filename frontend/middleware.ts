import { NextRequest, NextResponse } from "next/server";
import { isProtectedPath, normalizePath } from "./app/lib/auth/routeAccess";

export function middleware(req: NextRequest) {
  const pathname = normalizePath(req.nextUrl.pathname);

  let hasSessionCookie = false;
  try {
    hasSessionCookie = Boolean(
      req.cookies.get("auth_token")?.value ||
        req.cookies.get("access_token")?.value ||
        req.cookies.get("refresh_token")?.value ||
        req.cookies.get("session_id")?.value,
    );
  } catch {
    hasSessionCookie = false;
  }

  if (isProtectedPath(pathname) && !hasSessionCookie) {
    try {
      const loginUrl = new URL("/auth/login", req.url);
      return NextResponse.redirect(loginUrl);
    } catch {
      return NextResponse.next();
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
