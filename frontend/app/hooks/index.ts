// Authentication hooks
export { useAuth, default as useAuthDefault } from './useAuth';
export { 
  useAuthGuard, 
  useRequireAuth, 
  useRequireAdmin,
  default as useAuthGuardDefault 
} from './useAuthGuard';

// Re-export types
export type { AuthState, AuthContextType } from '../contexts/AuthContext';
export type { User } from '../lib/services/authService';