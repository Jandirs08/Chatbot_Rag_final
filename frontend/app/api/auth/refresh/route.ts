import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import {
  REFRESH_TOKEN_COOKIE,
  applySessionCookies,
  clearSessionCookies,
  requestSessionRefresh,
  toClientSessionResponse,
} from '@/app/lib/auth/sessionRefresh';
import { rejectCrossOrigin } from '@/app/lib/auth/apiAuth';

export async function POST(request: NextRequest) {
  const csrfRejection = rejectCrossOrigin(request);
  if (csrfRejection) return csrfRejection;

  const cookieStore = cookies();
  const refreshToken = cookieStore.get(REFRESH_TOKEN_COOKIE)?.value;

  if (!refreshToken) {
    const response = NextResponse.json(
      { error: 'No refresh token' },
      { status: 401 },
    );
    clearSessionCookies(response);
    return response;
  }

  const refreshedSession = await requestSessionRefresh(refreshToken);
  if (!refreshedSession) {
    const response = NextResponse.json(
      { error: 'Refresh failed' },
      { status: 401 },
    );
    clearSessionCookies(response);
    return response;
  }

  const successResponse = NextResponse.json(
    toClientSessionResponse(refreshedSession),
  );
  applySessionCookies(successResponse, refreshedSession, refreshToken);
  return successResponse;
}
