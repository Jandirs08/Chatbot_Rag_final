import { useState, useEffect, useRef } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { FileText, Upload, Trash2, Search, Download } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/app/components/ui/table";
import { useToast } from "@/app/hooks/use-toast";
import { PDFService } from "@/app/lib/services/pdfService";
import { Progress } from "@/app/components/ui/progress";
import { Skeleton } from "@/app/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/app/components/ui/dialog";

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
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewFilename, setPreviewFilename] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const loadDocuments = async () => {
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
  };

  useEffect(() => {
    loadDocuments();
  }, []);

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setIsUploading(true);
      setUploadProgress(0);
      await PDFService.uploadPDF(file, (p) => setUploadProgress(p));
      toast({
        title: "Éxito",
        description: "PDF subido correctamente",
      });
      loadDocuments();
    } catch (error) {
      toast({
        title: "Error",
        description:
          error instanceof Error
            ? error.message
            : "No se pudo subir el PDF",
        variant: "destructive",
      });
    } finally {
      // Pequeña pausa para que el 100% sea visible antes de resetear
      await new Promise((r) => setTimeout(r, 300));
      setIsUploading(false);
      setUploadProgress(0);
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
          error instanceof Error
            ? error.message
            : "No se pudo eliminar el PDF",
        variant: "destructive",
      });
    } finally {
      setIsLoadingList(false);
    }
  };

  const handlePreview = (filename: string) => {
    setPreviewFilename(filename);
    setIsPreviewOpen(true);
  };

  const handleDownload = (filename: string) => {
    const url = PDFService.getPDFDownloadUrl(filename);
    window.open(url, "_blank");
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("es-ES", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const filteredDocuments = documents.filter((doc) =>
    doc.filename.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const handleButtonClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-4xl font-bold text-foreground">
          Gestión de Documentos
        </h1>
        <p className="text-xl text-muted-foreground">
          Administra los PDFs que alimentan el conocimiento del bot
        </p>
      </div>

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
        <div className="relative">
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf"
            onChange={handleUpload}
            className="hidden"
            disabled={isUploading || isLoadingList}
          />
          <Button
            onClick={handleButtonClick}
            className="gradient-primary hover:opacity-90 cursor-pointer"
            disabled={isUploading || isLoadingList}
          >
            <Upload className="w-4 h-4 mr-2" />
            {isUploading ? "Subiendo..." : "Subir PDF"}
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
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead>Tamaño</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoadingList && documents.length === 0 ? (
                // Skeletons mientras carga por primera vez
                Array.from({ length: 3 }).map((_, idx) => (
                  <TableRow key={`skeleton-${idx}`}>
                    <TableCell>
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
              ) : (
                filteredDocuments.map((doc) => (
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
                        >
                          <Search className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDownload(doc.filename)}
                          disabled={isLoadingList || isUploading}
                          title="Download"
                        >
                          <Download className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDelete(doc.filename)}
                          className="text-destructive hover:text-destructive"
                          disabled={isLoadingList || isUploading}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      {/* Modal de Preview */}
      <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
        <DialogContent className="w-[95vw] max-w-5xl h-[85vh] p-0">
          <DialogHeader className="px-6 pt-6">
            <DialogTitle className="text-lg">Preview: {previewFilename}</DialogTitle>
          </DialogHeader>
          <div className="px-6 pb-6 h-[calc(85vh-4rem)]">
            {previewFilename ? (
              <iframe
                src={PDFService.getPDFViewUrl(previewFilename)}
                className="w-full h-full border rounded-md"
              />
            ) : (
              <div className="flex items-center justify-center h-full">
                <Skeleton className="w-48 h-6" />
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
