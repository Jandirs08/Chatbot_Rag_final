'use client';

import { useEffect, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from './useAuth';

interface UseAuthGuardOptions {
  /**
   * Ruta a la que redirigir si no está autenticado
   * @default '/auth/login'
   */
  redirectTo?: string;
  
  /**
   * Si requiere permisos de administrador
   * @default false
   */
  requireAdmin?: boolean;
  
  /**
   * Ruta a la que redirigir si no es admin
   * @default '/'
   */
  adminRedirectTo?: string;
  
  /**
   * Si debe redirigir inmediatamente o solo retornar el estado
   * @default true
   */
  autoRedirect?: boolean;
}

/**
 * Hook para protección de rutas con redirección automática
 * 
 * @param options Opciones de configuración del guard
 * @returns Estado de autorización y funciones de utilidad
 */
export function useAuthGuard(options: UseAuthGuardOptions = {}) {
  const {
    redirectTo = '/auth/login',
    requireAdmin = false,
    adminRedirectTo = '/',
    autoRedirect = true,
  } = options;

  const { isAuthenticated, isLoading, isAdmin, user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const hasRedirectedRef = useRef(false);

  // Estados derivados
  const isAuthorized = isAuthenticated && (!requireAdmin || isAdmin);
  const shouldRedirect = autoRedirect && !isLoading && !isAuthorized;

  useEffect(() => {
    if (!shouldRedirect) {
      hasRedirectedRef.current = false;
      return;
    }

    const target = !isAuthenticated
      ? redirectTo
      : requireAdmin && !isAdmin
        ? adminRedirectTo
        : null;

    if (!target || pathname === target || hasRedirectedRef.current) {
      return;
    }

    hasRedirectedRef.current = true;

    if (!isAuthenticated) {
      window.location.replace(target);
      return;
    }

    if (requireAdmin && !isAdmin) {
      window.location.replace(target);
    }
  }, [
    adminRedirectTo,
    isAdmin,
    isAuthenticated,
    pathname,
    redirectTo,
    requireAdmin,
    shouldRedirect,
  ]);

  return {
    // Estados
    isAuthenticated,
    isAdmin,
    isAuthorized,
    isLoading,
    shouldRedirect,
    user,
    
    // Funciones de utilidad
    canAccess: (adminRequired = false) => {
      return isAuthenticated && (!adminRequired || isAdmin);
    },
    
    redirectToLogin: () => {
      router.replace(redirectTo);
    },
    
    redirectToAdminLogin: () => {
      router.replace(adminRedirectTo);
    },
  };
}

/**
 * Hook simplificado para páginas que requieren autenticación básica
 */
export function useRequireAuth() {
  return useAuthGuard({ requireAdmin: false });
}

/**
 * Hook simplificado para páginas que requieren permisos de administrador
 */
export function useRequireAdmin() {
  return useAuthGuard({ requireAdmin: true });
}

export default useAuthGuard;
