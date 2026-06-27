"use client";
import React, { useState, useCallback } from "react";
import { History, RotateCcw, ChevronDown, ChevronUp, Eye, X, AlertTriangle } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/app/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/app/components/ui/dialog";
import {
  getPersonalityHistory,
  restorePersonalityHistory,
  type PersonalityHistoryEntry,
} from "@/app/lib/services/botConfigService";

const MAX_HISTORY = 5;

interface Props {
  onRestored: () => void;
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("es-PE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function formatDateRelative(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Hace un momento";
  if (mins < 60) return `Hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `Hace ${hrs} h`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return "Ayer";
  if (days < 7) return `Hace ${days} días`;
  return formatDate(iso);
}

export function PersonalityHistoryPanel({ onRestored }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [entries, setEntries] = useState<PersonalityHistoryEntry[]>([]);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [previewEntry, setPreviewEntry] = useState<PersonalityHistoryEntry | null>(null);
  const [confirmEntry, setConfirmEntry] = useState<PersonalityHistoryEntry | null>(null);

  const loadHistory = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getPersonalityHistory();
      setEntries(data);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al cargar historial");
    } finally {
      setLoading(false);
    }
  }, []);

  const handleToggle = useCallback(async () => {
    const next = !open;
    setOpen(next);
    if (next && entries.length === 0) await loadHistory();
  }, [open, entries.length, loadHistory]);

  const handleRestoreConfirmed = useCallback(async () => {
    if (!confirmEntry) return;
    const entry = confirmEntry;
    setConfirmEntry(null);
    setRestoringId(entry.history_id);
    try {
      await restorePersonalityHistory(entry.history_id);
      toast.success("Versión restaurada correctamente");
      setEntries([]);
      onRestored();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al restaurar");
    } finally {
      setRestoringId(null);
    }
  }, [confirmEntry, onRestored]);

  const count = entries.length;

  return (
    <>
      <div
        className="glass rounded-xl border border-border/60 overflow-hidden"
        style={{ boxShadow: "var(--shadow-card)" }}
      >
        <button
          type="button"
          onClick={handleToggle}
          className="w-full flex items-center justify-between px-4 py-3 text-xs font-semibold text-foreground hover:bg-accent/50 transition-colors border-b border-border/60 bg-muted/10"
          aria-expanded={open}
          aria-controls="history-panel-content"
        >
          <span className="flex items-center gap-2">
            <History className="w-3.5 h-3.5 text-muted-foreground" aria-hidden="true" />
            Historial
          </span>
          <span className="flex items-center gap-2">
            {count > 0 && (
              <span className="font-mono text-[10px] text-muted-foreground bg-muted/60 px-1.5 py-0.5 rounded-full">
                {count}/{MAX_HISTORY}
              </span>
            )}
            {open
              ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" aria-hidden="true" />
              : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" aria-hidden="true" />
            }
          </span>
        </button>

        <div id="history-panel-content">
          {open && (
            loading ? (
              <div className="px-4 py-4 space-y-2">
                {[1, 2, 3].map(i => (
                  <div key={i} className="h-12 rounded-lg bg-muted/40 animate-pulse" />
                ))}
              </div>
            ) : entries.length === 0 ? (
              <p className="px-4 py-4 text-xs text-muted-foreground">
                Sin historial. Se crea automáticamente al guardar.
              </p>
            ) : (
              <ul role="list" className="divide-y divide-border/60">
                {entries.map((entry, idx) => {
                  const label = entry.personality_name?.trim() || `Versión ${entries.length - idx}`;
                  const preview = entry.ui_prompt_extra?.slice(0, 80);
                  const position = idx + 1;
                  return (
                    <li key={entry.history_id} className="flex flex-col px-4 py-3 gap-1.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-[10px] text-muted-foreground/60 w-4 flex-shrink-0">
                              {position}/{MAX_HISTORY}
                            </span>
                            <p className="text-xs font-semibold text-foreground truncate">
                              {label}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 mt-0.5 pl-5">
                            <span className="font-mono text-[10px] text-accent-violet/70">
                              {entry.temperature.toFixed(1)}°
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                              {formatDateRelative(entry.saved_at)}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-muted-foreground hover:text-foreground"
                            title="Ver prompt completo"
                            onClick={() => setPreviewEntry(entry)}
                          >
                            <Eye className="w-3 h-3" aria-hidden="true" />
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-6 text-[10px] px-2"
                            disabled={restoringId === entry.history_id}
                            onClick={() => setConfirmEntry(entry)}
                          >
                            <RotateCcw className="w-2.5 h-2.5 mr-1" aria-hidden="true" />
                            {restoringId === entry.history_id ? "…" : "Restaurar"}
                          </Button>
                        </div>
                      </div>
                      {preview && (
                        <p className="text-[11px] text-muted-foreground pl-5 line-clamp-2 leading-relaxed">
                          {preview}{(entry.ui_prompt_extra?.length ?? 0) > 80 ? "…" : ""}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            )
          )}
        </div>
      </div>

      {/* Full prompt preview sheet */}
      <Sheet open={!!previewEntry} onOpenChange={(v) => { if (!v) setPreviewEntry(null); }}>
        <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader className="mb-4">
            <SheetTitle className="font-heading text-base">
              {previewEntry?.personality_name?.trim() || `Versión ${entries.indexOf(previewEntry!) + 1}`}
            </SheetTitle>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="font-mono">temp {previewEntry?.temperature.toFixed(1)}</span>
              <span>{previewEntry ? formatDate(previewEntry.saved_at) : ""}</span>
            </div>
          </SheetHeader>
          <div className="space-y-3">
            <pre className="text-[12px] leading-relaxed font-mono whitespace-pre-wrap break-words p-4 bg-muted/40 rounded-lg border border-border min-h-[200px]">
              {previewEntry?.ui_prompt_extra || "(sin contenido)"}
            </pre>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setPreviewEntry(null)}>
                Cerrar
              </Button>
              <Button
                size="sm"
                variant="default"
                className="gradient-primary"
                onClick={() => {
                  setConfirmEntry(previewEntry);
                  setPreviewEntry(null);
                }}
              >
                <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                Restaurar esta versión
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Restore confirmation dialog */}
      <Dialog open={!!confirmEntry} onOpenChange={(v) => { if (!v) setConfirmEntry(null); }}>
        <DialogContent className="max-w-sm glass border-amber-500/30">
          <DialogHeader>
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className="w-4 h-4 text-amber-500" aria-hidden="true" />
              <DialogTitle className="font-heading">¿Restaurar esta versión?</DialogTitle>
            </div>
            <DialogDescription className="text-sm">
              Se reemplazará la personalidad actual con{" "}
              <strong>{confirmEntry?.personality_name?.trim() || "esta versión"}</strong>.
              Los cambios no guardados se perderán.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="outline" size="sm" onClick={() => setConfirmEntry(null)}>
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={handleRestoreConfirmed}
              disabled={!!restoringId}
              className="gradient-primary"
            >
              <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
              {restoringId ? "Restaurando…" : "Sí, restaurar"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
