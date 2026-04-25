import { NextRequest } from "next/server";

function parseAllowedOrigins(): string[] {
  const raw = process.env.ALLOWED_ORIGINS || "";
  return raw
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function originFromUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

export function isSameSiteRequest(req: NextRequest): boolean {
  const requestOrigin = req.nextUrl.origin;
  const allowed = new Set<string>([requestOrigin, ...parseAllowedOrigins()]);

  const headerOrigin = req.headers.get("origin");
  if (headerOrigin) {
    return allowed.has(headerOrigin);
  }

  const referer = originFromUrl(req.headers.get("referer"));
  if (referer) {
    return allowed.has(referer);
  }

  return false;
}
