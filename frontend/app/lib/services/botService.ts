import { API_URL } from "@/app/lib/config";
import { logger } from "@/app/lib/logger";
import { authenticatedFetch } from "@/app/lib/services/authService";

export interface BotState {
  is_active: boolean;
  message: string;
  last_activity_iso?: string | null;
}

export const botService = {
  async getState(): Promise<BotState> {
    try {
      logger.log(
        "Intentando obtener estado del bot desde:",
        `${API_URL}/bot/state`,
      );
      const response = await authenticatedFetch(`${API_URL}/bot/state`, {
        method: "GET",
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        logger.error("Error en la respuesta:", {
          status: response.status,
          statusText: response.statusText,
          errorData,
        });
        throw new Error(
          `Error al obtener el estado del bot: ${response.status} ${response.statusText}`,
        );
      }

      const data = await response.json();
      logger.log("Estado del bot obtenido:", data);
      return data;
    } catch (error) {
      logger.error("Error completo al obtener estado del bot:", error);
      throw error;
    }
  },

  async toggleState(): Promise<BotState> {
    try {
      logger.log(
        "Intentando cambiar estado del bot en:",
        `${API_URL}/bot/toggle`,
      );
      const response = await authenticatedFetch(`${API_URL}/bot/toggle`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        logger.error("Error en la respuesta:", {
          status: response.status,
          statusText: response.statusText,
          errorData,
        });
        throw new Error(
          `Error al cambiar el estado del bot: ${response.status} ${response.statusText}`,
        );
      }

      const data = await response.json();
      logger.log("Estado del bot actualizado:", data);
      return data;
    } catch (error) {
      logger.error("Error completo al cambiar estado del bot:", error);
      throw error;
    }
  },
};

