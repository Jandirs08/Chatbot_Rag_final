'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from './useAuth';

export function useRequireAdmin() {
  const { isAuthenticated, isAdmin, isLoading, isInitialized } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isInitialized || isLoading) return;
    if (!isAuthenticated || !isAdmin) {
      router.replace('/auth/login');
    }
  }, [isAuthenticated, isAdmin, isLoading, isInitialized, router]);

  return { isAuthorized: isAuthenticated && isAdmin };
}
