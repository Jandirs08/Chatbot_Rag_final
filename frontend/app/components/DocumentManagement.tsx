"use client";

import dynamic from "next/dynamic";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Toaster } from "@/app/components/ui/toaster";
import { ClearRAGDialog } from "@/app/components/documents/ClearRAGDialog";
import { DocumentStatsCards } from "@/app/components/documents/DocumentStatsCards";
import { DocumentTable } from "@/app/components/documents/DocumentTable";
import { UploadStatusPanel } from "@/app/components/documents/UploadStatusPanel";
import { useAuthContext } from "@/app/contexts/AuthContext";
import { useDocumentManagement } from "@/app/hooks/useDocumentManagement";
import { useUnsavedChanges } from "@/app/hooks/useUnsavedChanges";
import { hasPermission } from "@/app/lib/auth/permissions";
import { Clock, Search, Upload } from "lucide-react";

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
    <div className="space-y-8 animate-fade-in">
      <Toaster />

      <div className="space-y-2">
        <h1 className="text-4xl font-bold text-foreground">
          Gestión de Documentos
        </h1>
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

        <UploadStatusPanel
          state={uploadState}
          onDismiss={handleDismissUploadState}
        />
      </div>

      <DocumentStatsCards
        documentCount={documents.length}
        totalSize={totalSize}
        isLoading={isLoadingList}
        formatFileSize={formatFileSize}
      />

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
