import { NextRequest, NextResponse } from 'next/server';

// Rutas públicas: permitir acceso sin autenticación
const PUBLIC_PATHS = [
  '/chat',
  '/favicon.ico',
  '/404',
  '/500',
  '/not-found',
];

function isPublicPath(pathname: string): boolean {
  // Exact matches
  if (PUBLIC_PATHS.includes(pathname)) return true;
  // Permitir todas las rutas de autenticación
  if (pathname.startsWith('/auth')) return true;
  // Permitir archivos y recursos estáticos
  if (pathname.startsWith('/_next')) return true;
  if (pathname.startsWith('/public')) return true;
  return false;
}

export function middleware(req: NextRequest) {
  // Middleware ultra-defensivo para evitar 500 en Edge
  const { pathname } = req.nextUrl;

  // Permitir rutas públicas y estáticos inmediatamente
  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  // Intentar leer cookie de forma segura; si hay cualquier problema, continuar
  let token: string | undefined;
  try {
    token =
      req.cookies.get('auth_token')?.value ||
      req.cookies.get('access_token')?.value ||
      req.cookies.get('session_id')?.value;
  } catch {
    // No romper en Edge si cookies falla
    token = undefined;
  }

  // Si no hay token y la ruta no es pública, redirigir al login
  if (!token) {
    try {
      const loginUrl = new URL('/auth/login', req.url);
      return NextResponse.redirect(loginUrl);
    } catch {
      // Fallback absoluto: permitir la navegación para evitar 500
      return NextResponse.next();
    }
  }

  // Token presente, continuar
  return NextResponse.next();
}

export const config = {
  matcher: [
    // Ejecutar middleware en todas las rutas excepto API y estáticos
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};