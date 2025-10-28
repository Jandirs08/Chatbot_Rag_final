const API_BASE_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8080/api/v1";

export const ragService = {
  clearRag: async (): Promise<{
    status: string;
    message: string;
    remaining_pdfs: number;
    vector_store_size: number;
  }> => {
    try {
      const response = await fetch(`${API_BASE_URL}/rag/clear-rag`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || "Error al limpiar el RAG");
      }

      return response.json();
    } catch (error) {
      console.error("Error en clearRag:", error);
      throw error;
    }
  },

  // Aquí se pueden añadir otras funciones relacionadas con el RAG, como getRagStatus, ingestPdfs, etc.
  getRagStatus: async (): Promise<any> => {
    try {
      const response = await fetch(`${API_BASE_URL}/rag/rag-status`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          errorData.detail || "Error al obtener el estado del RAG",
        );
      }
      return response.json();
    } catch (error) {
      console.error("Error en getRagStatus:", error);
      throw error;
    }
  },
};
