import { API_URL } from "@/app/lib/config";

// Interfaces
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

// --- Token Manager Mejorado (Maneja Access y Refresh) ---
class TokenManager {
  private static accessToken: string | null = null;
  private static refreshToken: string | null = null; // Nuevo campo
  private static expiryTime: number | null = null;

  static setTokens(accessToken: string, refreshToken: string, expiresIn: number): void {
    this.accessToken = accessToken;
    this.refreshToken = refreshToken;
    this.expiryTime = Date.now() + expiresIn * 1000;
    
    // Persistencia básica en cookies (solo access_token para middleware simple)
    try {
      if (typeof document !== 'undefined') {
        const maxAge = Math.max(0, Math.floor(expiresIn));
        const secure = window.location.protocol === 'https:' ? '; Secure' : '';
        document.cookie = `auth_token=${accessToken}; Path=/; Max-Age=${maxAge}; SameSite=Lax${secure}`;
        // Guardar refresh token en localStorage para sobrevivir recargas (menos seguro que HttpOnly, pero funcional para MVP)
        localStorage.setItem('refresh_token', refreshToken);
      }
    } catch {}
  }

  static getAccessToken(): string | null {
    // 1. Memoria
    if (this.accessToken) return this.accessToken;
    
    // 2. Cookie (Recuperación tras F5)
    try {
      if (typeof document !== 'undefined') {
        const match = document.cookie.match(new RegExp('(^| )auth_token=([^;]+)'));
        if (match) {
            this.accessToken = match[2];
            return this.accessToken;
        }
      }
    } catch {}
    return null;
  }

  static getRefreshToken(): string | null {
    if (this.refreshToken) return this.refreshToken;
    try {
      if (typeof window !== 'undefined') {
        const stored = localStorage.getItem('refresh_token');
        if (stored) {
            this.refreshToken = stored;
            return stored;
        }
      }
    } catch {}
    return null;
  }

  // Alias para compatibilidad
  static getToken() { return this.getAccessToken(); }

  static clearTokens(): void {
    this.accessToken = null;
    this.refreshToken = null;
    this.expiryTime = null;
    try {
      if (typeof document !== 'undefined') {
        document.cookie = 'auth_token=; Path=/; Max-Age=0; SameSite=Lax';
        localStorage.removeItem('refresh_token');
      }
    } catch {}
  }

  static isTokenValid(): boolean {
    // Si tenemos access token, asumimos válido (el backend dirá 401 si no)
    return !!this.getAccessToken();
  }
}

// --- Servicio de Autenticación ---
export const authService = {
  async login(credentials: LoginCredentials): Promise<AuthResponse> {
    try {
      const response = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credentials),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: 'Error de autenticación' }));
        throw new Error(errorData.detail || 'Error al iniciar sesión');
      }

      const authData: AuthResponse = await response.json();
      
      // CRÍTICO: Guardamos AMBOS tokens
      TokenManager.setTokens(authData.access_token, authData.refresh_token, authData.expires_in);
      
      return authData;
    } catch (error) {
      console.error("Login error:", error);
      throw error;
    }
  },

  async logout(): Promise<void> {
    try {
        // Intento best-effort de avisar al backend
        const token = TokenManager.getAccessToken();
        if (token) {
            await fetch(`${API_URL}/auth/logout`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
            });
        }
    } catch (e) {
        // Ignorar error de red al salir
    } finally {
        TokenManager.clearTokens();
    }
  },

  async getCurrentUser(): Promise<User> {
    // Usamos authenticatedFetch para aprovechar la lógica de retry automática
    const response = await authenticatedFetch(`${API_URL}/auth/me`, {
        method: 'GET'
    });

    if (!response.ok) {
        throw new Error("No se pudo obtener el usuario");
    }
    return response.json();
  },

  // CORREGIDO: Envía el refresh_token en el body
  async refreshToken(): Promise<AuthResponse> {
    const refreshToken = TokenManager.getRefreshToken();
    
    if (!refreshToken) {
        TokenManager.clearTokens();
        throw new Error("No hay refresh token disponible");
    }

    try {
      const response = await fetch(`${API_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }), // <--- FIX IMPORTANTE
      });

      if (!response.ok) {
        throw new Error('Token inválido');
      }

      const authData: AuthResponse = await response.json();
      // Actualizamos tokens
      TokenManager.setTokens(authData.access_token, authData.refresh_token, authData.expires_in);
      return authData;
    } catch (error) {
      TokenManager.clearTokens();
      throw error;
    }
  },
  
  isAuthenticated: () => TokenManager.isTokenValid(),
  getAuthToken: () => TokenManager.getAccessToken()
};

// --- Helper Fetch Autenticado (Interceptor) ---
export const authenticatedFetch = async (url: string, options: RequestInit = {}): Promise<Response> => {
  let token = TokenManager.getAccessToken();
  
  const getHeaders = (t: string | null) => {
      const h = new Headers(options.headers);
      h.set('Content-Type', 'application/json');
      if (t) h.set('Authorization', `Bearer ${t}`);
      return h;
  };

  // 1. Intento inicial
  let response = await fetch(url, {
      ...options,
      headers: getHeaders(token)
  });

  // 2. Si falla por token vencido (401), intentamos refrescar UNA vez
  if (response.status === 401) {
      try {
          await authService.refreshToken();
          token = TokenManager.getAccessToken(); // Token nuevo
          
          // Reintentar petición original
          response = await fetch(url, {
              ...options,
              headers: getHeaders(token)
          });
      } catch (refreshError) {
          // Si falla el refresh, estamos deslogueados oficialmente
          TokenManager.clearTokens();
          // Opcional: Redirigir a login aquí o dejar que el componente maneje el error
      }
  }

  return response;
};

export { TokenManager };
