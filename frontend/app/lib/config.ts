const rawApiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

function normalizeApiUrl(value: string): string {
  let clean = value.trim().replace(/\/+$/, "");
  clean = clean.replace(/(\/api\/v1)+(?=\/|$)/, "/api/v1");

  try {
    const parsed = new URL(clean);
    if (!parsed.pathname.endsWith("/api/v1")) {
      parsed.pathname = `${parsed.pathname.replace(/\/+$/, "")}/api/v1`;
    }
    return parsed.toString().replace(/\/+$/, "");
  } catch {
    return clean.endsWith("/api/v1") ? clean : `${clean}/api/v1`;
  }
}

export const API_URL = normalizeApiUrl(rawApiUrl);
