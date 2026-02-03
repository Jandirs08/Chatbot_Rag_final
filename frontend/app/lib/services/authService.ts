import { API_URL } from "@/app/lib/config";
import { fetchWithRetrySafe } from "@/app/lib/fetchUtils";

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

  static setTokens(
    accessToken: string,
    refreshToken: string,
    expiresIn: number,
  ): void {
    this.accessToken = accessToken;
    this.refreshToken = refreshToken;
    this.expiryTime = Date.now() + expiresIn * 1000;
  }

  static getAccessToken(): string | null {
    // 1. Memoria
    return this.accessToken;
  }

  static getRefreshToken(): string | null {
    return this.refreshToken;
  }

  // Alias para compatibilidad
  static getToken() {
    return this.getAccessToken();
  }

  static clearTokens(): void {
    this.accessToken = null;
    this.refreshToken = null;
    this.expiryTime = null;
  }

  static isTokenValid(): boolean {
    // Si tenemos access token, asumimos válido (el backend dirá 401 si no)
    return !!this.getAccessToken();
  }
}

// --- Servicio de Autenticación ---
export const authService = {
  async register(userData: RegisterData): Promise<User> {
    try {
      const response = await fetch(`${API_URL}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(userData),
      });

      if (!response.ok) {
        const errorData = await response
          .json()
          .catch(() => ({ detail: "Error en el registro" }));
        throw new Error(errorData.detail || "Error al registrar usuario");
      }

      return await response.json();
    } catch (error) {
      console.error("Register error:", error);
      throw error;
    }
  },

  async login(credentials: LoginCredentials): Promise<AuthResponse> {
    try {
      const response = await fetch(`${API_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(credentials),
      });

      if (!response.ok) {
        const errorData = await response
          .json()
          .catch(() => ({ detail: "Error de autenticación" }));
        throw new Error(errorData.detail || "Error al iniciar sesión");
      }

      const authData: AuthResponse = await response.json();

      // Guardar tokens en cookie segura (Server Route Handler)
      await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          access_token: authData.access_token,
          refresh_token: authData.refresh_token,
          expires_in: authData.expires_in
        })
      });

      // CRÍTICO: Guardamos AMBOS tokens en memoria para uso inmediato
      TokenManager.setTokens(
        authData.access_token,
        authData.refresh_token,
        authData.expires_in,
      );

      return authData;
    } catch (error) {
      console.error("Login error:", error);
      throw error;
    }
  },

  async logout(): Promise<void> {
    try {
      // Limpiar cookies del servidor
      await fetch('/api/auth/logout', { method: 'POST' });

      // Intento best-effort de avisar al backend
      const token = TokenManager.getAccessToken();
      if (token) {
        await fetch(`${API_URL}/auth/logout`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
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
      method: "GET",
    });

    if (!response.ok) {
      throw new Error("No se pudo obtener el usuario");
    }
    return response.json();
  },

  // CORREGIDO: Llama a la ruta interna de Next.js que maneja la cookie
  async refreshToken(): Promise<AuthResponse> {
    try {
      const response = await fetch('/api/auth/refresh', {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Token inválido");
      }

      const authData: AuthResponse = await response.json();
      // Actualizamos tokens en memoria
      TokenManager.setTokens(
        authData.access_token,
        authData.refresh_token,
        authData.expires_in,
      );
      return authData;
    } catch (error) {
      TokenManager.clearTokens();
      throw error;
    }
  },

  async requestPasswordReset(email: string): Promise<void> {
    try {
      const response = await fetch(`${API_URL}/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!response.ok) {
        const e = await response.json().catch(() => ({}) as any);
        const err: any = new Error(e?.detail || `Error ${response.status}`);
        err.status = response.status;
        throw err;
      }
    } catch (error) {
      throw error;
    }
  },

  async resetPassword(token: string, newPassword: string): Promise<void> {
    try {
      const response = await fetch(`${API_URL}/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, new_password: newPassword }),
      });
      if (!response.ok) {
        const e = await response.json().catch(() => ({}) as any);
        const err: any = new Error(e?.detail || `Error ${response.status}`);
        err.status = response.status;
        throw err;
      }
    } catch (error) {
      throw error;
    }
  },

  isAuthenticated: () => TokenManager.isTokenValid(),
  getAuthToken: () => TokenManager.getAccessToken(),
};

// --- Helper Fetch Autenticado (Interceptor) ---
// Usa fetchWithRetrySafe para reintentar errores de red en métodos GET
export const authenticatedFetch = async (
  url: string,
  options: RequestInit = {},
): Promise<Response> => {
  let token = TokenManager.getAccessToken();

  const getHeaders = (t: string | null) => {
    const h = new Headers(options.headers);
    h.set("Content-Type", "application/json");
    if (t) h.set("Authorization", `Bearer ${t}`);
    return h;
  };

  // 1. Intento inicial (con retry para errores de red en GET)
  let response = await fetchWithRetrySafe(url, {
    ...options,
    credentials: 'include', // Importante para enviar cookies
    headers: getHeaders(token),
  });

  // 2. Si falla por token vencido (401), intentamos refrescar UNA vez
  if (response.status === 401) {
    try {
      await authService.refreshToken();
      token = TokenManager.getAccessToken(); // Token nuevo

      // Reintentar petición original
      response = await fetchWithRetrySafe(url, {
        ...options,
        credentials: 'include',
        headers: getHeaders(token),
      });
    } catch (refreshError) {
      // Si falla el refresh, estamos deslogueados oficialmente
      TokenManager.clearTokens();
      // Opcional: Redirigir a login aquí o dejar que el componente maneje el error
    }
  }

  return response;
};

/**
 * Helper para uploads autenticados (FormData).
 * No fuerza Content-Type para permitir que el navegador establezca multipart/form-data.
 */
export const authenticatedUpload = async (
  url: string,
  options: RequestInit = {},
): Promise<Response> => {
  let token = TokenManager.getAccessToken();

  const getHeaders = (t: string | null) => {
    const h = new Headers(options.headers);
    // No establecer Content-Type para FormData - el navegador lo maneja
    if (t) h.set("Authorization", `Bearer ${t}`);
    return h;
  };

  let response = await fetch(url, {
    ...options,
    credentials: 'include',
    headers: getHeaders(token),
  });

  if (response.status === 401) {
    try {
      await authService.refreshToken();
      token = TokenManager.getAccessToken();
      response = await fetch(url, {
        ...options,
        credentials: 'include',
        headers: getHeaders(token),
      });
    } catch {
      TokenManager.clearTokens();
    }
  }

  return response;
};

export { TokenManager };
