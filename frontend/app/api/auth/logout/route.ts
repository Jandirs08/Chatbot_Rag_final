import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function POST() {
  const cookieStore = cookies();
  
  // Delete cookies by setting them with maxAge 0 or using delete()
  cookieStore.delete('access_token');
  cookieStore.delete('refresh_token');
  
  // Also clean up any other legacy cookies if necessary
  cookieStore.delete('auth_token');
  cookieStore.delete('session_id');

  return NextResponse.json({ success: true });
}
