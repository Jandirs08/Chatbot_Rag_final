import { API_URL } from "@/app/lib/config";

// Interfaces para los tipos de datos de autenticación
export interface LoginCredentials {
  username: string;
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
}

export interface AuthError {
  detail: string;
}

// Clase para manejar el almacenamiento de tokens
class TokenManager {
  private static readonly TOKEN_KEY = 'auth_token';
  private static readonly TOKEN_EXPIRY_KEY = 'auth_token_expiry';

  static setToken(token: string, expiresIn: number): void {
    if (typeof window !== 'undefined') {
      localStorage.setItem(this.TOKEN_KEY, token);
      const expiryTime = Date.now() + (expiresIn * 1000);
      localStorage.setItem(this.TOKEN_EXPIRY_KEY, expiryTime.toString());
    }
  }

  static getToken(): string | null {
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem(this.TOKEN_KEY);
      const expiry = localStorage.getItem(this.TOKEN_EXPIRY_KEY);
      
      if (token && expiry) {
        const expiryTime = parseInt(expiry);
        if (Date.now() < expiryTime) {
          return token;
        } else {
          // Token expirado, limpiar
          this.clearToken();
        }
      }
    }
    return null;
  }

  static clearToken(): void {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(this.TOKEN_KEY);
      localStorage.removeItem(this.TOKEN_EXPIRY_KEY);
    }
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
      console.log("Intentando login para usuario:", credentials.username);
      
      const response = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(credentials),
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
      
      // Guardar token
      TokenManager.setToken(authData.access_token, authData.expires_in);
      
      return authData;
    } catch (error) {
      console.error("Error en authService.login:", error);
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
      if (!token) {
        throw new Error('No hay token de autenticación');
      }

      const response = await fetch(`${API_URL}/auth/me`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
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
      const token = TokenManager.getToken();
      
      if (token) {
        // Intentar logout en el servidor
        try {
          await fetch(`${API_URL}/auth/logout`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
          });
        } catch (error) {
          console.warn("Error al hacer logout en servidor:", error);
          // Continuar con logout local aunque falle el servidor
        }
      }

      // Limpiar token local
      TokenManager.clearToken();
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
      if (!token) {
        throw new Error('No hay token para renovar');
      }

      const response = await fetch(`${API_URL}/auth/refresh`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        TokenManager.clearToken();
        throw new Error('Error al renovar token');
      }

      const authData: AuthResponse = await response.json();
      TokenManager.setToken(authData.access_token, authData.expires_in);
      
      return authData;
    } catch (error) {
      console.error("Error en authService.refreshToken:", error);
      throw error;
    }
  },
};

// Función helper para hacer requests autenticados
export const authenticatedFetch = async (url: string, options: RequestInit = {}): Promise<Response> => {
  const token = authService.getAuthToken();
  
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  return fetch(url, {
    ...options,
    headers,
  });
};

export { TokenManager };