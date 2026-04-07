import { NextRequest, NextResponse } from "next/server";
import { isProtectedPath, normalizePath } from "./app/lib/auth/routeAccess";
import {
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  applySessionCookies,
  clearSessionCookies,
  isTokenExpired,
  requestSessionRefresh,
} from "./app/lib/auth/sessionRefresh";

export async function middleware(req: NextRequest) {
  const pathname = normalizePath(req.nextUrl.pathname);
  const accessToken = req.cookies.get(ACCESS_TOKEN_COOKIE)?.value ?? null;
  const refreshToken = req.cookies.get(REFRESH_TOKEN_COOKIE)?.value ?? null;
  const needsSsrSessionNormalization =
    isProtectedPath(pathname) || pathname.startsWith("/auth");
  const hasValidAccessToken =
    typeof accessToken === "string" &&
    accessToken.length > 0 &&
    !isTokenExpired(accessToken);

  if (needsSsrSessionNormalization) {
    if (hasValidAccessToken) {
      return NextResponse.next();
    }

    if (refreshToken) {
      const refreshedSession = await requestSessionRefresh(refreshToken);
      if (refreshedSession) {
        const response = NextResponse.next();
        applySessionCookies(response, refreshedSession, refreshToken);
        return response;
      }

      const response = isProtectedPath(pathname)
        ? NextResponse.redirect(new URL("/auth/login", req.url))
        : NextResponse.next();
      clearSessionCookies(response);
      return response;
    }
  }

  if (isProtectedPath(pathname)) {
    const response = NextResponse.redirect(new URL("/auth/login", req.url));
    if (accessToken && !hasValidAccessToken) {
      clearSessionCookies(response);
    }
    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
