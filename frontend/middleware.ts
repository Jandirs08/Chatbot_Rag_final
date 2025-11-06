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
  const { pathname } = req.nextUrl;

  // Permitir rutas públicas
  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  // Leer token desde cookie (establecido en login)
  const token = req.cookies.get('auth_token')?.value;

  // Si no hay token y la ruta no es pública, redirigir al login
  if (!token) {
    const loginUrl = new URL('/auth/login', req.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Ejecutar middleware en todas las rutas excepto estáticos
    '/((?!_next|favicon.ico).*)',
  ],
};