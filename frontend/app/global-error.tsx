"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Global error boundary caught:", error);
  }, [error]);

  return (
    <html lang="es">
      <body>
        <div
          className="min-h-screen flex items-center justify-center p-6 bg-background text-foreground"
          role="alert"
        >
          <div className="text-center max-w-md">
            <h1 className="text-4xl font-bold mb-2">Ha ocurrido un error</h1>
            <p className="text-muted-foreground mb-2">
              {error?.message || "Algo salió mal mientras cargábamos la aplicación."}
            </p>
            {error?.digest && (
              <p className="mb-6 text-xs text-muted-foreground/70 font-mono">
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
