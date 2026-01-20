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
                console.warn(`[fetchWithRetry] Timeout en intento ${attempt + 1}/${maxRetries} para ${url}`);
            } else {
                console.warn(`[fetchWithRetry] Error de red en intento ${attempt + 1}/${maxRetries} para ${url}:`, lastError.message);
            }

            // Si quedan reintentos, esperar con backoff exponencial
            if (attempt < maxRetries - 1) {
                const delay = baseDelayMs * Math.pow(2, attempt); // 500, 1000, 2000...
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }

    // Todos los reintentos fallaron
    console.error(`[fetchWithRetry] Todos los reintentos fallaron para ${url}`);
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
