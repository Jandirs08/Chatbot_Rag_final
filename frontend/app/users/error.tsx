"use client";

import { useEffect } from "react";
import { logger } from "@/app/lib/logger";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logger.error("Page error boundary caught:", error);
  }, [error]);

  return (
    <div
      className="flex items-center justify-center p-6"
      role="alert"
    >
      <div className="text-center max-w-md">
        <h1 className="text-4xl font-bold mb-2">Ha ocurrido un error</h1>
        <p className="text-muted-foreground mb-2">
          {error?.message || "Algo salió mal mientras cargábamos esta página."}
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
          <a
            href={`mailto:soporte@campusromero.pe?subject=Error%20en%20la%20app${
              error?.digest ? `%20(${error.digest})` : ""
            }&body=${encodeURIComponent(
              `Mensaje: ${error?.message || "(sin mensaje)"}\nID: ${error?.digest || "n/a"}\nURL: ${typeof window !== "undefined" ? window.location.href : ""}`,
            )}`}
            className="inline-flex items-center justify-center rounded-md border border-border bg-background px-4 py-2 text-foreground hover:bg-muted"
          >
            Reportar problema
          </a>
        </div>
      </div>
    </div>
  );
}
