import { API_URL } from "../constants";
import { authService, authenticatedFetch } from "./authService";

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
  static async uploadPDF(
    file: File,
    onProgress?: (percent: number) => void,
  ): Promise<{
    message: string;
    file_path: string;
    pdfs_in_directory: string[];
  }> {
    // Usar XMLHttpRequest para poder obtener eventos de progreso de subida
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const url = buildApiUrl(API_URL, "/api/v1/pdfs/upload");
      xhr.open("POST", url);
      const token = authService.getAuthToken();
      if (token) {
        xhr.setRequestHeader("Authorization", `Bearer ${token}`);
      }

      // Reportar progreso si es posible
      xhr.upload.onprogress = (event: ProgressEvent) => {
        if (event.lengthComputable && onProgress) {
          const percent = Math.round((event.loaded / event.total) * 100);
          onProgress(percent);
        }
      };
      xhr.upload.onload = () => {
        if (onProgress) {
          onProgress(100);
        }
      };

      xhr.onreadystatechange = () => {
        if (xhr.readyState === XMLHttpRequest.DONE) {
          const status = xhr.status;
          if (status >= 200 && status < 300) {
            try {
              const json = JSON.parse(xhr.responseText);
              resolve(json);
            } catch (e) {
              // Fallback: si la respuesta no es JSON, devolver un objeto mínimo
              resolve({
                message: "PDF subido exitosamente",
                file_path: "",
                pdfs_in_directory: [],
              });
            }
          } else {
            try {
              const errJson = JSON.parse(xhr.responseText);
              reject(new Error(errJson.detail || "Error al subir el PDF"));
            } catch (e) {
              reject(new Error("Error al subir el PDF"));
            }
          }
        }
      };

      xhr.onerror = () => {
        reject(new Error("Error de red durante la subida del PDF"));
      };

      const formData = new FormData();
      formData.append("file", file);
      xhr.send(formData);
    });
  }

  static async listPDFs(): Promise<{
    pdfs: Array<{
      filename: string;
      path: string;
      size: number;
      last_modified: string;
    }>;
  }> {
    const token = authService.getAuthToken();
    const response = await authenticatedFetch(buildApiUrl(API_URL, "/api/v1/pdfs/list"), {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || "Error al listar los PDFs");
    }

    return response.json();
  }

  static async deletePDF(filename: string): Promise<{ message: string }> {
    const token = authService.getAuthToken();
    const response = await authenticatedFetch(buildApiUrl(API_URL, `/api/v1/pdfs/${filename}`), {
      method: "DELETE",
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || "Error al eliminar el PDF");
    }

    return response.json();
  }

  static getPDFViewUrl(filename: string): string {
    return buildApiUrl(API_URL, `/api/v1/pdfs/view/${encodeURIComponent(filename)}`);
  }

  static getPDFDownloadUrl(filename: string): string {
    return buildApiUrl(API_URL, `/api/v1/pdfs/download/${encodeURIComponent(filename)}`);
  }

  // Obtiene el PDF como Blob usando Authorization y devuelve una URL de objeto para previsualización/descarga
  static async getPDFBlobUrl(
    filename: string,
    mode: "view" | "download" = "view"
  ): Promise<string> {
    const token = authService.getAuthToken();
    const endpoint = mode === "view"
      ? this.getPDFViewUrl(filename)
      : this.getPDFDownloadUrl(filename);

    const response = await authenticatedFetch(endpoint, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });

    if (!response.ok) {
      let detail = "Error al obtener el PDF";
      try {
        const err = await response.json();
        detail = err?.detail || detail;
      } catch (_e) {
        // ignorar si no es JSON
      }
      throw new Error(detail);
    }

    const blob = await response.blob();
    // Crear URL de objeto para usar en iframe o descarga
    const url = URL.createObjectURL(blob);
    return url;
  }

  // Descarga el PDF respetando el token creando un enlace temporal
  static async downloadPDFWithToken(filename: string): Promise<void> {
    const blobUrl = await this.getPDFBlobUrl(filename, "download");
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(blobUrl);
  }
}
