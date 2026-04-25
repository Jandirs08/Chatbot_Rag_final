import { NextRequest, NextResponse } from 'next/server';
import { clearSessionCookies } from '@/app/lib/auth/sessionRefresh';
import { rejectCrossOrigin } from '@/app/lib/auth/apiAuth';

export async function POST(request: NextRequest) {
  const csrfRejection = rejectCrossOrigin(request);
  if (csrfRejection) return csrfRejection;

  const response = NextResponse.json({ success: true });
  clearSessionCookies(response);
  return response;
}
