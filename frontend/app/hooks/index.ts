// Authentication hooks
export { useAuth, default as useAuthDefault } from './useAuth';
export { 
  useAuthGuard, 
  useRequireAuth, 
  useRequireAdmin,
  default as useAuthGuardDefault 
} from './useAuthGuard';

// Re-export types from AuthContext
export type { User, AuthState, AuthContextType } from '../contexts/AuthContext';