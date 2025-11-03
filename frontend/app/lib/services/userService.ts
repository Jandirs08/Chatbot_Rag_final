import { API_URL } from "@/app/lib/config";
import { authenticatedFetch } from "@/app/lib/services/authService";

export interface CreateUserData {
  email: string;
  password: string;
  full_name?: string;
  is_admin?: boolean;
  // username opcional; si no se envía, el backend lo genera desde el email
  username?: string;
}

export interface UserListItem {
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

export interface ListUsersParams {
  skip?: number;
  limit?: number;
  search?: string;
  role?: 'admin' | 'user';
  is_active?: boolean;
}

export interface PaginatedUsersResponse {
  items: UserListItem[];
  total: number;
  skip: number;
  limit: number;
}

export const userService = {
  async listUsers(params: ListUsersParams = {}): Promise<PaginatedUsersResponse> {
    const qs = new URLSearchParams();
    if (params.skip != null) qs.set('skip', String(params.skip));
    if (params.limit != null) qs.set('limit', String(params.limit));
    if (params.search) qs.set('search', params.search);
    if (params.role) qs.set('role', params.role);
    if (params.is_active != null) qs.set('is_active', String(params.is_active));

    const url = `${API_URL}/users${qs.toString() ? `?${qs.toString()}` : ''}`;
    const res = await authenticatedFetch(url, { method: 'GET' });
    if (!res.ok) throw new Error(`Error al listar usuarios: ${res.status}`);
    return res.json();
  },

  async createUser(data: CreateUserData): Promise<UserListItem> {
    const res = await authenticatedFetch(`${API_URL}/users`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      throw new Error(e.detail || `Error al crear usuario: ${res.status}`);
    }
    return res.json();
  },

  async updateUser(id: string, data: Partial<CreateUserData & { is_active?: boolean } & { is_admin?: boolean } & { password?: string }>): Promise<UserListItem> {
    const res = await authenticatedFetch(`${API_URL}/users/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      throw new Error(e.detail || `Error al actualizar usuario: ${res.status}`);
    }
    return res.json();
  },

  async deleteUser(id: string): Promise<void> {
    const res = await authenticatedFetch(`${API_URL}/users/${id}`, {
      method: 'DELETE',
    });
    if (!res.ok && res.status !== 204) {
      const e = await res.json().catch(() => ({}));
      throw new Error(e.detail || `Error al eliminar usuario: ${res.status}`);
    }
  },
};