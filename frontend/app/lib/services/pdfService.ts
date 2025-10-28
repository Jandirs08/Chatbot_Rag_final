import { API_URL } from "../constants";

export class PDFService {
  static async uploadPDF(file: File): Promise<{
    message: string;
    file_path: string;
    pdfs_in_directory: string[];
  }> {
    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch(`${API_URL}/api/v1/pdfs/upload`, {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || "Error al subir el PDF");
    }

    return response.json();
  }

  static async listPDFs(): Promise<{
    pdfs: Array<{
      filename: string;
      path: string;
      size: number;
      last_modified: string;
    }>;
  }> {
    const response = await fetch(`${API_URL}/api/v1/pdfs/list`);

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || "Error al listar los PDFs");
    }

    return response.json();
  }

  static async deletePDF(filename: string): Promise<{ message: string }> {
    const response = await fetch(`${API_URL}/api/v1/pdfs/${filename}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || "Error al eliminar el PDF");
    }

    return response.json();
  }
}
