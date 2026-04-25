import { NextRequest, NextResponse } from 'next/server';
import { applySessionCookies, type SessionTokens } from '@/app/lib/auth/sessionRefresh';
import { rejectCrossOrigin } from '@/app/lib/auth/apiAuth';

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
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
