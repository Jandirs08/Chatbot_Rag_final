import { API_URL } from "../config";
import { authenticatedFetch } from "./authService";

export const whatsappService = {
  async testConnection(): Promise<{ status: string; message?: string }> {
    const res = await authenticatedFetch(`${API_URL}/whatsapp/test`, { method: "GET" });
    try {
      const data = await res.json();
      return data;
    } catch {
      return { status: "error" };
    }
  },
};