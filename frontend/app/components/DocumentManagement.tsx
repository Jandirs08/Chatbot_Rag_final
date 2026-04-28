"use client";

import { useRef } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Download,
  FileText,
  Loader2,
  Search,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/app/components/ui/table";
import { useUnsavedChanges } from "@/app/hooks/useUnsavedChanges";
import { Progress } from "@/app/components/ui/progress";
import { Skeleton } from "@/app/components/ui/skeleton";
import dynamic from "next/dynamic";

const PdfViewerModal = dynamic(
  () => import("@/app/components/modals/PdfViewerModal"),
  { ssr: false },
);
import { Toaster } from "@/app/components/ui/toaster";
import { cn } from "@/lib/utils";
import { ClearRAGDialog } from "@/app/components/documents/ClearRAGDialog";
import { useDocumentManagement, type UploadState } from "@/app/hooks/useDocumentManagement";
import { useAuthContext } from "@/app/contexts/AuthContext";
import { hasPermission } from "@/app/lib/auth/permissions";

const uploadSteps = [
  { key: "uploading", label: "Subiendo archivo", description: "Transferencia segura al servidor." },
  { key: "queued", label: "En cola", description: "El backend ya recibio el PDF y agendo la ingesta." },
  { key: "processing", label: "Procesando e indexando", description: "Extraccion, embeddings y registro en Qdrant." },
] as const;

const ingestionStatusLabels = {
  queued: "En cola",
  processing: "Indexando",
  ready: "Listo",
  failed: "Error",
} as const;

const ingestionStatusVariants = {
  queued: "warning",
  processing: "info",
  ready: "success",
  failed: "error",
} as const;

function UploadStatusPanel({ state, onDismiss }: { state: UploadState; onDismiss: () => void }) {
  if (state.phase === "idle") return null;

  const isUploading = state.phase === "uploading";
  const isQueued = state.phase === "queued";
  const isProcessing = state.phase === "processing";
  const isSuccess = state.phase === "success";
  const isError = state.phase === "error";
  const isBusy = isUploading || isQueued || isProcessing;
  const failedPhase = isError ? state.failedPhase : null;
  const activeStep = isUploading ? "uploading" : isQueued ? "queued" : "processing";

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
    ? "El archivo aun no esta disponible. La indexacion comenzara cuando termine la transferencia."
    : isQueued
      ? "El archivo ya fue guardado. El backend lo tomara para procesarlo e indexarlo."
    : isProcessing
      ? "El archivo ya llego al backend. Ahora se extrae el contenido, se generan embeddings y se envia a Qdrant."
      : isSuccess
        ? "La respuesta final del servidor confirmo que el documento quedo listo en el sistema."
        : state.message;

  const statusBadgeVariant: "info" | "warning" | "success" | "error" =
    isUploading ? "info" : isQueued || isProcessing ? "warning" : isSuccess ? "success" : "error";

  const StatusIcon = isUploading ? Upload : isQueued ? Clock : isProcessing ? Loader2 : isSuccess ? CheckCircle2 : AlertCircle;
  const statusPill = isUploading ? "Subiendo" : isQueued ? "En cola" : isProcessing ? "Indexando" : isSuccess ? "Completado" : "Con error";

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
            <StatusIcon className={cn("h-5 w-5", isProcessing && "animate-spin")} />
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
                <p className="text-base font-semibold text-foreground">{header}</p>
                <p className="text-sm leading-6 text-muted-foreground">{description}</p>
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
                    (isQueued || isProcessing || (isError && failedPhase !== "uploading"))) ||
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
                      <p className="text-sm font-medium text-foreground">{step.label}</p>
                    </div>
                    <p className="mt-2 text-xs leading-5 text-muted-foreground">{step.description}</p>
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
              <span>{isQueued ? "Esperando turno de ingesta..." : "Procesando e indexando..."}</span>
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
              ? "El documento ya quedo disponible para consultas."
              : "La carga termino con error. Revisa el mensaje mostrado para intentar de nuevo."}
          </div>
        )}
      </div>
    </div>
  );
}

export function DocumentManagement() {
  const { user } = useAuthContext();
  const canManageDocuments = hasPermission(user, "manage_documents");
  const {
    documents,
    searchTerm, setSearchTerm,
    isLoadingList,
    isUploading,
    isDownloading,
    uploadState,
    isPreviewOpen, setIsPreviewOpen,
    previewFilename,
    previewUrl,
    previewLoading,
    previewError,
    rateLimitInfo,
    countdown,
    fileInputRef,
    loadDocuments,
    handleUpload,
    handleDelete,
    handlePreview,
    handleDownload,
    handleButtonClick,
    handleDismissUploadState,
    formatFileSize,
    formatDate,
    formatCountdown,
    filteredDocuments,
    totalSize,
  } = useDocumentManagement();

  useUnsavedChanges(isDownloading);

  return (
    <div className="space-y-8 animate-fade-in">
      <Toaster />

      <div className="space-y-2">
        <h1 className="text-4xl font-bold text-foreground">Gestión de Documentos</h1>
        <p className="text-xl text-muted-foreground">
          Administra los PDFs que alimentan el conocimiento del bot
        </p>
      </div>

      <div className="space-y-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar documentos..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <div className="relative flex flex-wrap items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf"
              onChange={handleUpload}
              className="hidden"
              disabled={!canManageDocuments || isUploading || isLoadingList || rateLimitInfo?.remaining === 0}
            />
            <Button
              onClick={handleButtonClick}
              className="gradient-primary cursor-pointer hover:opacity-90"
              disabled={!canManageDocuments || isUploading || isLoadingList || rateLimitInfo?.remaining === 0}
            >
              <Upload className="mr-2 h-4 w-4" />
              {uploadState.phase === "processing"
                ? "Indexando..."
                : isUploading
                  ? "Subiendo..."
                  : "Subir PDF"}
            </Button>

            {rateLimitInfo && rateLimitInfo.remaining === 0 && countdown !== null && countdown > 0 && (
              <div className="flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                <Clock className="h-3 w-3" />
                <span>Disponible en {formatCountdown(countdown)}</span>
              </div>
            )}

            <ClearRAGDialog
              onClearSuccess={loadDocuments}
              disabled={!canManageDocuments || isUploading || isLoadingList}
            />
          </div>
        </div>

        <UploadStatusPanel state={uploadState} onDismiss={handleDismissUploadState} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="border-border/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Documentos</CardTitle>
            <FileText className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">
              {isLoadingList ? <Skeleton className="h-6 w-16" /> : documents.length}
            </div>
            <p className="text-xs text-muted-foreground mt-1">PDFs en el sistema</p>
          </CardContent>
        </Card>

        <Card className="border-border/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Tamaño Total</CardTitle>
            <Upload className="h-4 w-4 text-accent" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">
              {isLoadingList ? <Skeleton className="h-6 w-24" /> : formatFileSize(totalSize)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Espacio utilizado</p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/50">
        <CardHeader>
          <CardTitle>Documentos Subidos</CardTitle>
          <CardDescription>Lista de PDFs procesados</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="py-4">Nombre</TableHead>
                  <TableHead className="py-4">Estado</TableHead>
                  <TableHead className="py-4">Fecha</TableHead>
                  <TableHead className="py-4">Tamaño</TableHead>
                  <TableHead className="text-right py-4">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoadingList && documents.length === 0
                  ? Array.from({ length: 3 }).map((_, idx) => (
                    <TableRow key={`skeleton-${idx}`}>
                      <TableCell className="py-4">
                        <div className="flex items-center gap-2">
                          <Skeleton className="h-4 w-4 rounded" />
                          <Skeleton className="h-4 w-40" />
                        </div>
                      </TableCell>
                      <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                      <TableCell className="text-right"><Skeleton className="h-8 w-20 ml-auto" /></TableCell>
                    </TableRow>
                  ))
                  : filteredDocuments.map((doc) => (
                    <TableRow key={doc.filename}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <FileText className="w-4 h-4 text-primary" />
                          {doc.filename}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <Badge variant={ingestionStatusVariants[doc.ingestion_status] ?? "secondary"}>
                            {ingestionStatusLabels[doc.ingestion_status] ?? doc.ingestion_status}
                          </Badge>
                          {doc.ingestion_error && (
                            <span className="max-w-[240px] truncate text-xs text-red-600 dark:text-red-400">
                              {doc.ingestion_error}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{formatDate(doc.last_modified)}</TableCell>
                      <TableCell>{formatFileSize(doc.size)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex gap-2 justify-end">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handlePreview(doc.filename)}
                            disabled={isLoadingList || isUploading || doc.ingestion_status !== "ready"}
                            title="Preview"
                            className="dark:bg-slate-700 dark:text-white dark:border-slate-600 dark:hover:bg-slate-600"
                          >
                            <Search className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDownload(doc.filename)}
                            disabled={isLoadingList || isUploading || isDownloading || doc.ingestion_status !== "ready"}
                            title="Download"
                            className="dark:bg-slate-700 dark:text-white dark:border-slate-600 dark:hover:bg-slate-600"
                          >
                            <Download className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDelete(doc.filename)}
                            className="text-gray-500 hover:text-red-600 hover:bg-red-50 dark:text-slate-400 dark:hover:text-red-500 dark:bg-slate-700 dark:border-slate-600 dark:hover:bg-red-900/20"
                            disabled={!canManageDocuments || isLoadingList || isUploading || doc.ingestion_status === "processing"}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {isPreviewOpen && (
        <PdfViewerModal
          isOpen={isPreviewOpen}
          onClose={setIsPreviewOpen}
          pdfUrl={previewUrl}
          initialPage={null}
          title={previewFilename ?? undefined}
          isLoading={previewLoading}
          error={previewError}
        />
      )}
    </div>
  );
}
