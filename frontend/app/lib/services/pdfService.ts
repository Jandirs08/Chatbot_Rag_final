import { API_URL } from "../constants";

// Normaliza el base URL y evita duplicar el prefijo "/api/v1" al construir endpoints
function buildApiUrl(base: string, path: string): string {
  // Limpia barras finales y colapsa múltiples "/api/v1" en el base
  let cleanBase = base.replace(/\/+$/, "");
  // Si accidentalmente el base tiene "/api/v1" repetido (p. ej. "/api/v1/api/v1"), colapsa a uno solo
  cleanBase = cleanBase.replace(/(\/api\/v1)+(?=\/|$)/, "/api/v1");
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  // Si el base ya incluye /api/v1, evita repetirlo en el path
  if (/\/api\/v1(?:\/|$)/.test(cleanBase)) {
    const foldedPath = cleanPath.replace(/^\/api\/v1/, "");
    return `${cleanBase}${foldedPath}`;
  }
  return `${cleanBase}${cleanPath}`;
}

export class PDFService {
  static async uploadPDF(file: File): Promise<{
    message: string;
    file_path: string;
    pdfs_in_directory: string[];
  }> {
    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch(buildApiUrl(API_URL, "/api/v1/pdfs/upload"), {
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
    const response = await fetch(buildApiUrl(API_URL, "/api/v1/pdfs/list"));

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || "Error al listar los PDFs");
    }

    return response.json();
  }

  static async deletePDF(filename: string): Promise<{ message: string }> {
    const response = await fetch(buildApiUrl(API_URL, `/api/v1/pdfs/${filename}`), {
      method: "DELETE",
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || "Error al eliminar el PDF");
    }

    return response.json();
  }
}
