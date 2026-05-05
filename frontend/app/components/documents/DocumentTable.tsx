"use client";

import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import { Skeleton } from "@/app/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/app/components/ui/table";
import type { PDFDocument } from "@/app/hooks/useDocumentManagement";
import { Download, FileText, Search, Trash2 } from "lucide-react";

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

interface DocumentTableProps {
  documents: PDFDocument[];
  filteredDocuments: PDFDocument[];
  isLoadingList: boolean;
  isUploading: boolean;
  isDownloading: boolean;
  canManageDocuments: boolean;
  formatDate: (dateString: string | null | undefined) => string;
  formatFileSize: (bytes: number) => string;
  onPreview: (filename: string) => void;
  onDownload: (filename: string) => void;
  onDelete: (filename: string) => void;
}

export function DocumentTable({
  documents,
  filteredDocuments,
  isLoadingList,
  isUploading,
  isDownloading,
  canManageDocuments,
  formatDate,
  formatFileSize,
  onPreview,
  onDownload,
  onDelete,
}: DocumentTableProps) {
  return (
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
                      <TableCell>
                        <Skeleton className="h-4 w-24" />
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
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <Badge
                            variant={
                              ingestionStatusVariants[doc.ingestion_status] ??
                              "secondary"
                            }
                          >
                            {ingestionStatusLabels[doc.ingestion_status] ??
                              doc.ingestion_status}
                          </Badge>
                          {doc.ingestion_error && (
                            <span className="max-w-[240px] truncate text-xs text-error">
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
                            onClick={() => onPreview(doc.filename)}
                            disabled={
                              isLoadingList ||
                              isUploading ||
                              doc.ingestion_status !== "ready"
                            }
                            title="Preview"
                            className="dark:bg-card dark:border-border dark:hover:bg-muted"
                          >
                            <Search className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => onDownload(doc.filename)}
                            disabled={
                              isLoadingList ||
                              isUploading ||
                              isDownloading ||
                              doc.ingestion_status !== "ready"
                            }
                            title="Download"
                            className="dark:bg-card dark:border-border dark:hover:bg-muted"
                          >
                            <Download className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => onDelete(doc.filename)}
                            className="text-muted-foreground hover:text-error hover:bg-error/10"
                            disabled={
                              !canManageDocuments ||
                              isLoadingList ||
                              isUploading ||
                              doc.ingestion_status === "processing"
                            }
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
  );
}
