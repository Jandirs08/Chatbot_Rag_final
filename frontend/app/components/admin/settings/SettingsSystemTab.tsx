import React, { useState, useRef, useEffect } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import { Button } from "@/app/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/app/components/ui/dialog";
import { Input } from "@/app/components/ui/input";
import { Progress } from "@/app/components/ui/progress";
import { Alert, AlertDescription } from "@/app/components/ui/alert";
import { AlertTriangle, Trash, CheckCircle2 } from "lucide-react";
import { API_URL } from "@/app/lib/config";
import { authenticatedFetch } from "@/app/lib/services/authService";

interface SettingsSystemTabProps {
  isLoading: boolean;
}

export function SettingsSystemTab({ isLoading }: SettingsSystemTabProps) {
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [progress, setProgress] = useState(0);
  const [processing, setProcessing] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!open) {
      setConfirmText("");
      setProgress(0);
      setProcessing(false);
      setSuccess(false);
      setError(null);
      if (timerRef.current) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  }, [open]);

  return (
    <div className="p-4 md:p-6 h-full overflow-y-auto">
      <Card className="border border-border/50 bg-white">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-gray-900">
            <AlertTriangle className="w-5 h-5" /> Precaución
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-700">
              Eliminar Historial de Conversaciones
            </div>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button
                  variant="destructive"
                  className="gap-2"
                  disabled={isLoading}
                >
                  <Trash className="w-4 h-4" /> Eliminar todo
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Confirmar eliminación</DialogTitle>
                  {!processing && !success && !error && (
                    <DialogDescription>
                      <span>
                        Esta acción eliminará permanentemente todos los mensajes y
                        conversaciones. Esta acción no se puede deshacer.
                      </span>
                    </DialogDescription>
                  )}
                </DialogHeader>
                {(processing || success || error) && (
                  <div className="space-y-3">
                    <Progress value={progress} />
                    {success && (
                      <div className="flex items-center gap-2 text-green-700 text-sm">
                        <CheckCircle2 className="w-5 h-5" /> Base de datos limpia
                      </div>
                    )}
                    {error && (
                      <Alert variant="destructive">
                        <AlertDescription className="flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4" /> {error}
                        </AlertDescription>
                      </Alert>
                    )}
                  </div>
                )}
                {!processing && !success && (
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <label
                        className="text-sm font-medium"
                        htmlFor="confirm"
                      >
                        Escribe ELIMINAR para continuar
                      </label>
                      <Input
                        id="confirm"
                        value={confirmText}
                        onChange={(e) => setConfirmText(e.target.value)}
                        placeholder="ELIMINAR"
                      />
                    </div>
                    <DialogFooter>
                      <Button
                        variant="destructive"
                        className="w-full"
                        disabled={
                          confirmText.trim().toUpperCase() !== "ELIMINAR" ||
                          isLoading
                        }
                        onClick={async () => {
                          try {
                            setProcessing(true);
                            setError(null);
                            setSuccess(false);
                            if (timerRef.current)
                              window.clearInterval(timerRef.current);
                            setProgress(5);
                            timerRef.current = window.setInterval(() => {
                              setProgress((p) => (p + 3 >= 90 ? 90 : p + 3));
                            }, 250);
                            const res = await authenticatedFetch(
                              `${API_URL}/chat/history`,
                              { method: "DELETE" }
                            );
                            const body = await res.json().catch(() => ({}));
                            if (!res.ok) {
                              if (timerRef.current) {
                                window.clearInterval(timerRef.current);
                                timerRef.current = null;
                              }
                              setProgress(100);
                              setProcessing(false);
                              setError(
                                String(
                                  body?.detail ||
                                  body?.message ||
                                  `Error ${res.status}`
                                )
                              );
                              return;
                            }
                            if (timerRef.current) {
                              window.clearInterval(timerRef.current);
                              timerRef.current = null;
                            }
                            setProgress(100);
                            setSuccess(true);
                            setProcessing(false);
                          } catch (e: any) {
                            if (timerRef.current) {
                              window.clearInterval(timerRef.current);
                              timerRef.current = null;
                            }
                            setProgress(100);
                            setProcessing(false);
                            setError(
                              String(e?.message || "Error inesperado al eliminar")
                            );
                          }
                        }}
                      >
                        Eliminar definitivamente
                      </Button>
                    </DialogFooter>
                  </div>
                )}
              </DialogContent>
            </Dialog>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
