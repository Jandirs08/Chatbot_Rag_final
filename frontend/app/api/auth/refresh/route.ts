import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { API_URL } from '@/app/lib/config';

export async function POST() {
  const cookieStore = cookies();
  const refreshToken = cookieStore.get('refresh_token')?.value;

  if (!refreshToken) {
    return NextResponse.json(
      { error: 'No refresh token' },
      { status: 401 }
    );
  }

  try {
    // Call backend to refresh token
    const response = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    if (!response.ok) {
        // If refresh fails, clear cookies
        cookieStore.delete('access_token');
        cookieStore.delete('refresh_token');
        return NextResponse.json(
            { error: 'Refresh failed' },
            { status: 401 }
        );
    }

    const data = await response.json();
    const { access_token, refresh_token: new_refresh_token, expires_in } = data;

    // Update cookies
    const maxAge = expires_in || 3600;
    
    cookieStore.set('access_token', access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: maxAge,
    });

    if (new_refresh_token) {
        cookieStore.set('refresh_token', new_refresh_token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            path: '/',
            maxAge: 7 * 24 * 60 * 60, // 7 days
        });
    }

    // Return tokens so frontend can update memory if needed (though we try to avoid it)
    return NextResponse.json(data);

  } catch (error) {
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
