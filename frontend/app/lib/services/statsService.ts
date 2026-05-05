import { API_URL } from "../config";
import { logger } from "../logger";
import { authenticatedFetch } from "./authService";

export interface Stats {
  total_queries: number;
  total_users: number;
  total_pdfs: number;
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
      logger.error("StatsService: Error al obtener stats:", error);
      throw error;
    }
  }
}

export const statsService = new StatsService();
