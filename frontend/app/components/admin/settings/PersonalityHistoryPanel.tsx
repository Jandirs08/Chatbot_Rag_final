"use client";
import React, { useState, useCallback } from "react";
import { History, RotateCcw, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { toast } from "sonner";
import {
  getPersonalityHistory,
  restorePersonalityHistory,
  type PersonalityHistoryEntry,
} from "@/app/lib/services/botConfigService";

interface Props {
  onRestored: () => void;
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("es-PE", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  }).format(new Date(iso));
}

export function PersonalityHistoryPanel({ onRestored }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [entries, setEntries] = useState<PersonalityHistoryEntry[]>([]);
  const [restoringId, setRestoringId] = useState<string | null>(null);

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

  const handleRestore = useCallback(async (historyId: string) => {
    setRestoringId(historyId);
    try {
      await restorePersonalityHistory(historyId);
      toast.success("Versión restaurada correctamente");
      onRestored();
      setOpen(false);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al restaurar");
    } finally {
      setRestoringId(null);
    }
  }, [onRestored]);

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={handleToggle}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-foreground hover:bg-accent/50 transition-colors"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2">
          <History className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
          Historial de versiones
        </span>
        {open ? (
          <ChevronUp className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
        ) : (
          <ChevronDown className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
        )}
      </button>

      {open && (
        <div className="border-t border-border">
          {loading ? (
            <p className="px-4 py-3 text-xs text-muted-foreground">Cargando historial…</p>
          ) : entries.length === 0 ? (
            <p className="px-4 py-3 text-xs text-muted-foreground">
              No hay versiones guardadas aún. Las versiones se crean automáticamente al guardar la personalidad.
            </p>
          ) : (
            <ul role="list" className="divide-y divide-border">
              {entries.map((entry, idx) => (
                <li key={entry.history_id} className="flex items-center justify-between px-4 py-2.5 gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-foreground truncate">
                      Versión {entries.length - idx}
                      <span className="ml-2 text-[10px] font-mono text-muted-foreground">
                        temp {entry.temperature.toFixed(1)}
                      </span>
                    </p>
                    <p className="text-[11px] text-muted-foreground">{formatDate(entry.saved_at)}</p>
                    {entry.ui_prompt_extra && (
                      <p className="text-[11px] text-muted-foreground truncate max-w-xs">
                        {entry.ui_prompt_extra.slice(0, 60)}…
                      </p>
                    )}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-[11px] shrink-0"
                    disabled={restoringId === entry.history_id}
                    onClick={() => handleRestore(entry.history_id)}
                  >
                    <RotateCcw className="w-3 h-3 mr-1" aria-hidden="true" />
                    {restoringId === entry.history_id ? "Restaurando…" : "Restaurar"}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
