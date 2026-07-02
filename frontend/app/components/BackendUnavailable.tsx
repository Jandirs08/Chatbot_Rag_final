"use client";

import { ServerCrash, RotateCw } from "lucide-react";

interface Props {
  onRetry: () => void;
  isRetrying?: boolean;
}

/**
 * Branded fallback shown when the session can't be resolved because the backend
 * is unreachable (e.g. MongoDB down). Replaces the otherwise-infinite
 * "Validando sesión…" spinner so the user gets a clear state + a way out.
 */
export function BackendUnavailable({ onRetry, isRetrying = false }: Props) {
  return (
    <div
      className="flex h-screen w-full items-center justify-center p-6"
      style={{ background: "hsl(var(--surface))" }}
      role="alert"
    >
      <div className="text-center max-w-md">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-error/10 border border-error/20">
          <ServerCrash className="h-7 w-7 text-error" aria-hidden="true" />
        </div>
        <h1 className="text-2xl font-heading font-bold mb-2 text-foreground">
          No pudimos conectar con el servidor
        </h1>
        <p className="text-muted-foreground mb-6 text-sm leading-relaxed">
          El backend no responde en este momento. Puede estar reiniciándose o
          con un servicio caído. Reintenta en unos segundos.
        </p>
        <button
          type="button"
          onClick={onRetry}
          disabled={isRetrying}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          <RotateCw
            className={`h-4 w-4 ${isRetrying ? "animate-spin" : ""}`}
            aria-hidden="true"
          />
          {isRetrying ? "Reintentando…" : "Reintentar"}
        </button>
      </div>
    </div>
  );
}
