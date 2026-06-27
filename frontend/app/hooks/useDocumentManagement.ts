"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { toast as sonnerToast } from "sonner";
import { useToast } from "@/app/hooks/use-toast";
import {
  PDFService,
  RateLimitError,
  type DocumentIngestionStatus,
  type PDFUploadStatus,
} from "@/app/lib/services/pdfService";

export interface PDFDocument {
  filename: string;
  path: string;
  size: number;
  last_modified: string;
  ingestion_status: DocumentIngestionStatus;
  ingestion_error?: string | null;
  ingestion_updated_at?: string | null;
}

export type UploadState =
  | { phase: "idle" }
  | { phase: "uploading"; fileName: string; progress: number }
  | { phase: "queued"; fileName: string }
  | { phase: "processing"; fileName: string }
  | { phase: "success"; fileName: string }
  | { phase: "error"; fileName: string; message: string; failedPhase: "uploading" | "queued" | "processing" };

const pad = (n: number) => String(n).padStart(2, "0");

export function useDocumentManagement() {
  const [documents, setDocuments] = useState<PDFDocument[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isLoadingList, setIsLoadingList] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [uploadState, setUploadState] = useState<UploadState>({ phase: "idle" });
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewFilename, setPreviewFilename] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [rateLimitInfo, setRateLimitInfo] = useState<{
    limit: number;
    remaining: number;
    resetTime?: Date;
  } | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadPhaseRef = useRef<"uploading" | "queued" | "processing">("uploading");
  const mountedRef = useRef(true);
  const { toast } = useToast();

  useEffect(() => () => { mountedRef.current = false; }, []);

  const loadDocuments = useCallback(async () => {
    try {
      setIsLoadingList(true);
      const response = await PDFService.listPDFs();
      if (!mountedRef.current) return;
      setDocuments(Array.isArray(response.pdfs) ? response.pdfs : []);
    } catch {
      if (!mountedRef.current) return;
      toast({ title: "Error", description: "No se pudieron cargar los documentos", variant: "destructive" });
    } finally {
      if (mountedRef.current) setIsLoadingList(false);
    }
  }, [toast]);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  useEffect(() => {
    const hasActiveIngestion = documents.some(
      (doc) => doc.ingestion_status === "queued" || doc.ingestion_status === "processing",
    );
    if (!hasActiveIngestion) return;

    const timer = setInterval(() => {
      void loadDocuments();
    }, 3000);

    return () => clearInterval(timer);
  }, [documents, loadDocuments]);

  useEffect(() => {
    if (uploadState.phase !== "queued" && uploadState.phase !== "processing") return;

    const doc = documents.find((item) => item.filename === uploadState.fileName);
    if (!doc) return;

    if (doc.ingestion_status === "queued") {
      uploadPhaseRef.current = "queued";
      if (uploadState.phase !== "queued") {
        setUploadState({ phase: "queued", fileName: doc.filename });
      }
      return;
    }

    if (doc.ingestion_status === "processing") {
      uploadPhaseRef.current = "processing";
      if (uploadState.phase !== "processing") {
        setUploadState({ phase: "processing", fileName: doc.filename });
      }
      return;
    }

    if (doc.ingestion_status === "ready") {
      setUploadState({ phase: "success", fileName: doc.filename });
      toast({ title: "Éxito", description: "PDF indexado correctamente" });
      return;
    }

    const message = doc.ingestion_error || "No se pudo completar la ingesta del PDF";
    setUploadState({
      phase: "error",
      fileName: doc.filename,
      message,
      failedPhase: uploadPhaseRef.current === "uploading" ? "processing" : uploadPhaseRef.current,
    });
    toast({ title: "Error", description: message, variant: "destructive" });
  }, [documents, toast, uploadState]);

  // Rate limit countdown
  useEffect(() => {
    let timer: ReturnType<typeof setInterval>;
    if (rateLimitInfo?.resetTime) {
      const tick = () => {
        const diff = Math.max(0, Math.floor((rateLimitInfo.resetTime!.getTime() - Date.now()) / 1000));
        setCountdown(diff);
        if (diff <= 0) setRateLimitInfo(null);
        return diff;
      };
      const initial = tick();
      if (initial > 0) {
        timer = setInterval(() => { if (tick() <= 0) clearInterval(timer); }, 1000);
      }
    }
    return () => { if (timer) clearInterval(timer); };
  }, [rateLimitInfo]);

  // Revoke blob URL when preview closes
  useEffect(() => {
    if (!isPreviewOpen && previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
      setPreviewFilename(null);
      setPreviewError(null);
    }
  }, [isPreviewOpen, previewUrl]);

  const handleUploadStatusChange = useCallback((fileName: string, status: PDFUploadStatus) => {
    uploadPhaseRef.current = status.phase;
    if (status.phase === "uploading") {
      setUploadState({ phase: "uploading", fileName, progress: status.progress });
    } else {
      setUploadState({ phase: "processing", fileName });
    }
  }, []);

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setIsUploading(true);
      uploadPhaseRef.current = "uploading";
      setUploadState({ phase: "uploading", fileName: file.name, progress: 0 });

      const response = await PDFService.uploadPDF(file, (status) =>
        handleUploadStatusChange(file.name, status),
      );
      const uploadedFilename = response.filename || file.name;
      if (!mountedRef.current) return;

      if (response.rateLimit) {
        setRateLimitInfo(response.rateLimit.remaining > 0 ? null : {
          limit: response.rateLimit.limit,
          remaining: response.rateLimit.remaining,
          resetTime: response.rateLimit.retryAfter
            ? new Date(Date.now() + response.rateLimit.retryAfter * 1000)
            : undefined,
        });
      } else {
        setRateLimitInfo(null);
      }

      uploadPhaseRef.current = "queued";
      setUploadState({ phase: "queued", fileName: uploadedFilename });
      void loadDocuments();
      toast({ title: "PDF subido", description: "La ingesta quedo en cola." });
    } catch (error: unknown) {
      if (!mountedRef.current) return;
      const message = error instanceof Error ? error.message : String(error);

      if (error instanceof RateLimitError) {
        const minutes = Math.ceil(error.retryAfter / 60);
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        const timeMsg = hours > 0
          ? `${hours} hora${hours > 1 ? "s" : ""}${mins > 0 ? ` y ${mins} minutos` : ""}`
          : `${minutes} minuto${minutes > 1 ? "s" : ""}`;

        toast({
          title: "⚠️ Límite de uploads alcanzado",
          description: `Has alcanzado el límite de uploads por hora. Podrás subir más PDFs en ${timeMsg}.`,
          variant: "destructive",
          duration: 10000,
        });
        setRateLimitInfo({
          limit: error.limit ?? 0,
          remaining: error.remaining,
          resetTime: new Date(Date.now() + error.retryAfter * 1000),
        });
      } else if (message.toLowerCase().includes("contenido duplicado")) {
        toast({
          title: "Documento duplicado",
          description: "Este PDF está cargado, intenta agregando otro PDF diferente.",
          variant: "destructive",
        });
      } else {
        toast({ title: "Error", description: message || "No se pudo subir el PDF", variant: "destructive" });
      }

      setUploadState({ phase: "error", fileName: file.name, message, failedPhase: uploadPhaseRef.current });
    } finally {
      if (mountedRef.current) setIsUploading(false);
      uploadPhaseRef.current = "uploading";
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDelete = async (filename: string) => {
    try {
      setIsLoadingList(true);
      await PDFService.deletePDF(filename);
      if (!mountedRef.current) return;
      toast({ title: "Éxito", description: "PDF eliminado correctamente" });
      loadDocuments();
    } catch (error) {
      if (!mountedRef.current) return;
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "No se pudo eliminar el PDF",
        variant: "destructive",
      });
    } finally {
      if (mountedRef.current) setIsLoadingList(false);
    }
  };

  const handlePreview = async (filename: string) => {
    setPreviewError(null);
    setPreviewUrl(null);
    setPreviewFilename(filename);
    setIsPreviewOpen(true);
    setPreviewLoading(true);
    try {
      const url = await PDFService.getPDFBlobUrl(filename, "view");
      if (!mountedRef.current) { URL.revokeObjectURL(url); return; }
      setPreviewUrl(url);
    } catch (error) {
      if (!mountedRef.current) return;
      setPreviewError(error instanceof Error ? error.message : "No se pudo cargar el preview");
    } finally {
      if (mountedRef.current) setPreviewLoading(false);
    }
  };

  const handleDownload = async (filename: string) => {
    const toastId = sonnerToast.loading(`Descargando ${filename}...`);
    try {
      setIsDownloading(true);
      await PDFService.downloadPDFWithToken(filename);
      sonnerToast.dismiss(toastId);
      sonnerToast.success("Descarga iniciada");
    } catch (error) {
      sonnerToast.dismiss(toastId);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "No se pudo descargar el PDF",
        variant: "destructive",
      });
    } finally {
      setIsDownloading(false);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return "-";
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return "-";
    const utcMs = d.getTime() + d.getTimezoneOffset() * 60000;
    const lima = new Date(utcMs - 5 * 60 * 60000);
    return `${lima.getFullYear()}-${pad(lima.getMonth() + 1)}-${pad(lima.getDate())} ${pad(lima.getHours())}:${pad(lima.getMinutes())}:${pad(lima.getSeconds())}`;
  };

  const formatCountdown = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const filteredDocuments = useMemo(
    () => documents.filter((doc) => doc.filename.toLowerCase().includes(searchTerm.toLowerCase())),
    [documents, searchTerm],
  );

  const totalSize = useMemo(() => documents.reduce((acc, doc) => acc + doc.size, 0), [documents]);

  const handleButtonClick = () => fileInputRef.current?.click();

  const handleDismissUploadState = useCallback(() => setUploadState({ phase: "idle" }), []);

  return {
    // state
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
    // handlers
    loadDocuments,
    handleUpload,
    handleDelete,
    handlePreview,
    handleDownload,
    handleButtonClick,
    handleDismissUploadState,
    // formatters
    formatFileSize,
    formatDate,
    formatCountdown,
    // computed
    filteredDocuments,
    totalSize,
  };
}
