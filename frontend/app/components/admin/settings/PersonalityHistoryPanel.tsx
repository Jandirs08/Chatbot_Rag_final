"use client";
import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  History,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  Eye,
  AlertTriangle,
  Loader2,
  Trash2,
} from "lucide-react";
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
  deletePersonalityHistory,
  type PersonalityHistoryEntry,
  type BotConfigDTO,
} from "@/app/lib/services/botConfigService";

const MAX_HISTORY = 5;

interface Props {
  onRestored: (config: BotConfigDTO, personalityName: string) => void;
  currentUiExtra?: string;
  currentTemperature?: number;
  refreshKey?: number;
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
  if (mins < 1) return "Ahora";
  if (mins < 60) return `${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} h`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return "Ayer";
  if (days < 7) return `${days} días`;
  return formatDate(iso);
}

export function PersonalityHistoryPanel({
  onRestored,
  currentUiExtra = "",
  currentTemperature,
  refreshKey,
}: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [entries, setEntries] = useState<PersonalityHistoryEntry[]>([]);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [previewEntry, setPreviewEntry] =
    useState<PersonalityHistoryEntry | null>(null);
  const [confirmEntry, setConfirmEntry] =
    useState<PersonalityHistoryEntry | null>(null);
  const [deleteConfirmEntry, setDeleteConfirmEntry] =
    useState<PersonalityHistoryEntry | null>(null);
  const prevRefreshKey = useRef(refreshKey);

  const loadHistory = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getPersonalityHistory();
      setEntries(data);
    } catch (err: unknown) {
      toast.error(
        err instanceof Error ? err.message : "Error al cargar historial",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  // Reload when parent signals a save happened
  useEffect(() => {
    if (refreshKey !== prevRefreshKey.current) {
      prevRefreshKey.current = refreshKey;
      if (open) loadHistory();
    }
  }, [refreshKey, open, loadHistory]);

  const handleToggle = useCallback(async () => {
    const next = !open;
    setOpen(next);
    if (next) await loadHistory();
  }, [open, loadHistory]);

  const handleRestoreConfirmed = useCallback(async () => {
    if (!confirmEntry) return;
    const entry = confirmEntry;
    setConfirmEntry(null);
    setRestoringId(entry.history_id);
    try {
      const restoredConfig = await restorePersonalityHistory(entry.history_id);
      toast.success("Versión restaurada correctamente");
      onRestored(restoredConfig, entry.personality_name?.trim() ?? "");
      await loadHistory();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al restaurar");
    } finally {
      setRestoringId(null);
    }
  }, [confirmEntry, onRestored, loadHistory]);

  const handleDeleteConfirmed = useCallback(async () => {
    if (!deleteConfirmEntry) return;
    const entry = deleteConfirmEntry;
    setDeleteConfirmEntry(null);
    setDeletingId(entry.history_id);
    try {
      await deletePersonalityHistory(entry.history_id);
      setEntries((prev) =>
        prev.filter((e) => e.history_id !== entry.history_id),
      );
      toast.success("Versión eliminada");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al eliminar");
    } finally {
      setDeletingId(null);
    }
  }, [deleteConfirmEntry]);

  const normalizePrompt = (s: string) =>
    s.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();

  const isActiveEntry = (entry: PersonalityHistoryEntry) => {
    const textMatch =
      normalizePrompt(entry.ui_prompt_extra ?? "") ===
      normalizePrompt(currentUiExtra);
    const tempMatch =
      currentTemperature === undefined ||
      Math.abs(entry.temperature - currentTemperature) < 0.05;
    return textMatch && tempMatch;
  };

  const count = entries.length;
  const isBusy = !!restoringId || !!deletingId;

  return (
    <>
      <div
        className="glass rounded-xl border border-border/60 overflow-hidden"
        style={{ boxShadow: "var(--shadow-card)" }}
      >
        <button
          type="button"
          onClick={handleToggle}
          className="w-full flex items-center justify-between px-4 py-3 text-xs font-semibold text-foreground hover:bg-accent/40 transition-colors border-b border-border/60 bg-muted/20"
          aria-expanded={open}
          aria-controls="history-panel-content"
        >
          <span className="flex items-center gap-2">
            <History
              className="w-3.5 h-3.5 text-accent-violet/70"
              aria-hidden="true"
            />
            Historial de versiones
          </span>
          <span className="flex items-center gap-2">
            {count > 0 && (
              <span
                className={`font-mono text-[10px] px-1.5 py-0.5 rounded-full border ${
                  count >= MAX_HISTORY
                    ? "bg-accent-violet/15 text-accent-violet border-accent-violet/30"
                    : "bg-muted/70 text-muted-foreground border-transparent"
                }`}
              >
                {count}/{MAX_HISTORY}
              </span>
            )}
            {open ? (
              <ChevronUp
                className="w-3.5 h-3.5 text-muted-foreground"
                aria-hidden="true"
              />
            ) : (
              <ChevronDown
                className="w-3.5 h-3.5 text-muted-foreground"
                aria-hidden="true"
              />
            )}
          </span>
        </button>

        <div id="history-panel-content">
          {open &&
            (loading ? (
              <div className="px-4 py-4 space-y-2">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="h-14 rounded-lg bg-muted/40 animate-pulse"
                  />
                ))}
              </div>
            ) : entries.length === 0 ? (
              <div className="px-4 py-6 text-center flex flex-col items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-muted/60 flex items-center justify-center">
                  <History
                    className="w-4 h-4 text-muted-foreground/40"
                    aria-hidden="true"
                  />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium">
                    Sin versiones guardadas
                  </p>
                  <p className="text-[11px] text-muted-foreground/55 mt-0.5">
                    Se guardan al confirmar cambios.
                  </p>
                </div>
              </div>
            ) : (
              <ul role="list" className="divide-y divide-border/60">
                {entries.map((entry, idx) => {
                  const label =
                    entry.personality_name?.trim() ||
                    `Versión ${entries.length - idx}`;
                  const preview = entry.ui_prompt_extra?.slice(0, 90);
                  const position = idx + 1;
                  const isRestoring = restoringId === entry.history_id;
                  const isDeleting = deletingId === entry.history_id;
                  const active = isActiveEntry(entry);
                  return (
                    <li
                      key={entry.history_id}
                      className={`flex flex-col px-3 py-2.5 gap-1.5 transition-all ${
                        isDeleting ? "opacity-40" : ""
                      } ${
                        active
                          ? "bg-emerald-500/8 border-l-[3px] border-l-emerald-500/60"
                          : "hover:bg-accent/20 border-l-[3px] border-l-transparent"
                      }`}
                    >
                      {/* Row 1: position circle · name · [Activo] | actions */}
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-4 h-4 flex-shrink-0 flex items-center justify-center rounded-full bg-muted border border-border/60 font-mono text-[9px] text-muted-foreground/70 tabular-nums">
                          {position}
                        </span>
                        <p
                          className={`text-sm font-bold truncate flex-1 min-w-0 ${active ? "text-emerald-700 dark:text-emerald-300" : "text-foreground"}`}
                        >
                          {label}
                        </p>
                        {active && (
                          <span className="flex-shrink-0 text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/35">
                            Activo
                          </span>
                        )}
                        {/* Actions inline with title row */}
                        <div className="flex items-center gap-0.5 flex-shrink-0 ml-auto">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-muted-foreground/50 hover:text-foreground hover:bg-accent/60 transition-colors"
                            title="Ver instrucciones completas"
                            onClick={() => setPreviewEntry(entry)}
                            disabled={isBusy}
                          >
                            <Eye className="w-3 h-3" aria-hidden="true" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-muted-foreground/50 hover:text-destructive hover:bg-destructive/8 transition-colors"
                            title="Eliminar versión"
                            disabled={isBusy || active}
                            onClick={() => setDeleteConfirmEntry(entry)}
                          >
                            {isDeleting ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <Trash2 className="w-3 h-3" aria-hidden="true" />
                            )}
                          </Button>
                          <Button
                            type="button"
                            variant={active ? "ghost" : "outline"}
                            size="sm"
                            className={`h-6 text-[10px] px-2 transition-colors ${active ? "text-muted-foreground/40 cursor-default" : "hover:border-accent-violet/40 hover:text-accent-violet"}`}
                            disabled={isBusy || active}
                            onClick={() => !active && setConfirmEntry(entry)}
                            title={
                              active
                                ? "Ya es la versión activa"
                                : "Restaurar esta versión"
                            }
                          >
                            {isRestoring ? (
                              <Loader2 className="w-2.5 h-2.5 mr-1 animate-spin" />
                            ) : (
                              <RotateCcw
                                className="w-2.5 h-2.5 mr-1"
                                aria-hidden="true"
                              />
                            )}
                            {isRestoring
                              ? "Restaurando…"
                              : active
                                ? "En uso"
                                : "Restaurar"}
                          </Button>
                        </div>
                      </div>

                      {/* Row 2: temp · separator · time */}
                      <div className="flex items-center gap-1.5 pl-6">
                        <span className="inline-flex items-center font-mono text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-accent-violet/10 text-accent-violet border border-accent-violet/20 flex-shrink-0">
                          {entry.temperature.toFixed(1)}°
                        </span>
                        <span className="text-muted-foreground/30 text-[10px]">
                          ·
                        </span>
                        <span className="text-[10px] text-muted-foreground/70 whitespace-nowrap flex-shrink-0">
                          {formatDateRelative(entry.saved_at)}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ))}
        </div>
      </div>

      {/* Full instructions preview sheet */}
      <Sheet
        open={!!previewEntry}
        onOpenChange={(v) => {
          if (!v) setPreviewEntry(null);
        }}
      >
        <SheetContent
          side="right"
          className="w-full sm:max-w-lg overflow-y-auto"
        >
          <SheetHeader className="mb-4">
            <SheetTitle className="font-heading text-base">
              {previewEntry?.personality_name?.trim() ||
                `Versión ${entries.indexOf(previewEntry!) + 1}`}
            </SheetTitle>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="inline-flex items-center font-mono text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-accent-violet/10 text-accent-violet border border-accent-violet/15">
                {previewEntry?.temperature.toFixed(1)}°
              </span>
              <span>
                {previewEntry ? formatDate(previewEntry.saved_at) : ""}
              </span>
            </div>
          </SheetHeader>
          <div className="space-y-3">
            <pre className="text-[12px] leading-relaxed font-mono whitespace-pre-wrap break-words p-4 bg-muted/40 rounded-lg border border-border min-h-[200px]">
              {previewEntry?.ui_prompt_extra || "(sin contenido)"}
            </pre>
            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPreviewEntry(null)}
              >
                Cerrar
              </Button>
              <Button
                size="sm"
                variant="default"
                className="gradient-primary"
                disabled={!!previewEntry && isActiveEntry(previewEntry)}
                onClick={() => {
                  setConfirmEntry(previewEntry);
                  setPreviewEntry(null);
                }}
              >
                <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                {previewEntry && isActiveEntry(previewEntry)
                  ? "Versión activa"
                  : "Restaurar esta versión"}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Restore confirmation dialog */}
      <Dialog
        open={!!confirmEntry}
        onOpenChange={(v) => {
          if (!v && !restoringId) setConfirmEntry(null);
        }}
      >
        <DialogContent className="max-w-sm glass border-amber-500/30">
          <DialogHeader>
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle
                className="w-4 h-4 text-amber-500"
                aria-hidden="true"
              />
              <DialogTitle className="font-heading">
                ¿Restaurar esta versión?
              </DialogTitle>
            </div>
            <DialogDescription className="text-sm">
              Las instrucciones actuales serán reemplazadas por{" "}
              <strong>
                {confirmEntry?.personality_name?.trim() || "esta versión"}
              </strong>
              . Los cambios no guardados se perderán.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 justify-end pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirmEntry(null)}
              disabled={!!restoringId}
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={handleRestoreConfirmed}
              disabled={!!restoringId}
              className="gradient-primary"
            >
              {restoringId ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  Restaurando…
                </>
              ) : (
                <>
                  <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                  Sí, restaurar
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <Dialog
        open={!!deleteConfirmEntry}
        onOpenChange={(v) => {
          if (!v && !deletingId) setDeleteConfirmEntry(null);
        }}
      >
        <DialogContent className="max-w-sm glass border-destructive/30">
          <DialogHeader>
            <div className="flex items-center gap-2 mb-1">
              <Trash2 className="w-4 h-4 text-destructive" aria-hidden="true" />
              <DialogTitle className="font-heading">
                ¿Eliminar esta versión?
              </DialogTitle>
            </div>
            <DialogDescription className="text-sm">
              Se eliminará permanentemente{" "}
              <strong>
                {deleteConfirmEntry?.personality_name?.trim() || "esta versión"}
              </strong>
              . Esta acción no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 justify-end pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDeleteConfirmEntry(null)}
              disabled={!!deletingId}
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={handleDeleteConfirmed}
              disabled={!!deletingId}
            >
              {deletingId ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  Eliminando…
                </>
              ) : (
                <>
                  <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                  Sí, eliminar
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
