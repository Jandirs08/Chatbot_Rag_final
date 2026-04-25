import { logger } from "@/app/lib/logger";

/**
 * Utilidades de fetch con retry para mejorar resiliencia ante errores de red.
 *
 * IMPORTANTE: Solo reintenta errores de red (NetworkError, timeout).
 * Los errores HTTP (4xx, 5xx) se propagan inmediatamente al caller.
 */

/**
 * Opciones de configuración para fetchWithRetry
 */
export interface FetchRetryOptions {
    /** Número máximo de reintentos (default: 3) */
    maxRetries?: number;
    /** Delay base en ms para backoff exponencial (default: 500) */
    baseDelayMs?: number;
    /** Timeout por request en ms (default: 30000) */
    timeoutMs?: number;
}

/**
 * Fetch con retry automático para errores de red.
 * 
 * Comportamiento:
 * - Solo reintenta en errores de red (fetch throws), no en errores HTTP
 * - Backoff exponencial: 500ms, 1000ms, 2000ms...
 * - Los errores HTTP (response.ok === false) se retornan inmediatamente
 * 
 * @param url - URL a llamar
 * @param options - Opciones estándar de fetch
 * @param retryOptions - Configuración de retry
 * @returns Promise<Response>
 */
export async function fetchWithRetry(
    url: string,
    options: RequestInit = {},
    retryOptions: FetchRetryOptions = {}
): Promise<Response> {
    const {
        maxRetries = 3,
        baseDelayMs = 500,
        timeoutMs = 30000
    } = retryOptions;

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            // Crear AbortController para timeout
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

            const response = await fetch(url, {
                ...options,
                signal: controller.signal,
            });

            clearTimeout(timeoutId);

            // Retornar cualquier respuesta HTTP (incluso 4xx/5xx)
            // El caller decide qué hacer con el status
            return response;
        } catch (error) {
            lastError = error as Error;

            // Si es abort por timeout, manejar específicamente
            if (lastError.name === 'AbortError') {
                logger.warn(`[fetchWithRetry] Timeout en intento ${attempt + 1}/${maxRetries} para ${url}`);
            } else {
                logger.warn(`[fetchWithRetry] Error de red en intento ${attempt + 1}/${maxRetries} para ${url}:`, lastError.message);
            }

            // Si quedan reintentos, esperar con backoff exponencial
            if (attempt < maxRetries - 1) {
                const delay = baseDelayMs * Math.pow(2, attempt); // 500, 1000, 2000...
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }

    // Todos los reintentos fallaron
    logger.error(`[fetchWithRetry] Todos los reintentos fallaron para ${url}`);
    throw lastError ?? new Error('Network request failed after retries');
}

/**
 * Versión de fetchWithRetry que NO reintenta operaciones mutativas (POST, PUT, DELETE)
 * por razones de seguridad (evitar duplicados).
 *
 * Solo aplica retry a: GET, HEAD, OPTIONS
 */
export async function fetchWithRetrySafe(
    url: string,
    options: RequestInit = {},
    retryOptions: FetchRetryOptions = {}
): Promise<Response> {
    const method = (options.method || 'GET').toUpperCase();
    const idempotentMethods = ['GET', 'HEAD', 'OPTIONS'];

    // Solo reintentar métodos idempotentes
    if (!idempotentMethods.includes(method)) {
        // Para métodos mutatives, hacer un solo intento
        return fetch(url, options);
    }

    return fetchWithRetry(url, options, retryOptions);
}

/**
 * Wrapper for unauthenticated/public endpoints (login, register, password reset,
 * public bot config). Sets Content-Type for JSON, applies retry-safe semantics,
 * and includes credentials so server cookies (CSRF, etc.) are forwarded.
 */
export async function publicFetch(
    url: string,
    options: RequestInit = {},
    retryOptions: FetchRetryOptions = {}
): Promise<Response> {
    const headers = new Headers(options.headers);
    if (!headers.has("Content-Type") && options.body !== undefined) {
        headers.set("Content-Type", "application/json");
    }
    if (!headers.has("Accept")) {
        headers.set("Accept", "application/json");
    }

    return fetchWithRetrySafe(
        url,
        {
            credentials: "include",
            ...options,
            headers,
        },
        retryOptions,
    );
}

export class ApiError extends Error {
    readonly status: number;

    constructor(message: string, status: number) {
        super(message);
        this.name = "ApiError";
        this.status = status;
    }
}

/**
 * Read a non-OK response and produce a consistent error message.
 * Reads JSON `detail`/`message` if present, otherwise falls back to status text.
 */
export async function parseApiError(
    response: Response,
    fallback = "Request failed",
): Promise<ApiError> {
    let message = fallback;

    try {
        const data = await response.clone().json();
        if (data && typeof data === "object") {
            const detail = (data as { detail?: unknown }).detail;
            const msg = (data as { message?: unknown }).message;
            if (typeof detail === "string") {
                message = detail;
            } else if (typeof msg === "string") {
                message = msg;
            }
        }
    } catch {
        try {
            const text = await response.clone().text();
            if (text) message = text;
        } catch {
            // ignore
        }
    }

    return new ApiError(message, response.status);
}
