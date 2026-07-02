"use client";

import dynamic from "next/dynamic";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Toaster } from "@/app/components/ui/toaster";
import { ClearRAGDialog } from "@/app/components/documents/ClearRAGDialog";
import { DocumentTable } from "@/app/components/documents/DocumentTable";
import { UploadStatusPanel } from "@/app/components/documents/UploadStatusPanel";
import { useAuthContext } from "@/app/contexts/AuthContext";
import { useDocumentManagement } from "@/app/hooks/useDocumentManagement";
import { useUnsavedChanges } from "@/app/hooks/useUnsavedChanges";
import { hasPermission } from "@/app/lib/auth/permissions";
import { BookOpen, Clock, FileText, Search, Upload } from "lucide-react";
import { FadeIn, TickNumber } from "@/app/_components/motion";

const PdfViewerModal = dynamic(
  () => import("@/app/components/modals/PdfViewerModal"),
  { ssr: false },
);

export function DocumentManagement() {
  const { user } = useAuthContext();
  const canManageDocuments = hasPermission(user, "manage_documents");
  const {
    documents,
    searchTerm,
    setSearchTerm,
    isLoadingList,
    isUploading,
    isDownloading,
    uploadState,
    isPreviewOpen,
    setIsPreviewOpen,
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

  const uploadDisabled =
    !canManageDocuments ||
    isUploading ||
    isLoadingList ||
    rateLimitInfo?.remaining === 0;

  return (
    <FadeIn className="-m-8 p-6 md:p-10 lg:p-12">
      <Toaster />
      <div className="mx-auto max-w-[1400px]">
        {/* ── Hero ─────────────────────────────────────────────────────── */}
        <header className="relative overflow-hidden rounded-2xl border border-border/60 bg-card px-6 py-5 md:px-8 md:py-6 mb-6">
          <div
            aria-hidden="true"
            className="absolute -top-16 -right-12 w-64 h-64 opacity-30 animate-orb-float pointer-events-none"
          >
            <img
              src="/assets/decor/glow-orb-teal.svg"
              alt=""
              className="w-full h-full"
            />
          </div>
          <div
            aria-hidden="true"
            className="absolute -bottom-20 right-32 w-48 h-48 opacity-20 animate-orb-float pointer-events-none"
            style={{ animationDelay: "-7s" }}
          >
            <img
              src="/assets/decor/glow-orb-violet.svg"
              alt=""
              className="w-full h-full"
              loading="lazy"
            />
          </div>
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-grid opacity-25 pointer-events-none"
          />

          <div className="relative flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="flex items-center gap-2.5 mb-2.5">
                <span className="h-px w-6 bg-primary/40" />
                <span className="text-[10px] uppercase tracking-[0.18em] font-heading text-muted-foreground">
                  Conocimiento · base de datos RAG
                </span>
              </div>
              <div className="flex items-center gap-3">
                <BookOpen className="h-7 w-7 text-primary" />
                <h1 className="text-3xl md:text-4xl font-heading font-bold tracking-tighter leading-none">
                  <span className="gradient-hero-display">Documentos</span>
                </h1>
              </div>
              <div className="flex flex-wrap items-center gap-3 mt-3 text-xs">
                <span className="inline-flex items-center gap-1.5 font-mono text-muted-foreground tabular-nums">
                  <FileText className="h-3 w-3 text-primary" />
                  <TickNumber value={documents.length} />
                  <span className="text-muted-foreground/70">
                    documentos indexados
                  </span>
                </span>
                {totalSize > 0 && (
                  <span className="font-mono text-muted-foreground/70 text-[11px]">
                    {formatFileSize(totalSize)} utilizados
                  </span>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-wrap items-center gap-2 self-start">
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf"
                onChange={handleUpload}
                className="hidden"
                disabled={uploadDisabled}
              />
              <Button
                onClick={handleButtonClick}
                className="gradient-primary cursor-pointer hover:opacity-90"
                disabled={uploadDisabled}
              >
                <Upload className="mr-2 h-4 w-4" />
                {uploadState.phase === "processing"
                  ? "Indexando..."
                  : isUploading
                    ? "Subiendo..."
                    : "Subir PDF"}
              </Button>

              {rateLimitInfo &&
                rateLimitInfo.remaining === 0 &&
                countdown !== null &&
                countdown > 0 && (
                  <div className="flex items-center gap-2 rounded-full bg-muted px-3 py-1.5 text-xs font-medium text-muted-foreground">
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
        </header>

        {/* ── Upload progress ───────────────────────────────────────── */}
        <UploadStatusPanel
          state={uploadState}
          onDismiss={handleDismissUploadState}
        />

        {/* ── Search ───────────────────────────────────────────────── */}
        <div className="mb-4">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar documentos..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {/* ── Document table ────────────────────────────────────────── */}
        <DocumentTable
          documents={documents}
          filteredDocuments={filteredDocuments}
          isLoadingList={isLoadingList}
          isUploading={isUploading}
          isDownloading={isDownloading}
          canManageDocuments={canManageDocuments}
          formatDate={formatDate}
          formatFileSize={formatFileSize}
          onPreview={handlePreview}
          onDownload={handleDownload}
          onDelete={handleDelete}
        />
      </div>

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
    </FadeIn>
  );
}
