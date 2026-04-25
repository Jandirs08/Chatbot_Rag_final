import { jwtVerify, type JWTPayload } from "jose";

export interface AccessTokenClaims extends JWTPayload {
  sub?: string;
  type?: string;
}

let cachedSecret: Uint8Array | null = null;

function getSecret(): Uint8Array {
  if (cachedSecret) return cachedSecret;

  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET env var is required for token verification");
  }
  cachedSecret = new TextEncoder().encode(secret);
  return cachedSecret;
}

const ALGORITHM = process.env.JWT_ALGORITHM || "HS256";

export async function verifyAccessToken(
  token: string,
): Promise<AccessTokenClaims | null> {
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, getSecret(), {
      algorithms: [ALGORITHM],
    });

    if (payload.type !== "access") return null;
    if (!payload.sub) return null;

    return payload as AccessTokenClaims;
  } catch {
    return null;
  }
}
