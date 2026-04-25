import { API_URL } from "../constants";
import { authService, authenticatedFetch } from "./authService";

export class RateLimitError extends Error {
  readonly type = "RATE_LIMIT_EXCEEDED" as const;
  retryAfter: number;
  limit?: number;
  remaining: number;
  serverMessage?: string;

  constructor(opts: { retryAfter: number; limit?: number; remaining: number; serverMessage?: string }) {
    super("Límite de uploads alcanzado");
    this.retryAfter = opts.retryAfter;
    this.limit = opts.limit;
    this.remaining = opts.remaining;
    this.serverMessage = opts.serverMessage;
  }
}

export type PDFUploadStatus =
  | {
      phase: "uploading";
      progress: number;
    }
  | {
      phase: "processing";
    };


export class PDFService {
  static async uploadPDF(
    file: File,
    onProgress?: (status: PDFUploadStatus) => void,
    isRetry: boolean = false
  ): Promise<{
    message: string;
    file_path: string;
    pdfs_in_directory: string[];
    rateLimit?: {
      limit: number;
      remaining: number;
      retryAfter?: number;
    };
  }> {
    // Usar XMLHttpRequest para poder obtener eventos de progreso de subida
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const url = `${API_URL}/pdfs/upload`;
      xhr.open("POST", url);
      const token = authService.getAuthToken();
      if (token) {
        xhr.setRequestHeader("Authorization", `Bearer ${token}`);
      }

      // Reportar progreso si es posible
      xhr.upload.onprogress = (event: ProgressEvent) => {
        if (event.lengthComputable && onProgress) {
          const percent = Math.min(
            Math.round((event.loaded / event.total) * 100),
            99
          );
          onProgress({ phase: "uploading", progress: percent });
        }
      };
      xhr.upload.onload = () => {
        if (onProgress) {
          onProgress({ phase: "processing" });
        }
      };

      xhr.onreadystatechange = async () => {
        if (xhr.readyState === XMLHttpRequest.DONE) {
          const status = xhr.status;

          // Manejo de token expirado (401)
          if (status === 401 && !isRetry) {
            try {
              await authService.refreshToken();
              // Reintentar subida con nuevo token
              const result = await this.uploadPDF(file, onProgress, true);
              resolve(result);
            } catch (e) {
              reject(new Error("Sesión expirada. Por favor inicie sesión nuevamente."));
            }
            return;
          }

          // Extraer rate limit headers
          const rateLimitLimit = xhr.getResponseHeader('X-RateLimit-Limit');
          const rateLimitRemaining = xhr.getResponseHeader('X-RateLimit-Remaining');
          const retryAfter = xhr.getResponseHeader('Retry-After');

          if (status >= 200 && status < 300) {
            try {
              const json = JSON.parse(xhr.responseText);
              resolve({
                ...json,
                rateLimit: rateLimitLimit ? {
                  limit: parseInt(rateLimitLimit),
                  remaining: parseInt(rateLimitRemaining || '0'),
                  retryAfter: retryAfter ? parseInt(retryAfter) : undefined
                } : undefined
              });
            } catch (e) {
              // Fallback: si la respuesta no es JSON, devolver un objeto mínimo
              resolve({
                message: "PDF subido exitosamente",
                file_path: "",
                pdfs_in_directory: [],
              });
            }
          } else if (status === 429) {
            // Rate limit exceeded - error especial con tipo identificable
            let bodyRetryAfter: number | undefined;
            let bodyDetail: string | undefined;
            try {
              const errJson = JSON.parse(xhr.responseText);
              if (typeof errJson?.retry_after === "number") {
                bodyRetryAfter = errJson.retry_after;
              }
              if (typeof errJson?.detail === "string") {
                bodyDetail = errJson.detail;
              }
            } catch (_e) {
              // ignorar si no es JSON
            }

            reject(new RateLimitError({
              retryAfter: retryAfter ? parseInt(retryAfter) : bodyRetryAfter ?? 3600,
              limit: rateLimitLimit ? parseInt(rateLimitLimit) : undefined,
              remaining: rateLimitRemaining ? parseInt(rateLimitRemaining) : 0,
              serverMessage: bodyDetail,
            }));
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
    const response = await authenticatedFetch(`${API_URL}/pdfs/list`);

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || "Error al listar los PDFs");
    }

    return response.json();
  }

  static async deletePDF(filename: string): Promise<{ message: string }> {
    const response = await authenticatedFetch(`${API_URL}/pdfs/${filename}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || "Error al eliminar el PDF");
    }

    return response.json();
  }

  static getPDFViewUrl(filename: string): string {
    return `${API_URL}/pdfs/view/${encodeURIComponent(filename)}`;
  }

  static getPDFDownloadUrl(filename: string): string {
    return `${API_URL}/pdfs/download/${encodeURIComponent(filename)}`;
  }

  // Obtiene el PDF como Blob usando Authorization y devuelve una URL de objeto para previsualización/descarga
  static async getPDFBlobUrl(
    filename: string,
    mode: "view" | "download" = "view"
  ): Promise<string> {
    const endpoint = mode === "view"
      ? this.getPDFViewUrl(filename)
      : this.getPDFDownloadUrl(filename);

    const response = await authenticatedFetch(endpoint);

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
