"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import { Skeleton } from "@/app/components/ui/skeleton";
import { FileText, Upload } from "lucide-react";

interface DocumentStatsCardsProps {
  documentCount: number;
  totalSize: number;
  isLoading: boolean;
  formatFileSize: (bytes: number) => string;
}

export function DocumentStatsCards({
  documentCount,
  totalSize,
  isLoading,
  formatFileSize,
}: DocumentStatsCardsProps) {
  return (
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
            {isLoading ? (
              <Skeleton className="h-6 w-16" />
            ) : (
              documentCount
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
            {isLoading ? (
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
  );
}
