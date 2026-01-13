import { useState, useEffect, useRef, useCallback } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { FileText, Upload, Trash2, Search, Download, Clock } from "lucide-react";
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
import { PDFService } from "@/app/lib/services/pdfService";
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

interface PDFDocument {
  filename: string;
  path: string;
  size: number;
  last_modified: string;
}

export function DocumentManagement() {
  const [documents, setDocuments] = useState<PDFDocument[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isLoadingList, setIsLoadingList] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewFilename, setPreviewFilename] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
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

  // Cargar rate limit info de localStorage al montar
  useEffect(() => {
    const saved = localStorage.getItem("pdf_upload_ratelimit");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.resetTime) {
          const resetDate = new Date(parsed.resetTime);
          // Solo cargar si no ha expirado
          if (resetDate.getTime() > new Date().getTime()) {
            setRateLimitInfo({
              ...parsed,
              resetTime: resetDate
            });
          } else {
            localStorage.removeItem("pdf_upload_ratelimit");
          }
        }
      } catch (e) {
        console.error("Error parsing saved rate limit:", e);
      }
    }
  }, []);

  // Guardar rate limit info en localStorage cuando cambie
  useEffect(() => {
    if (rateLimitInfo) {
      localStorage.setItem("pdf_upload_ratelimit", JSON.stringify(rateLimitInfo));
    }
  }, [rateLimitInfo]);

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
          localStorage.removeItem("pdf_upload_ratelimit");
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

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setIsUploading(true);
      setUploadProgress(0);
      const response = await PDFService.uploadPDF(file, (p) => setUploadProgress(p));

      // Actualizar rate limit info desde headers
      if (response.rateLimit) {
        setRateLimitInfo({
          limit: response.rateLimit.limit,
          remaining: response.rateLimit.remaining,
          resetTime: response.rateLimit.retryAfter
            ? new Date(Date.now() + response.rateLimit.retryAfter * 1000)
            : undefined
        });
      }

      toast({
        title: "Éxito",
        description: "PDF subido correctamente",
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
          limit: 5,
          remaining: 0,
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
    } finally {
      // Pequeña pausa para que el 100% sea visible antes de resetear
      await new Promise((r) => setTimeout(r, 300));
      setIsUploading(false);
      setUploadProgress(0);
      // 👈 Esto permite volver a seleccionar el MISMO archivo
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleView = (filename: string) => {
    const url = PDFService.getPDFViewUrl(filename);
    window.open(url, "_blank");
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

  const filteredDocuments = documents.filter((doc) =>
    doc.filename.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const handleButtonClick = () => {
    fileInputRef.current?.click();
  };

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

      {/* Controles superiores */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar documentos..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="relative flex gap-2 items-center">
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf"
            onChange={handleUpload}
            className="hidden"
            disabled={isUploading || isLoadingList || (rateLimitInfo?.remaining === 0)}
          />
          <Button
            onClick={handleButtonClick}
            className="gradient-primary hover:opacity-90 cursor-pointer"
            disabled={isUploading || isLoadingList || (rateLimitInfo?.remaining === 0)}
          >
            <Upload className="w-4 h-4 mr-2" />
            {isUploading ? "Subiendo..." : "Subir PDF"}
          </Button>

          {/* Indicador de Rate Limit - Solo cuando se agota la cuota */}
          {rateLimitInfo && rateLimitInfo.remaining === 0 && countdown !== null && countdown > 0 && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-xs font-medium">
              <Clock className="w-3 h-3" />
              <span>Disponible en {formatCountdown(countdown)}</span>
            </div>
          )}

          <Button
            variant="outline"
            className="text-destructive border-destructive hover:bg-destructive/10"
            onClick={handleOpenClear}
            disabled={isUploading || isLoadingList}
            title="Limpiar RAG"
          >
            Limpiar RAG
          </Button>
          {isUploading && (
            <div className="mt-2 w-64">
              <Progress value={uploadProgress} />
              <p className="text-xs text-muted-foreground mt-1">
                {uploadProgress}%
              </p>
            </div>
          )}
        </div>
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
                formatFileSize(
                  documents.reduce((acc, doc) => acc + doc.size, 0),
                )
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
          <CardDescription>
            Lista de todos los PDFs procesados por el sistema RAG
          </CardDescription>
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
