import { API_URL } from "../config";
import { authenticatedFetch } from "./authService";

export interface Stats {
  total_queries: number;
  total_users: number;
  total_pdfs: number;
}

export interface HistoryPoint {
  date: string;
  messages_count: number;
  users_count: number;
}

class StatsService {
  async getStats(): Promise<Stats> {
    try {
      const response = await authenticatedFetch(`${API_URL}/chat/stats`);

      if (!response.ok) {
        throw new Error(`Error al obtener estadísticas (${response.status})`);
      }

      const data = await response.json();

      if (!data || typeof data !== "object") {
        throw new Error("Formato de datos inválido");
      }

      return {
        total_queries: Number(data.total_queries) || 0,
        total_users: Number(data.total_users) || 0,
        total_pdfs: Number(data.total_pdfs) || 0,
      };
    } catch (error) {
      console.error("StatsService: Error al obtener stats:", error);
      throw error;
    }
  }

  async getHistory(days: number): Promise<HistoryPoint[]> {
    try {
      const response = await authenticatedFetch(
        `${API_URL}/chat/stats/history?days=${days}`
      );
      if (!response.ok) {
        throw new Error(`Error al obtener histórico (${response.status})`);
      }
      const data = await response.json();
      if (!Array.isArray(data)) {
        throw new Error("Formato de datos inválido (se esperaba lista)");
      }
      return data.map((d) => ({
        date: String(d.date),
        messages_count: Number(d.messages_count) || 0,
        users_count: Number(d.users_count) || 0,
      }));
    } catch (error) {
      console.error("StatsService: Error al obtener histórico:", error);
      throw error;
    }
  }
}

export const statsService = new StatsService();
