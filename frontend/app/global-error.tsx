"use client";

import { useEffect } from "react";
import { logger } from "@/app/lib/logger";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logger.error("Global error boundary caught:", error);
  }, [error]);

  return (
    <html lang="es">
      <body>
        <div
          className="min-h-screen flex items-center justify-center p-6 bg-white dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100"
          role="alert"
        >
          <div className="text-center max-w-md">
            <h1 className="text-4xl font-bold mb-2">Ha ocurrido un error</h1>
            <p className="text-neutral-500 dark:text-neutral-400 mb-2">
              {error?.message || "Algo salió mal mientras cargábamos la aplicación."}
            </p>
            {error?.digest && (
              <p className="mb-6 text-xs text-neutral-500/70 dark:text-neutral-400/70 font-mono">
                ID del error: {error.digest}
              </p>
            )}
            <div className="flex flex-col sm:flex-row gap-2 justify-center">
              <button
                onClick={() => reset()}
                className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-primary-foreground hover:bg-primary/90"
              >
                Reintentar
              </button>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
