import React, { useState, useCallback, useMemo } from "react";
import { diff_match_patch } from "diff-match-patch";
import { Button } from "@/app/components/ui/button";
import {
  Save,
  RotateCcw,
  AlertCircle,
  GitCompareArrows,
  Download,
  Upload,
  Pencil,
  Lock,
} from "lucide-react";
import { PromptBuilderAssistant } from "@/app/components/PromptBuilderAssistant";
import { toast } from "sonner";

export interface BotConfigurationProps {
  prompt: string;
  baselinePrompt?: string;
  onPromptChange: (value: string) => void;
  onSave: () => void;
  onReset: () => void;
  onDiscardChanges?: () => void;
  isLoading?: boolean;
  error?: string;
  canSave?: boolean;
  canReset?: boolean;
  locked?: boolean;
  onUnlock?: () => void;
}

function PromptDiff({
  baseline,
  current,
}: {
  baseline: string;
  current: string;
}) {
  const diffs = useMemo(() => {
    const dmp = new diff_match_patch();
    const d = dmp.diff_main(baseline, current);
    dmp.diff_cleanupSemantic(d);
    return d;
  }, [baseline, current]);
  return (
    <pre className="text-[12px] leading-relaxed font-mono whitespace-pre-wrap break-words p-4 bg-background/60 rounded-lg border border-border max-h-64 overflow-y-auto">
      {diffs.map(([op, text], i) => {
        if (op === 0) return <span key={i}>{text}</span>;
        if (op === 1)
          return (
            <mark
              key={i}
              className="bg-green-500/20 text-green-700 dark:text-green-400 rounded-sm"
            >
              {text}
            </mark>
          );
        return (
          <del
            key={i}
            className="bg-red-500/15 text-red-600 dark:text-red-400 rounded-sm line-through"
          >
            {text}
          </del>
        );
      })}
    </pre>
  );
}

export function BotConfiguration({
  prompt,
  baselinePrompt,
  onPromptChange,
  onSave,
  onReset,
  onDiscardChanges,
  isLoading,
  error,
  canSave,
  canReset,
  locked,
  onUnlock,
}: BotConfigurationProps) {
  const [showDiff, setShowDiff] = useState(false);

  const handleExport = useCallback(() => {
    const data = JSON.stringify({ prompt }, null, 2);
    const url = URL.createObjectURL(
      new Blob([data], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "bot-personality.json";
    a.click();
    URL.revokeObjectURL(url);
  }, [prompt]);

  const handleImport = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const parsed = JSON.parse(ev.target?.result as string);
          if (typeof parsed.prompt !== "string") {
            toast.error(
              "Archivo inválido: debe contener un campo prompt (string).",
            );
            return;
          }
          onPromptChange(parsed.prompt);
          toast.success("Prompt importado. Revisa y guarda los cambios.");
        } catch {
          toast.error("No se pudo leer el archivo JSON.");
        }
      };
      reader.readAsText(file);
      e.target.value = "";
    },
    [onPromptChange],
  );

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-border/60 flex-shrink-0">
        <div>
          <h2 className="text-sm font-semibold text-foreground">
            Personalidad del bot
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {locked
              ? "Modo lectura — haz clic en editar para modificar."
              : "Define el tono, restricciones y comportamiento del asistente."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div aria-live="polite" aria-atomic="true">
            {error && (
              <span className="flex items-center gap-1.5 text-xs text-destructive">
                <AlertCircle className="w-3.5 h-3.5" aria-hidden="true" />
                {error}
              </span>
            )}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onUnlock}
            disabled={!locked || !!isLoading}
            aria-label={locked ? "Editar personalidad" : "Editando"}
            className={`h-8 w-8 transition-colors ${locked ? "text-muted-foreground hover:text-accent-violet hover:bg-accent-violet/10" : "text-accent-violet bg-accent-violet/10"}`}
          >
            {locked ? (
              <Lock className="w-3.5 h-3.5" aria-hidden="true" />
            ) : (
              <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
            )}
          </Button>
        </div>
      </div>

      {/* Dirty-state banner — live region always in DOM so screen readers catch the announcement */}
      <div
        aria-live="polite"
        aria-atomic="true"
        className={`flex-shrink-0 border-b border-amber-500/20 bg-amber-500/5 ${canSave ? "" : "hidden"}`}
      >
        <div className="flex items-center justify-between gap-3 px-6 py-2">
          <div className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-400 font-medium">
            <span
              className="w-1.5 h-1.5 rounded-full bg-amber-500 flex-shrink-0 animate-pulse"
              aria-hidden="true"
            />
            Cambios sin guardar
          </div>
          <div className="flex items-center gap-1.5">
            {baselinePrompt !== undefined && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowDiff((v) => !v)}
                className="h-6 text-[11px] font-mono text-muted-foreground hover:text-foreground gap-1"
              >
                <GitCompareArrows className="w-3 h-3" aria-hidden="true" />
                {showDiff ? "Ocultar diff" : "Ver diff"}
              </Button>
            )}
            {onDiscardChanges && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onDiscardChanges}
                disabled={!!isLoading}
                className="h-6 text-[11px] font-mono text-muted-foreground hover:text-foreground"
              >
                Descartar
              </Button>
            )}
            <Button
              type="button"
              onClick={onSave}
              size="sm"
              className="h-6 text-[11px] gradient-primary hover:opacity-90"
              disabled={!!isLoading}
            >
              <Save className="w-3 h-3 mr-1" aria-hidden="true" />
              {isLoading ? "Guardando…" : "Guardar"}
            </Button>
          </div>
        </div>
        {showDiff && baselinePrompt !== undefined && (
          <div className="px-6 pb-3">
            <p className="text-[10px] text-muted-foreground mb-1.5 font-mono">
              <mark className="bg-green-500/20 text-green-700 dark:text-green-400 rounded-sm px-1">
                verde
              </mark>{" "}
              = añadido &nbsp;
              <del className="bg-red-500/15 text-red-600 dark:text-red-400 rounded-sm px-1">
                rojo
              </del>{" "}
              = eliminado
            </p>
            <PromptDiff baseline={baselinePrompt} current={prompt} />
          </div>
        )}
      </div>
      {/* /aria-live dirty banner */}

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-6 py-4 space-y-4">
          {/* Empty state for first-time setup */}
          {locked && !prompt.trim() && (
            <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
              <div className="w-10 h-10 rounded-full bg-accent-violet/10 flex items-center justify-center">
                <Lock className="w-5 h-5 text-accent-violet/60" aria-hidden="true" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">Sin personalidad configurada</p>
                <p className="text-xs text-muted-foreground mt-1 max-w-xs">
                  Haz clic en el ícono de editar para configurar el tono y comportamiento del asistente.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onUnlock}
                className="mt-1 gap-2 text-xs border-accent-violet/30 text-accent-violet hover:bg-accent-violet/10"
              >
                <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                Configurar personalidad
              </Button>
            </div>
          )}

          {/* Short prompt guardrail */}
          {!canSave &&
            prompt.trim().length > 0 &&
            prompt.trim().length < 80 && (
              <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-muted/60 border border-border text-[11px] text-muted-foreground">
                <AlertCircle
                  className="w-3.5 h-3.5 flex-shrink-0 mt-0.5"
                  aria-hidden="true"
                />
                El prompt es muy corto para definir una personalidad útil.
                Considera agregar más contexto.
              </div>
            )}
          {!(locked && !prompt.trim()) && (
            <PromptBuilderAssistant
              prompt={prompt}
              onPromptChange={onPromptChange}
              fieldsReadOnly={!!locked}
            />
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="flex-shrink-0 border-t border-border/60 bg-card/80 backdrop-blur-sm px-6 py-3">
        <div className="flex items-center gap-2">
          {!canSave && !locked && (
            <Button
              type="button"
              onClick={onSave}
              className="gradient-primary hover:opacity-90 h-8 text-xs"
              disabled={!!isLoading}
            >
              <Save className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" />
              {isLoading ? "Guardando…" : "Guardar cambios"}
            </Button>
          )}
          <Button
            type="button"
            onClick={onReset}
            variant="outline"
            className="h-8 text-xs"
            disabled={!!isLoading || !canReset}
          >
            <RotateCcw className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" />
            Restablecer
          </Button>
          <div className="ml-auto flex items-center gap-1.5">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleExport}
              className="h-7 text-[11px] font-mono text-muted-foreground hover:text-foreground gap-1"
              title="Exportar prompt como JSON"
            >
              <Download className="w-3 h-3" aria-hidden="true" />
              Exportar
            </Button>
            {!locked && (
              <label
                className="cursor-pointer h-7 px-2.5 inline-flex items-center gap-1 text-[11px] font-mono text-muted-foreground hover:text-foreground rounded-md hover:bg-accent transition-colors"
                title="Importar prompt desde JSON"
              >
                <Upload className="w-3 h-3" aria-hidden="true" />
                Importar
                <input
                  type="file"
                  accept=".json,application/json"
                  className="sr-only"
                  onChange={handleImport}
                  aria-label="Importar prompt de personalidad"
                />
              </label>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
