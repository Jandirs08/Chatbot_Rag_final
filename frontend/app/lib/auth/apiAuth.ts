import { NextRequest, NextResponse } from "next/server";
import { ACCESS_TOKEN_COOKIE } from "@/app/lib/auth/sessionRefresh";
import {
  verifyAccessToken,
  type AccessTokenClaims,
} from "@/app/lib/auth/jwtVerify";
import { isSameSiteRequest } from "@/app/lib/auth/csrf";

export interface AuthorizedRequest {
  claims: AccessTokenClaims;
}

export async function requireAuth(
  req: NextRequest,
): Promise<{ ok: true; claims: AccessTokenClaims } | { ok: false; response: NextResponse }> {
  if (!isSameSiteRequest(req)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Cross-origin request not allowed" },
        { status: 403 },
      ),
    };
  }

  const token = req.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
  if (!token) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Authentication required" },
        { status: 401 },
      ),
    };
  }

  const claims = await verifyAccessToken(token);
  if (!claims) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Invalid or expired token" },
        { status: 401 },
      ),
    };
  }

  return { ok: true, claims };
}

export function rejectCrossOrigin(req: NextRequest): NextResponse | null {
  if (isSameSiteRequest(req)) return null;
  return NextResponse.json(
    { error: "Cross-origin request not allowed" },
    { status: 403 },
  );
}
