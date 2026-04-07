import { NextResponse } from 'next/server';
import { clearSessionCookies } from '@/app/lib/auth/sessionRefresh';

export async function POST() {
  const response = NextResponse.json({ success: true });
  clearSessionCookies(response);
  return response;
}
