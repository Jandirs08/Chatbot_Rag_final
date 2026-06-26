import React, { useState, useCallback } from "react";
import { diff_match_patch } from "diff-match-patch";
import { Button } from "@/app/components/ui/button";
import { Label } from "@/app/components/ui/label";
import { Slider } from "@/app/components/ui/slider";
import { Save, RotateCcw, AlertCircle, Thermometer, GitCompareArrows, Download, Upload } from "lucide-react";
import { PromptBuilderAssistant } from "@/app/components/PromptBuilderAssistant";
import { toast } from "sonner";

export interface BotConfigurationProps {
  prompt: string;
  baselinePrompt?: string;
  onPromptChange: (value: string) => void;
  temperature: number;
  onTemperatureChange: (value: number) => void;
  onSave: () => void;
  onReset: () => void;
  onDiscardChanges?: () => void;
  isLoading?: boolean;
  error?: string;
  canSave?: boolean;
  canReset?: boolean;
}

const TEMP_PRESETS = [
  { label: "Preciso", value: 0.2 },
  { label: "Balanceado", value: 0.5 },
  { label: "Creativo", value: 0.8 },
] as const;

function tempLabel(t: number) {
  if (t < 0.3) return "Muy preciso";
  if (t < 0.6) return "Balanceado";
  if (t < 0.85) return "Creativo";
  return "Muy creativo";
}

function tempDescriptor(t: number) {
  if (t < 0.3) return "Respuestas muy consistentes y predecibles. Menor riesgo de alucinaciones.";
  if (t < 0.6) return "Balance entre variedad y precisión. Recomendado para soporte al cliente.";
  if (t < 0.85) return "Respuestas más variadas y expresivas. Verifica el comportamiento en producción.";
  return "Alta variabilidad. Riesgo elevado de respuestas inventadas (alucinaciones).";
}

function PromptDiff({ baseline, current }: { baseline: string; current: string }) {
  const dmp = new diff_match_patch();
  const diffs = dmp.diff_main(baseline, current);
  dmp.diff_cleanupSemantic(diffs);
  return (
    <pre className="text-[12px] leading-relaxed font-mono whitespace-pre-wrap break-words p-4 bg-background/60 rounded-lg border border-border max-h-64 overflow-y-auto">
      {diffs.map(([op, text], i) => {
        if (op === 0) return <span key={i}>{text}</span>;
        if (op === 1) return <mark key={i} className="bg-green-500/20 text-green-700 dark:text-green-400 rounded-sm">{text}</mark>;
        return <del key={i} className="bg-red-500/15 text-red-600 dark:text-red-400 rounded-sm line-through">{text}</del>;
      })}
    </pre>
  );
}

export function BotConfiguration({
  prompt,
  baselinePrompt,
  onPromptChange,
  temperature,
  onTemperatureChange,
  onSave,
  onReset,
  onDiscardChanges,
  isLoading,
  error,
  canSave,
  canReset,
}: BotConfigurationProps) {
  const [showDiff, setShowDiff] = useState(false);

  const handleExport = useCallback(() => {
    const data = JSON.stringify({ prompt, temperature }, null, 2);
    const url = URL.createObjectURL(new Blob([data], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "bot-personality.json";
    a.click();
    URL.revokeObjectURL(url);
  }, [prompt, temperature]);

  const handleImport = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target?.result as string);
        if (typeof parsed.prompt !== "string" || typeof parsed.temperature !== "number") {
          toast.error("Archivo inválido: debe contener prompt (string) y temperature (number).");
          return;
        }
        onPromptChange(parsed.prompt);
        onTemperatureChange(Math.min(1, Math.max(0, parsed.temperature)));
        toast.success("Personalidad importada. Revisa y guarda los cambios.");
      } catch {
        toast.error("No se pudo leer el archivo JSON.");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }, [onPromptChange, onTemperatureChange]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-border flex-shrink-0">
        <div>
          <h2 className="text-base font-semibold text-foreground">Personalidad del bot</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Define el tono, restricciones y comportamiento del asistente.
          </p>
        </div>
        <div aria-live="polite" aria-atomic="true">
          {error && (
            <span className="flex items-center gap-1.5 text-xs text-error">
              <AlertCircle className="w-3.5 h-3.5" aria-hidden="true" />
              {error}
            </span>
          )}
        </div>
      </div>

      {/* Dirty-state banner */}
      {canSave && (
        <div className="flex-shrink-0 border-b border-amber/20 bg-amber/8">
          <div className="flex items-center justify-between gap-3 px-6 py-2.5">
            <div aria-live="polite" aria-atomic="true" className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-400 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 flex-shrink-0" aria-hidden="true" />
              Cambios sin guardar
            </div>
            <div className="flex items-center gap-2">
              {baselinePrompt !== undefined && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowDiff((v) => !v)}
                  className="h-7 text-xs font-mono text-muted-foreground hover:text-foreground gap-1.5"
                >
                  <GitCompareArrows className="w-3 h-3" aria-hidden="true" />
                  {showDiff ? "Ocultar diff" : "Ver cambios"}
                </Button>
              )}
              {onDiscardChanges && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={onDiscardChanges}
                  disabled={!!isLoading}
                  className="h-7 text-xs font-mono text-muted-foreground hover:text-foreground"
                >
                  Descartar
                </Button>
              )}
              <Button
                type="button"
                onClick={onSave}
                size="sm"
                className="h-7 text-xs gradient-primary hover:opacity-90"
                disabled={!!isLoading}
              >
                <Save className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" />
                {isLoading ? "Guardando…" : "Guardar"}
              </Button>
            </div>
          </div>
          {showDiff && baselinePrompt !== undefined && (
            <div className="px-6 pb-4">
              <p className="text-[11px] text-muted-foreground mb-2 font-mono">
                <mark className="bg-green-500/20 text-green-700 dark:text-green-400 rounded-sm px-1">verde</mark> = añadido &nbsp;
                <del className="bg-red-500/15 text-red-600 dark:text-red-400 rounded-sm px-1">rojo</del> = eliminado
              </p>
              <PromptDiff baseline={baselinePrompt} current={prompt} />
            </div>
          )}
        </div>
      )}

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-6 py-5 space-y-6">
          {/* Prompt guardrails hints */}
          {!canSave && prompt.trim().length > 0 && prompt.trim().length < 80 && (
            <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-muted/60 border border-border text-[11px] text-muted-foreground">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" aria-hidden="true" />
              El prompt es muy corto para definir una personalidad útil. Considera agregar más contexto.
            </div>
          )}

          {/* Prompt builder */}
          <PromptBuilderAssistant
            prompt={prompt}
            onPromptChange={onPromptChange}
            fieldsReadOnly={false}
          />

          {/* Temperature */}
          <div className="space-y-3 pt-2 border-t border-border">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium flex items-center gap-1.5">
                <Thermometer className="w-3.5 h-3.5 text-muted-foreground" aria-hidden="true" />
                Temperatura del modelo
              </Label>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{tempLabel(temperature)}</span>
                <span className="text-sm font-mono font-semibold text-foreground tabular-nums">
                  {temperature.toFixed(1)}
                </span>
              </div>
            </div>

            {/* Preset buttons */}
            <div className="flex gap-2">
              {TEMP_PRESETS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => onTemperatureChange(p.value)}
                  aria-pressed={temperature === p.value}
                  className={`px-2.5 py-1 rounded text-[11px] font-medium border transition-all ${
                    temperature === p.value
                      ? "bg-primary/10 text-primary border-primary/40"
                      : "bg-muted/50 text-muted-foreground border-border hover:border-primary/30"
                  }`}
                >
                  {p.label} {p.value.toFixed(1)}
                </button>
              ))}
            </div>

            <Slider
              value={[temperature]}
              onValueChange={(vals) => onTemperatureChange(vals[0])}
              max={1}
              min={0}
              step={0.1}
              className="w-full"
              aria-label="Temperatura del modelo"
              aria-valuetext={`${temperature.toFixed(1)} — ${tempLabel(temperature)}`}
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Preciso</span>
              <span>Creativo</span>
            </div>
            <p className="text-xs text-muted-foreground">{tempDescriptor(temperature)}</p>

            {temperature >= 0.85 && (
              <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-destructive/8 border border-destructive/20 text-[11px] text-destructive">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" aria-hidden="true" />
                Alta temperatura puede aumentar respuestas inventadas. Verifica el comportamiento en producción.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex-shrink-0 border-t border-border bg-card/80 backdrop-blur-sm px-6 py-4">
        <div className="flex items-center gap-3">
          {!canSave && (
            <Button
              type="button"
              onClick={onSave}
              className="gradient-primary hover:opacity-90 h-9"
              disabled={!!isLoading}
            >
              <Save className="w-4 h-4 mr-2" aria-hidden="true" />
              {isLoading ? "Guardando…" : "Guardar cambios"}
            </Button>
          )}
          <Button
            type="button"
            onClick={onReset}
            variant="outline"
            className="h-9"
            disabled={!!isLoading || !canReset}
          >
            <RotateCcw className="w-4 h-4 mr-2" aria-hidden="true" />
            Restablecer
          </Button>
          <div className="ml-auto flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleExport}
              className="h-8 text-xs font-mono text-muted-foreground hover:text-foreground gap-1.5"
              title="Exportar configuración como JSON"
            >
              <Download className="w-3.5 h-3.5" aria-hidden="true" />
              Exportar
            </Button>
            <label
              className="cursor-pointer h-8 px-3 inline-flex items-center gap-1.5 text-xs font-mono text-muted-foreground hover:text-foreground rounded-md hover:bg-accent transition-colors"
              title="Importar configuración desde JSON"
            >
              <Upload className="w-3.5 h-3.5" aria-hidden="true" />
              Importar
              <input
                type="file"
                accept=".json,application/json"
                className="sr-only"
                onChange={handleImport}
                aria-label="Importar configuración de personalidad"
              />
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}
