import { NextRequest, NextResponse } from 'next/server';
import { applySessionCookies, type SessionTokens } from '@/app/lib/auth/sessionRefresh';
import { rejectCrossOrigin } from '@/app/lib/auth/apiAuth';
import { verifyAccessToken } from '@/app/lib/auth/jwtVerify';

export async function POST(request: NextRequest) {
  const csrfRejection = rejectCrossOrigin(request);
  if (csrfRejection) return csrfRejection;

  try {
    const body = await request.json();
    const { access_token, refresh_token, expires_in, token_type } = body;

    if (!access_token) {
      return NextResponse.json(
        { error: 'Token is required' },
        { status: 400 }
      );
    }

    // Verify signature + type before promoting to HttpOnly cookie.
    const claims = await verifyAccessToken(access_token);
    if (!claims) {
      return NextResponse.json(
        { error: 'Invalid token' },
        { status: 401 }
      );
    }

    const response = NextResponse.json({ success: true });
    applySessionCookies(
      response,
      {
        access_token,
        refresh_token,
        expires_in,
        token_type,
      } satisfies SessionTokens,
      refresh_token,
    );

    return response;
  } catch {
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
