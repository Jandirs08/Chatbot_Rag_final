import { API_URL } from "../config";
import { authenticatedFetch } from "./authService";
import { logger } from "@/app/lib/logger";

export const ragService = {
  clearRag: async (): Promise<{
    status: string;
    message: string;
    remaining_pdfs: number;
    count?: number; // backend schema actual
    vector_store_size?: number; // compat con documentación antigua
  }> => {
    try {
      const response = await authenticatedFetch(`${API_URL}/rag/clear-rag`, {
        method: "POST",
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || "Error al limpiar el RAG");
      }

      return response.json();
    } catch (error) {
      logger.error("Error en clearRag:", error);
      throw error;
    }
  },

};
