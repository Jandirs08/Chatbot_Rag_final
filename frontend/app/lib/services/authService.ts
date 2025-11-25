import { API_URL } from "@/app/lib/config";

// Interfaces para los tipos de datos de autenticación
export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterData {
  username: string;
  email: string;
  password: string;
  full_name?: string;
}

export interface User {
  id: string;
  username: string;
  email: string;
  full_name?: string;
  is_active: boolean;
  is_admin: boolean;
  created_at: string;
  updated_at: string;
  last_login?: string;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
}

export interface AuthError {
  detail: string;
}

// Clase para manejar el almacenamiento de tokens
class TokenManager {
  private static token: string | null = null;
  private static expiryTime: number | null = null;

  static setToken(token: string, expiresIn: number): void {
    this.token = token;
    this.expiryTime = Date.now() + expiresIn * 1000;
  }

  static getToken(): string | null {
    if (this.token && this.expiryTime && Date.now() < this.expiryTime) {
      return this.token;
    }
    try {
      const all = typeof document !== 'undefined' ? document.cookie : '';
      if (all) {
        const parts = all.split(';').map((p) => p.trim());
        const kv = (name: string) => {
          const found = parts.find((p) => p.startsWith(name + '='));
          return found ? decodeURIComponent(found.split('=')[1]) : '';
        };
        const cookieToken = kv('auth_token') || kv('access_token') || kv('session_id');
        if (cookieToken) {
          this.token = cookieToken;
          this.expiryTime = null;
          return cookieToken;
        }
      }
    } catch {}
    return null;
  }

  static clearToken(): void {
    this.token = null;
    this.expiryTime = null;
  }

  static isTokenValid(): boolean {
    return this.getToken() !== null;
  }
}

// Servicio de autenticación
export const authService = {
  // Login de usuario
  async login(credentials: LoginCredentials): Promise<AuthResponse> {
    try {
      console.log("Intentando login para usuario:", credentials.email);
      
      const response = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: credentials.email,
          password: credentials.password
        }),
        credentials: 'include',
      });

      if (!response.ok) {
        const errorData: AuthError = await response.json().catch(() => ({
          detail: `Error ${response.status}: ${response.statusText}`
        }));
        console.error("Error en login:", errorData);
        throw new Error(errorData.detail || 'Error de autenticación');
      }

      const authData: AuthResponse = await response.json();
      console.log("Login exitoso");
      
      TokenManager.setToken(authData.access_token, authData.expires_in);
      try {
        const maxAge = Math.max(0, Math.floor(authData.expires_in));
        const secure = typeof window !== 'undefined' && window.location.protocol === 'https:' ? '; Secure' : '';
        document.cookie = `auth_token=${authData.access_token}; Path=/; Max-Age=${maxAge}; SameSite=Lax${secure}`;
      } catch (_e) {}
      
      return authData;
    } catch (error) {
      console.error("Error en authService.login:", error);
      throw error;
    }
  },

  async requestPasswordReset(email: string): Promise<void> {
    try {
      const response = await fetch(`${API_URL}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
        credentials: 'include',
      });
      try {
        await response.json().catch(() => ({}));
      } catch (_e) {}
    } catch (error) {
      console.error('Error en authService.requestPasswordReset:', error);
      throw error;
    }
  },

  async resetPassword(token: string, newPassword: string): Promise<void> {
    try {
      const response = await fetch(`${API_URL}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, new_password: newPassword }),
        credentials: 'include',
      });

      if (!response.ok) {
        let detail = `Error ${response.status}: ${response.statusText}`;
        try {
          const err = await response.json();
          detail = err?.detail || detail;
        } catch (_e) {}
        const e = new Error(detail) as Error & { status?: number };
        e.status = response.status;
        throw e;
      }
    } catch (error) {
      console.error('Error en authService.resetPassword:', error);
      throw error;
    }
  },

  // Registro de usuario (si está habilitado)
  async register(userData: RegisterData): Promise<User> {
    try {
      console.log("Intentando registro para usuario:", userData.username);
      
      const response = await fetch(`${API_URL}/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(userData),
      });

      if (!response.ok) {
        const errorData: AuthError = await response.json().catch(() => ({
          detail: `Error ${response.status}: ${response.statusText}`
        }));
        console.error("Error en registro:", errorData);
        throw new Error(errorData.detail || 'Error en el registro');
      }

      const user: User = await response.json();
      console.log("Registro exitoso para usuario:", user.username);
      
      return user;
    } catch (error) {
      console.error("Error en authService.register:", error);
      throw error;
    }
  },

  // Obtener perfil del usuario actual
  async getCurrentUser(): Promise<User> {
    try {
      const token = TokenManager.getToken();
      const baseHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (token) {
        baseHeaders['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch(`${API_URL}/auth/me`, {
        method: 'GET',
        headers: baseHeaders,
        credentials: 'include',
      });

      if (!response.ok) {
        if (response.status === 401) {
          // Token inválido o expirado
          TokenManager.clearToken();
          throw new Error('Sesión expirada');
        }
        
        const errorData: AuthError = await response.json().catch(() => ({
          detail: `Error ${response.status}: ${response.statusText}`
        }));
        throw new Error(errorData.detail || 'Error al obtener perfil');
      }

      const user: User = await response.json();
      return user;
    } catch (error) {
      console.error("Error en authService.getCurrentUser:", error);
      throw error;
    }
  },

  // Logout
  async logout(): Promise<void> {
    try {
      try {
        const token = TokenManager.getToken();
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        await fetch(`${API_URL}/auth/logout`, {
          method: 'POST',
          headers,
          credentials: 'include',
        });
      } catch (error) {
        console.warn("Error al hacer logout en servidor:", error);
      }

      // Limpiar token local
      TokenManager.clearToken();
      try {
        document.cookie = 'auth_token=; Path=/; Max-Age=0; SameSite=Lax';
      } catch (_e) {}
      console.log("Logout completado");
    } catch (error) {
      console.error("Error en authService.logout:", error);
      // Asegurar que se limpie el token local
      TokenManager.clearToken();
    }
  },

  // Verificar si el usuario está autenticado
  isAuthenticated(): boolean {
    return TokenManager.isTokenValid();
  },

  // Obtener token para requests autenticados
  getAuthToken(): string | null {
    return TokenManager.getToken();
  },

  // Refresh token (si está implementado en el backend)
  async refreshToken(): Promise<AuthResponse> {
    try {
      const token = TokenManager.getToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const response = await fetch(`${API_URL}/auth/refresh`, {
        method: 'POST',
        headers,
        credentials: 'include',
      });

      if (!response.ok) {
        TokenManager.clearToken();
        throw new Error('Error al renovar token');
      }

      const authData: AuthResponse = await response.json();
      TokenManager.setToken(authData.access_token, authData.expires_in);
      try {
        const maxAge = Math.max(0, Math.floor(authData.expires_in));
        const secure = typeof window !== 'undefined' && window.location.protocol === 'https:' ? '; Secure' : '';
        document.cookie = `auth_token=${authData.access_token}; Path=/; Max-Age=${maxAge}; SameSite=Lax${secure}`;
      } catch (_e) {}

      return authData;
    } catch (error) {
      console.error("Error en authService.refreshToken:", error);
      throw error;
    }
  },
};

// Función helper para hacer requests autenticados
export const authenticatedFetch = async (url: string, options: RequestInit = {}): Promise<Response> => {
  const token = TokenManager.getToken();
  const headers = new Headers(options.headers as HeadersInit);
  headers.set('Content-Type', 'application/json');

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  return fetch(url, {
    ...options,
    headers,
    credentials: 'include',
  });
};

export { TokenManager };