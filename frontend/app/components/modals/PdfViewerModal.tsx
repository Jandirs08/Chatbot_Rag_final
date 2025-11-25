"use client";

import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/app/components/ui/dialog";
import { Skeleton } from "@/app/components/ui/skeleton";

type Props = {
  isOpen: boolean;
  onClose: (open: boolean) => void;
  pdfUrl?: string | null;
  initialPage?: number | null;
};

export default function PdfViewerModal({ isOpen, onClose, pdfUrl, initialPage }: Props) {
  const src = React.useMemo(() => {
    if (!pdfUrl) return null;
    const page = typeof initialPage === "number" && initialPage > 0 ? `#page=${initialPage}` : "";
    return `${pdfUrl}${page}`;
  }, [pdfUrl, initialPage]);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="w-[95vw] max-w-5xl h-[85vh] p-0">
        <DialogHeader className="px-6 pt-6">
          <DialogTitle className="text-lg">Ver PDF</DialogTitle>
          <DialogDescription>Vista del documento fuente.</DialogDescription>
        </DialogHeader>
        <div className="px-6 pb-6 h-[calc(85vh-4rem)]">
          {src ? (
            <iframe src={src} className="w-full h-full border rounded-md" />
          ) : (
            <div className="flex items-center justify-center h-full">
              <Skeleton className="w-48 h-6" />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}