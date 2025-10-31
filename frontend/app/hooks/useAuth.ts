'use client';

import { useAuthContext } from '../contexts/AuthContext';

/**
 * Hook personalizado para acceder al contexto de autenticación
 * Proporciona una interfaz simplificada para las operaciones de auth
 */
export function useAuth() {
  const context = useAuthContext();

  return {
    // Estado
    user: context.user,
    token: context.token,
    isAuthenticated: context.isAuthenticated,
    isLoading: context.isLoading,
    error: context.error,
    
    // Computed properties
    isAdmin: context.user?.is_admin || false,
    isActive: context.user?.is_active || false,
    
    // Acciones
    login: context.login,
    logout: context.logout,
    refreshAuth: context.refreshAuth,
    clearError: context.clearError,
    checkAuthStatus: context.checkAuthStatus,
  };
}

export default useAuth;