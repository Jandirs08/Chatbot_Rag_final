'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
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
   * @default '/auth/login'
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
    adminRedirectTo = '/auth/login',
    autoRedirect = true,
  } = options;

  const { isAuthenticated, isLoading, isAdmin, user } = useAuth();
  const router = useRouter();

  // Estados derivados
  const isAuthorized = isAuthenticated && (!requireAdmin || isAdmin);
  const shouldRedirect = !isLoading && !isAuthorized;

  useEffect(() => {
    if (!autoRedirect || isLoading) return;

    if (!isAuthenticated) {
      // No autenticado - redirigir al login inmediatamente
      router.replace(redirectTo);
      return;
    }

    if (requireAdmin && !isAdmin) {
      // Autenticado pero no es admin - redirigir
      router.replace(adminRedirectTo);
      return;
    }
  }, [
    isAuthenticated,
    isAdmin,
    isLoading,
    requireAdmin,
    redirectTo,
    adminRedirectTo,
    autoRedirect,
    router,
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
