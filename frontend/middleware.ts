import { NextRequest, NextResponse } from "next/server";
import { isProtectedPath, normalizePath } from "./app/lib/auth/routeAccess";
import { SSR_ACCESS_TOKEN_HEADER } from "./app/lib/auth/session";
import {
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  applySessionCookies,
  clearSessionCookies,
  requestSessionRefresh,
} from "./app/lib/auth/sessionRefresh";
import { verifyAccessToken } from "./app/lib/auth/jwtVerify";

function buildLoginUrl(req: NextRequest, from: string): URL {
  const url = new URL("/auth/login", req.url);
  if (from && from !== "/auth/login") {
    url.searchParams.set("from", from);
  }
  return url;
}

function isLegacyLoginPath(pathname: string): boolean {
  return pathname === "/login" || pathname === "/admin/login";
}

function redirectLegacyLogin(req: NextRequest, hasSession: boolean): NextResponse {
  if (hasSession) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  const url = new URL("/auth/login", req.url);
  const from = req.nextUrl.searchParams.get("from");
  if (from) {
    url.searchParams.set("from", from);
  }
  return NextResponse.redirect(url);
}

export async function middleware(req: NextRequest) {
  const pathname = normalizePath(req.nextUrl.pathname);
  const accessToken = req.cookies.get(ACCESS_TOKEN_COOKIE)?.value ?? null;
  const refreshToken = req.cookies.get(REFRESH_TOKEN_COOKIE)?.value ?? null;
  const needsSsrSessionNormalization =
    isProtectedPath(pathname) || pathname.startsWith("/auth");

  const verifiedClaims =
    typeof accessToken === "string" && accessToken.length > 0
      ? await verifyAccessToken(accessToken)
      : null;
  const hasValidAccessToken = verifiedClaims !== null;

  if (isLegacyLoginPath(pathname) && hasValidAccessToken) {
    return redirectLegacyLogin(req, true);
  }

  if (needsSsrSessionNormalization) {
    if (hasValidAccessToken) {
      if (pathname.startsWith("/auth")) {
        return NextResponse.redirect(new URL("/", req.url));
      }
      return NextResponse.next();
    }

    if (refreshToken) {
      const refreshedSession = await requestSessionRefresh(refreshToken);
      if (refreshedSession) {
        const requestHeaders = new Headers(req.headers);
        requestHeaders.set(
          SSR_ACCESS_TOKEN_HEADER,
          refreshedSession.access_token,
        );

        if (pathname.startsWith("/auth") || isLegacyLoginPath(pathname)) {
          const response = NextResponse.redirect(new URL("/", req.url));
          applySessionCookies(response, refreshedSession, refreshToken);
          return response;
        }

        const response = NextResponse.next({
          request: {
            headers: requestHeaders,
          },
        });
        applySessionCookies(response, refreshedSession, refreshToken);
        return response;
      }

      const response = isProtectedPath(pathname)
        ? NextResponse.redirect(buildLoginUrl(req, pathname))
        : NextResponse.next();
      clearSessionCookies(response);
      return response;
    }
  }

  if (isLegacyLoginPath(pathname)) {
    return redirectLegacyLogin(req, false);
  }

  if (isProtectedPath(pathname)) {
    const response = NextResponse.redirect(buildLoginUrl(req, pathname));
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
