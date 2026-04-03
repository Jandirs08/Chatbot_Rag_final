import { useState, useEffect, useRef, useCallback, useMemo } from "react";
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
import { useToast } from "@/app/hooks/use-toast";
import { toast as sonnerToast } from "sonner";
import { useUnsavedChanges } from "@/app/hooks/useUnsavedChanges";
import { PDFService, type PDFUploadStatus } from "@/app/lib/services/pdfService";
import { ragService } from "@/app/lib/services/ragService";
import { Progress } from "@/app/components/ui/progress";
import { Skeleton } from "@/app/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/app/components/ui/dialog";
import PdfViewerModal from "@/app/components/modals/PdfViewerModal";
import { Toaster } from "@/app/components/ui/toaster";
import { cn } from "@/lib/utils";

interface PDFDocument {
  filename: string;
  path: string;
  size: number;
  last_modified: string;
}

type UploadState =
  | {
      phase: "idle";
    }
  | {
      phase: "uploading";
      fileName: string;
      progress: number;
    }
  | {
      phase: "processing";
      fileName: string;
    }
  | {
      phase: "success";
      fileName: string;
    }
  | {
      phase: "error";
      fileName: string;
      message: string;
      failedPhase: "uploading" | "processing";
    };

const uploadSteps = [
  {
    key: "uploading",
    label: "Subiendo archivo",
    description: "Transferencia segura al servidor.",
  },
  {
    key: "processing",
    label: "Procesando e indexando",
    description: "Extraccion, embeddings y registro en Qdrant.",
  },
] as const;

function UploadStatusPanel({
  state,
  onDismiss,
}: {
  state: UploadState;
  onDismiss: () => void;
}) {
  if (state.phase === "idle") {
    return null;
  }

  const isUploading = state.phase === "uploading";
  const isProcessing = state.phase === "processing";
  const isSuccess = state.phase === "success";
  const isError = state.phase === "error";
  const isBusy = isUploading || isProcessing;
  const failedPhase = isError ? state.failedPhase : null;
  const activeStep = isUploading ? "uploading" : "processing";

  const header = isUploading
    ? "Subiendo documento"
    : isProcessing
      ? "Procesando e indexando..."
      : isSuccess
        ? "Documento listo para usarse"
        : "No se pudo completar la ingesta";

  const description = isUploading
    ? "El archivo aun no esta disponible. La indexacion comenzara cuando termine la transferencia."
    : isProcessing
      ? "El archivo ya llego al backend. Ahora se extrae el contenido, se generan embeddings y se envia a Qdrant."
      : isSuccess
        ? "La respuesta final del servidor confirmo que el documento quedo listo en el sistema."
        : state.message;

  const statusBadgeVariant: "info" | "warning" | "success" | "error" =
    isUploading
      ? "info"
      : isProcessing
        ? "warning"
        : isSuccess
          ? "success"
          : "error";

  const StatusIcon = isUploading
    ? Upload
    : isProcessing
      ? Loader2
      : isSuccess
        ? CheckCircle2
        : AlertCircle;

  const statusPill = isUploading
    ? "Subiendo"
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
              className={cn(
                "h-5 w-5",
                isProcessing && "animate-spin",
              )}
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
            <Progress
              value={state.progress}
              className="h-2.5 bg-primary/10"
            />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Transferencia del archivo en curso</span>
              <span>{state.progress}%</span>
            </div>
          </div>
        ) : isProcessing ? (
          <div className="space-y-2">
            <div className="h-2.5 overflow-hidden rounded-full bg-primary/10">
              <div className="h-full w-1/3 rounded-full bg-gradient-to-r from-primary/30 via-primary to-primary/30 animate-pulse" />
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
              <span>Procesando e indexando...</span>
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
  const [documents, setDocuments] = useState<PDFDocument[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isLoadingList, setIsLoadingList] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [uploadState, setUploadState] = useState<UploadState>({
    phase: "idle",
  });
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [, setPreviewFilename] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [, setPreviewLoading] = useState(false);
  const [, setPreviewError] = useState<string | null>(null);
  const [isClearOpen, setIsClearOpen] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [clearResult, setClearResult] = useState<{
    status: string;
    message: string;
    remaining_pdfs: number;
    count?: number;
    vector_store_size?: number;
  } | null>(null);
  const [clearError, setClearError] = useState<string | null>(null);
  const [rateLimitInfo, setRateLimitInfo] = useState<{
    limit: number;
    remaining: number;
    resetTime?: Date;
  } | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadPhaseRef = useRef<"uploading" | "processing">("uploading");
  const { toast } = useToast();

  useUnsavedChanges(isDownloading);

  const loadDocuments = useCallback(async () => {
    try {
      setIsLoadingList(true);
      const response = await PDFService.listPDFs();
      setDocuments(response.pdfs);
    } catch (error) {
      toast({
        title: "Error",
        description: "No se pudieron cargar los documentos",
        variant: "destructive",
      });
    } finally {
      setIsLoadingList(false);
    }
  }, [toast]);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  // Efecto para el countdown del rate limit
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (rateLimitInfo?.resetTime) {
      const calculateCountdown = () => {
        const now = new Date().getTime();
        const reset = rateLimitInfo.resetTime!.getTime();
        const diff = Math.max(0, Math.floor((reset - now) / 1000));
        setCountdown(diff);

        // Si el tiempo se acabó, limpiar
        if (diff <= 0) {
          setRateLimitInfo(null);
        }
        return diff;
      };

      const initialDiff = calculateCountdown();
      if (initialDiff > 0) {
        timer = setInterval(() => {
          const remaining = calculateCountdown();
          if (remaining <= 0) {
            clearInterval(timer);
          }
        }, 1000);
      }
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [rateLimitInfo]);

  const formatCountdown = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const handleUploadStatusChange = useCallback(
    (fileName: string, status: PDFUploadStatus) => {
      uploadPhaseRef.current = status.phase;

      if (status.phase === "uploading") {
        setUploadState({
          phase: "uploading",
          fileName,
          progress: status.progress,
        });
        return;
      }

      setUploadState({
        phase: "processing",
        fileName,
      });
    },
    [],
  );

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setIsUploading(true);
      uploadPhaseRef.current = "uploading";
      setUploadState({
        phase: "uploading",
        fileName: file.name,
        progress: 0,
      });
      const response = await PDFService.uploadPDF(file, (status) =>
        handleUploadStatusChange(file.name, status),
      );

      // Actualizar rate limit info desde headers
      if (response.rateLimit) {
        if (response.rateLimit.remaining > 0) {
          setRateLimitInfo(null);
        } else {
          setRateLimitInfo({
            limit: response.rateLimit.limit,
            remaining: response.rateLimit.remaining,
            resetTime: response.rateLimit.retryAfter
              ? new Date(Date.now() + response.rateLimit.retryAfter * 1000)
              : undefined
          });
        }
      } else {
        setRateLimitInfo(null);
      }

      toast({
        title: "Éxito",
        description: "PDF subido correctamente",
      });
      setUploadState({
        phase: "success",
        fileName: file.name,
      });
      loadDocuments();
    } catch (error: any) {
      const message = error instanceof Error ? error.message : String(error);

      // Manejar error de rate limit específicamente
      if (error.type === 'RATE_LIMIT_EXCEEDED') {
        const minutes = Math.ceil((error.retryAfter || 3600) / 60);
        const hours = Math.floor(minutes / 60);
        const remainingMins = minutes % 60;

        const timeMessage = hours > 0
          ? `${hours} hora${hours > 1 ? 's' : ''}${remainingMins > 0 ? ` y ${remainingMins} minutos` : ''}`
          : `${minutes} minuto${minutes > 1 ? 's' : ''}`;

        toast({
          title: "⚠️ Límite de uploads alcanzado",
          description: `Has alcanzado el límite de uploads por hora. Podrás subir más PDFs en ${timeMessage}.`,
          variant: "destructive",
          duration: 10000,
        });

        // Actualizar rate limit info
        setRateLimitInfo({
          limit: error.limit ?? 0,
          remaining: typeof error.remaining === "number" ? error.remaining : 0,
          resetTime: new Date(Date.now() + (error.retryAfter || 3600) * 1000)
        });
      } else if (message.toLowerCase().includes("contenido duplicado")) {
        // Toast específico para duplicado
        toast({
          title: "Documento duplicado",
          description:
            "Este PDF está cargado, intenta agregando otro PDF diferente.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Error",
          description:
            error instanceof Error ? error.message : "No se pudo subir el PDF",
          variant: "destructive",
        });
      }

      setUploadState({
        phase: "error",
        fileName: file.name,
        message,
        failedPhase: uploadPhaseRef.current,
      });
    } finally {
      setIsUploading(false);
      uploadPhaseRef.current = "uploading";
      // 👈 Esto permite volver a seleccionar el MISMO archivo
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleDelete = async (filename: string) => {
    try {
      // Mantener simple: reutilizar el listado para bloquear acciones mientras se actualiza
      setIsLoadingList(true);
      await PDFService.deletePDF(filename);
      toast({
        title: "Éxito",
        description: "PDF eliminado correctamente",
      });
      loadDocuments();
    } catch (error) {
      toast({
        title: "Error",
        description:
          error instanceof Error ? error.message : "No se pudo eliminar el PDF",
        variant: "destructive",
      });
    } finally {
      setIsLoadingList(false);
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
      setPreviewUrl(url);
    } catch (error) {
      setPreviewError(
        error instanceof Error ? error.message : "No se pudo cargar el preview",
      );
    } finally {
      setPreviewLoading(false);
    }
  };

  // Limpiar URL de objeto al cerrar el modal para evitar fugas de memoria
  useEffect(() => {
    if (!isPreviewOpen && previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
      setPreviewFilename(null);
      setPreviewError(null);
    }
  }, [isPreviewOpen, previewUrl]);

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
        description:
          error instanceof Error
            ? error.message
            : "No se pudo descargar el PDF",
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
    // Convertir a UTC-5 (Perú). Perú no observa DST.
    const utcMs = d.getTime() + d.getTimezoneOffset() * 60000;
    const lima = new Date(utcMs - 5 * 60 * 60000);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${lima.getFullYear()}-${pad(lima.getMonth() + 1)}-${pad(lima.getDate())} ${pad(lima.getHours())}:${pad(lima.getMinutes())}:${pad(lima.getSeconds())}`;
  };

  // Memoize filtered documents to prevent recalculation on every render
  const filteredDocuments = useMemo(
    () => documents.filter((doc) =>
      doc.filename.toLowerCase().includes(searchTerm.toLowerCase()),
    ),
    [documents, searchTerm]
  );

  // Memoize total size calculation
  const totalSize = useMemo(
    () => documents.reduce((acc, doc) => acc + doc.size, 0),
    [documents]
  );

  const handleButtonClick = () => {
    fileInputRef.current?.click();
  };

  const handleDismissUploadState = useCallback(() => {
    setUploadState({ phase: "idle" });
  }, []);

  const handleOpenClear = () => {
    setClearResult(null);
    setClearError(null);
    setIsClearOpen(true);
  };

  const handleConfirmClear = async () => {
    setIsClearing(true);
    setClearError(null);
    try {
      const result = await ragService.clearRag();
      setClearResult(result);
      // Refrescar lista de documentos
      await loadDocuments();
      toast({ title: "Limpieza RAG", description: result.message });
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : "Error al limpiar el RAG";
      setClearError(msg);
      toast({ title: "Error", description: msg, variant: "destructive" });
    } finally {
      setIsClearing(false);
    }
  };

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Toaster de shadcn montado localmente para garantizar render de useToast */}
      <Toaster />
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-4xl font-bold text-foreground">
          Gestión de Documentos
        </h1>
        <p className="text-xl text-muted-foreground">
          Administra los PDFs que alimentan el conocimiento del bot
        </p>
      </div>

      {/* Banner de duplicado eliminado; se usa toast en su lugar */}

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
              disabled={
                isUploading ||
                isLoadingList ||
                rateLimitInfo?.remaining === 0
              }
            />
            <Button
              onClick={handleButtonClick}
              className="gradient-primary cursor-pointer hover:opacity-90"
              disabled={
                isUploading ||
                isLoadingList ||
                rateLimitInfo?.remaining === 0
              }
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

            <Button
              variant="outline"
              className="border-destructive text-destructive hover:bg-destructive/10"
              onClick={handleOpenClear}
              disabled={isUploading || isLoadingList}
              title="Limpiar RAG"
            >
              Limpiar RAG
            </Button>
          </div>
        </div>

        <UploadStatusPanel
          state={uploadState}
          onDismiss={handleDismissUploadState}
        />
      </div>

      {/* Estadísticas */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="border-border/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Documentos
            </CardTitle>
            <FileText className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">
              {isLoadingList ? (
                <Skeleton className="h-6 w-16" />
              ) : (
                documents.length
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              PDFs en el sistema
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Tamaño Total
            </CardTitle>
            <Upload className="h-4 w-4 text-accent" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">
              {isLoadingList ? (
                <Skeleton className="h-6 w-24" />
              ) : (
                formatFileSize(totalSize)
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Espacio utilizado
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tabla de documentos */}
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
                  <TableHead className="py-4">Fecha</TableHead>
                  <TableHead className="py-4">Tamaño</TableHead>
                  <TableHead className="text-right py-4">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoadingList && documents.length === 0
                  ? // Skeletons mientras carga por primera vez
                  Array.from({ length: 3 }).map((_, idx) => (
                    <TableRow key={`skeleton-${idx}`}>
                      <TableCell className="py-4">
                        <div className="flex items-center gap-2">
                          <Skeleton className="h-4 w-4 rounded" />
                          <Skeleton className="h-4 w-40" />
                        </div>
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-4 w-32" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-4 w-24" />
                      </TableCell>
                      <TableCell className="text-right">
                        <Skeleton className="h-8 w-20 ml-auto" />
                      </TableCell>
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
                      <TableCell>{formatDate(doc.last_modified)}</TableCell>
                      <TableCell>{formatFileSize(doc.size)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex gap-2 justify-end">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handlePreview(doc.filename)}
                            disabled={isLoadingList || isUploading}
                            title="Preview"
                            className="dark:bg-slate-700 dark:text-white dark:border-slate-600 dark:hover:bg-slate-600"
                          >
                            <Search className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDownload(doc.filename)}
                            disabled={
                              isLoadingList || isUploading || isDownloading
                            }
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
                            disabled={isLoadingList || isUploading}
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
      {/* Modal de Preview */}
      <PdfViewerModal
        isOpen={isPreviewOpen}
        onClose={setIsPreviewOpen}
        pdfUrl={previewUrl}
        initialPage={null}
      />

      {/* Modal Limpiar RAG */}
      <Dialog open={isClearOpen} onOpenChange={setIsClearOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Limpiar RAG</DialogTitle>
            <DialogDescription>
              Esta acción elimina todos los PDFs y limpia el almacén vectorial.
              ¿Deseas continuar?
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {clearError && (
              <div className="text-sm text-destructive">{clearError}</div>
            )}
            {clearResult ? (
              <div className="text-sm">
                <p className="font-medium">{clearResult.message}</p>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <div className="p-2 rounded border">
                    <span className="text-muted-foreground text-xs">
                      PDFs restantes
                    </span>
                    <div className="text-lg font-semibold">
                      {clearResult.remaining_pdfs}
                    </div>
                  </div>
                  <div className="p-2 rounded border">
                    <span className="text-muted-foreground text-xs">
                      Vector store
                    </span>
                    <div className="text-lg font-semibold">
                      {clearResult.count ?? clearResult.vector_store_size ?? 0}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => setIsClearOpen(false)}
                  disabled={isClearing}
                >
                  Cancelar
                </Button>
                <Button
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={handleConfirmClear}
                  disabled={isClearing}
                >
                  {isClearing ? "Limpiando..." : "Confirmar"}
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
