import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import {
  REFRESH_TOKEN_COOKIE,
  applySessionCookies,
  clearSessionCookies,
  requestSessionRefresh,
  toClientSessionResponse,
} from '@/app/lib/auth/sessionRefresh';

export async function POST() {
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
