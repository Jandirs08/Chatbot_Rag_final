"use client";

import { useState } from "react";
import { Button } from "@/app/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/app/components/ui/dialog";
import { ragService } from "@/app/lib/services/ragService";
import { useToast } from "@/app/hooks/use-toast";

interface ClearRAGDialogProps {
  onClearSuccess: () => Promise<void>;
  disabled?: boolean;
}

export function ClearRAGDialog({ onClearSuccess, disabled }: ClearRAGDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [clearResult, setClearResult] = useState<{
    status: string;
    message: string;
    remaining_pdfs: number;
    count?: number;
    vector_store_size?: number;
  } | null>(null);
  const [clearError, setClearError] = useState<string | null>(null);
  const { toast } = useToast();

  const handleOpen = () => {
    setClearResult(null);
    setClearError(null);
    setIsOpen(true);
  };

  const handleConfirm = async () => {
    setIsClearing(true);
    setClearError(null);
    try {
      const result = await ragService.clearRag();
      setClearResult(result);
      await onClearSuccess();
      toast({ title: "Limpieza RAG", description: result.message });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Error al limpiar el RAG";
      setClearError(msg);
      toast({ title: "Error", description: msg, variant: "destructive" });
    } finally {
      setIsClearing(false);
    }
  };

  return (
    <>
      <Button
        variant="outline"
        className="border-destructive text-destructive hover:bg-destructive/10"
        onClick={handleOpen}
        disabled={disabled}
        title="Limpiar RAG"
      >
        Limpiar RAG
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
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
                    <span className="text-muted-foreground text-xs">PDFs restantes</span>
                    <div className="text-lg font-semibold">{clearResult.remaining_pdfs}</div>
                  </div>
                  <div className="p-2 rounded border">
                    <span className="text-muted-foreground text-xs">Vector store</span>
                    <div className="text-lg font-semibold">
                      {clearResult.count ?? clearResult.vector_store_size ?? 0}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setIsOpen(false)} disabled={isClearing}>
                  Cancelar
                </Button>
                <Button
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={handleConfirm}
                  disabled={isClearing}
                >
                  {isClearing ? "Limpiando..." : "Confirmar"}
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
