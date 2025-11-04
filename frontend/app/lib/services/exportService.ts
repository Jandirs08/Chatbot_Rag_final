import { API_URL } from "../config";
import { authenticatedFetch } from "./authService";

class ExportService {
  async exportConversations(): Promise<void> {
    try {
      const response = await authenticatedFetch(`${API_URL}/chat/export-conversations`, {
        method: "GET",
      });

      if (!response.ok) {
        throw new Error("Error al exportar conversaciones");
      }

      // Obtener el nombre del archivo del header Content-Disposition
      const contentDisposition = response.headers.get("Content-Disposition") || response.headers.get("content-disposition");
      let filename = "conversaciones.xlsx";
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="(.+)"/);
        if (filenameMatch) {
          filename = filenameMatch[1];
        }
      }

      // Convertir la respuesta a blob y descargar
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error("Error al exportar conversaciones:", error);
      throw error;
    }
  }
}

export const exportService = new ExportService();
