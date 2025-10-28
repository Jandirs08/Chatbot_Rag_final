import { API_URL } from "../config";

export interface Stats {
  total_queries: number;
  total_users: number;
  total_pdfs: number;
}

class StatsService {
  async getStats(): Promise<Stats> {
    try {
      console.log(
        "StatsService: Iniciando petición a",
        `${API_URL}/chat/stats`,
      );
      const response = await fetch(`${API_URL}/chat/stats`);
      console.log(
        "StatsService: Respuesta recibida",
        response.status,
        response.statusText,
      );

      if (!response.ok) {
        console.error(
          "StatsService: Error en la respuesta",
          response.status,
          response.statusText,
        );
        throw new Error("Error al obtener estadísticas");
      }

      const data = await response.json();
      console.log("StatsService: Datos recibidos", data);

      // Validar la estructura de los datos
      if (!data || typeof data !== "object") {
        console.error("StatsService: Datos inválidos recibidos", data);
        throw new Error("Formato de datos inválido");
      }

      // Asegurar que todos los campos requeridos estén presentes
      const stats: Stats = {
        total_queries: Number(data.total_queries) || 0,
        total_users: Number(data.total_users) || 0,
        total_pdfs: Number(data.total_pdfs) || 0,
      };

      console.log("StatsService: Datos procesados", stats);
      return stats;
    } catch (error) {
      console.error("StatsService: Error detallado:", error);
      throw error;
    }
  }
}

export const statsService = new StatsService();
