import { logger } from "@/app/lib/logger";

export interface FetchRetryOptions {
    maxRetries?: number;
    baseDelayMs?: number;
    timeoutMs?: number;
}

async function fetchWithTimeout(
    url: string,
    options: RequestInit = {},
    timeoutMs: number,
): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    const externalSignal = options.signal;

    const abortFromExternalSignal = () => controller.abort();
    if (externalSignal) {
        if (externalSignal.aborted) {
            controller.abort();
        } else {
            externalSignal.addEventListener("abort", abortFromExternalSignal, { once: true });
        }
    }

    try {
        return await fetch(url, {
            ...options,
            signal: controller.signal,
        });
    } finally {
        clearTimeout(timeoutId);
        externalSignal?.removeEventListener("abort", abortFromExternalSignal);
    }
}

export async function fetchWithRetry(
    url: string,
    options: RequestInit = {},
    retryOptions: FetchRetryOptions = {},
): Promise<Response> {
    const {
        maxRetries = 3,
        baseDelayMs = 500,
        timeoutMs = 30000,
    } = retryOptions;

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt += 1) {
        try {
            return await fetchWithTimeout(url, options, timeoutMs);
        } catch (error) {
            lastError = error as Error;

            if (lastError.name === "AbortError") {
                logger.warn(`[fetchWithRetry] Timeout en intento ${attempt + 1}/${maxRetries} para ${url}`);
            } else {
                logger.warn(`[fetchWithRetry] Error de red en intento ${attempt + 1}/${maxRetries} para ${url}:`, lastError.message);
            }

            if (attempt < maxRetries - 1) {
                const delay = baseDelayMs * Math.pow(2, attempt);
                await new Promise((resolve) => setTimeout(resolve, delay));
            }
        }
    }

    logger.error(`[fetchWithRetry] Todos los reintentos fallaron para ${url}`);
    throw lastError ?? new Error("Network request failed after retries");
}

export async function fetchWithRetrySafe(
    url: string,
    options: RequestInit = {},
    retryOptions: FetchRetryOptions = {},
): Promise<Response> {
    const { timeoutMs = 30000 } = retryOptions;
    const method = (options.method || "GET").toUpperCase();
    const idempotentMethods = ["GET", "HEAD", "OPTIONS"];

    if (!idempotentMethods.includes(method)) {
        return fetchWithTimeout(url, options, timeoutMs);
    }

    return fetchWithRetry(url, options, retryOptions);
}

export async function publicFetch(
    url: string,
    options: RequestInit = {},
    retryOptions: FetchRetryOptions = {},
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
            // Ignore non-readable responses.
        }
    }

    return new ApiError(message, response.status);
}
