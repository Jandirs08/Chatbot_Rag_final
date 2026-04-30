'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from './useAuth';
import {
  hasPermission,
  type Permission,
} from '@/app/lib/auth/permissions';

function buildLoginPath(pathname: string | null): string {
  const params = new URLSearchParams();
  if (pathname && pathname !== '/auth/login') {
    params.set('from', pathname);
  }

  const query = params.toString();
  return query ? `/auth/login?${query}` : '/auth/login';
}

export function useRequirePermission(permission?: Permission) {
  const { user, isAuthenticated, isAdmin, isLoading, isInitialized } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const hasRequiredPermission = permission
    ? hasPermission(user, permission)
    : isAdmin;
  const isChecking = !isInitialized || isLoading;
  const isAuthorized =
    isInitialized && isAuthenticated && hasRequiredPermission;

  useEffect(() => {
    if (isChecking) return;

    if (!isAuthenticated) {
      router.replace(buildLoginPath(pathname));
      return;
    }

    if (!hasRequiredPermission) {
      router.replace('/');
    }
  }, [
    hasRequiredPermission,
    isAuthenticated,
    isChecking,
    pathname,
    router,
  ]);

  return { isAuthorized, isChecking };
}

export function useRequireAdmin() {
  return useRequirePermission();
}
