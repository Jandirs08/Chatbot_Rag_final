"use client";

import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import { Progress } from "@/app/components/ui/progress";
import { cn } from "@/app/lib/utils";
import type { UploadState } from "@/app/hooks/useDocumentManagement";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Loader2,
  Upload,
  X,
} from "lucide-react";

const uploadSteps = [
  {
    key: "uploading",
    label: "Subiendo archivo",
    description: "Transferencia segura al servidor.",
  },
  {
    key: "queued",
    label: "En cola",
    description: "El backend ya recibió el PDF y agendó la ingesta.",
  },
  {
    key: "processing",
    label: "Procesando e indexando",
    description: "Extracción, embeddings y registro en Qdrant.",
  },
] as const;

interface UploadStatusPanelProps {
  state: UploadState;
  onDismiss: () => void;
}

export function UploadStatusPanel({
  state,
  onDismiss,
}: UploadStatusPanelProps) {
  if (state.phase === "idle") return null;

  const isUploading = state.phase === "uploading";
  const isQueued = state.phase === "queued";
  const isProcessing = state.phase === "processing";
  const isSuccess = state.phase === "success";
  const isError = state.phase === "error";
  const isBusy = isUploading || isQueued || isProcessing;
  const failedPhase = isError ? state.failedPhase : null;
  const activeStep = isUploading
    ? "uploading"
    : isQueued
      ? "queued"
      : "processing";

  const header = isUploading
    ? "Subiendo documento"
    : isQueued
      ? "Documento en cola de ingesta"
      : isProcessing
        ? "Procesando e indexando..."
        : isSuccess
          ? "Documento listo para usarse"
          : "No se pudo completar la ingesta";

  const description = isUploading
    ? "El archivo aún no está disponible. La indexación comenzará cuando termine la transferencia."
    : isQueued
      ? "El archivo ya fue guardado. El backend lo tomará para procesarlo e indexarlo."
      : isProcessing
        ? "El archivo ya llegó al backend. Ahora se extrae el contenido, se generan embeddings y se envía a Qdrant."
        : isSuccess
          ? "La respuesta final del servidor confirmó que el documento quedó listo en el sistema."
          : state.message;

  const statusBadgeVariant: "info" | "warning" | "success" | "error" =
    isUploading
      ? "info"
      : isQueued || isProcessing
        ? "warning"
        : isSuccess
          ? "success"
          : "error";

  const StatusIcon = isUploading
    ? Upload
    : isQueued
      ? Clock
      : isProcessing
        ? Loader2
        : isSuccess
          ? CheckCircle2
          : AlertCircle;
  const statusPill = isUploading
    ? "Subiendo"
    : isQueued
      ? "En cola"
      : isProcessing
        ? "Indexando"
        : isSuccess
          ? "Completado"
          : "Con error";

  return (
    <div
      aria-live="polite"
      className="w-full rounded-3xl border border-border/60 bg-gradient-to-br from-background via-background to-muted/30 p-4 shadow-sm"
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-3">
          <div
            className={cn(
              "mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border",
              isSuccess
                ? "border-emerald-200 bg-emerald-50 text-emerald-600 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300"
                : isError
                  ? "border-red-200 bg-red-50 text-red-600 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300"
                  : "border-primary/15 bg-primary/5 text-primary",
            )}
          >
            <StatusIcon
              className={cn("h-5 w-5", isProcessing && "animate-spin")}
            />
          </div>

          <div className="space-y-3">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={statusBadgeVariant}>{statusPill}</Badge>
                {isUploading && (
                  <span className="text-sm font-medium text-foreground/80">
                    {state.progress}% transferido
                  </span>
                )}
              </div>
              <div>
                <p className="text-base font-semibold text-foreground">
                  {header}
                </p>
                <p className="text-sm leading-6 text-muted-foreground">
                  {description}
                </p>
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              {uploadSteps.map((step, index) => {
                const isCurrent =
                  (isBusy && activeStep === step.key) ||
                  (isError && failedPhase === step.key);
                const isDone =
                  isSuccess ||
                  (step.key === "uploading" &&
                    (isQueued ||
                      isProcessing ||
                      (isError && failedPhase !== "uploading"))) ||
                  (step.key === "queued" &&
                    (isProcessing || (isError && failedPhase === "processing")));

                return (
                  <div
                    key={step.key}
                    className={cn(
                      "rounded-2xl border px-3 py-3 transition-colors",
                      isDone
                        ? "border-emerald-200 bg-emerald-50/80 dark:border-emerald-900/50 dark:bg-emerald-950/20"
                        : isCurrent
                          ? isError
                            ? "border-red-200 bg-red-50/80 dark:border-red-900/50 dark:bg-red-950/20"
                            : "border-primary/30 bg-primary/5"
                          : "border-border/60 bg-background/70",
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "flex h-6 w-6 items-center justify-center rounded-full border text-xs font-semibold",
                          isDone
                            ? "border-emerald-200 bg-emerald-100 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300"
                            : isCurrent
                              ? isError
                                ? "border-red-200 bg-red-100 text-red-700 dark:border-red-800 dark:bg-red-900/50 dark:text-red-300"
                                : "border-primary/20 bg-primary/10 text-primary"
                              : "border-border/70 bg-muted/40 text-muted-foreground",
                        )}
                      >
                        {index + 1}
                      </span>
                      <p className="text-sm font-medium text-foreground">
                        {step.label}
                      </p>
                    </div>
                    <p className="mt-2 text-xs leading-5 text-muted-foreground">
                      {step.description}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex items-start gap-3">
          <div className="rounded-2xl border border-border/60 bg-background/80 px-4 py-3 backdrop-blur">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Archivo actual
            </p>
            <p className="mt-2 max-w-xs truncate text-sm font-medium text-foreground">
              {state.fileName}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {isBusy
                ? "El estado final solo se confirma cuando responde el servidor."
                : "Estado final confirmado por la respuesta HTTP."}
            </p>
          </div>

          {!isBusy && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onDismiss}
              className="h-9 w-9 shrink-0 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Cerrar estado de subida"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      <div className="mt-4">
        {isUploading ? (
          <div className="space-y-2">
            <Progress value={state.progress} className="h-2.5 bg-primary/10" />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Transferencia del archivo en curso</span>
              <span>{state.progress}%</span>
            </div>
          </div>
        ) : isQueued || isProcessing ? (
          <div className="space-y-2">
            <div className="h-2.5 overflow-hidden rounded-full bg-primary/10">
              <div className="h-full w-1/3 rounded-full bg-gradient-to-r from-primary/30 via-primary to-primary/30 animate-pulse" />
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
              <span>
                {isQueued
                  ? "Esperando turno de ingesta..."
                  : "Procesando e indexando..."}
              </span>
            </div>
          </div>
        ) : (
          <div
            className={cn(
              "rounded-2xl border px-3 py-2 text-sm",
              isSuccess
                ? "border-emerald-200 bg-emerald-50/80 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:text-emerald-300"
                : "border-red-200 bg-red-50/80 text-red-700 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-300",
            )}
          >
            {isSuccess
              ? "El documento ya quedó disponible para consultas."
              : "La carga terminó con error. Revisa el mensaje mostrado para intentar de nuevo."}
          </div>
        )}
      </div>
    </div>
  );
}
