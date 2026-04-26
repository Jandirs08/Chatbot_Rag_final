import { NextRequest, NextResponse } from 'next/server';
import { clearSessionCookies, REFRESH_TOKEN_COOKIE } from '@/app/lib/auth/sessionRefresh';
import { rejectCrossOrigin } from '@/app/lib/auth/apiAuth';
import { API_URL } from '@/app/lib/config';

export async function POST(request: NextRequest) {
  const csrfRejection = rejectCrossOrigin(request);
  if (csrfRejection) return csrfRejection;

  const refreshToken = request.cookies.get(REFRESH_TOKEN_COOKIE)?.value ?? null;

  // Best-effort: revoke refresh token on backend so it can't be reused
  if (refreshToken) {
    try {
      const accessToken = request.cookies.get('access_token')?.value ?? null;
      await fetch(`${API_URL}/auth/logout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });
    } catch {
      // Network failure on logout — cookies cleared regardless
    }
  }

  const response = NextResponse.json({ success: true });
  clearSessionCookies(response);
  return response;
}
