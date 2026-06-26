import React from "react";
import { Button } from "@/app/components/ui/button";
import { Label } from "@/app/components/ui/label";
import { Slider } from "@/app/components/ui/slider";
import { Save, RotateCcw, AlertCircle, Thermometer } from "lucide-react";
import { PromptBuilderAssistant } from "@/app/components/PromptBuilderAssistant";

export interface BotConfigurationProps {
  prompt: string;
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

export function BotConfiguration({
  prompt,
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
        <div className="flex-shrink-0 flex items-center justify-between gap-3 px-6 py-2.5 bg-amber/8 border-b border-amber/20">
          <div aria-live="polite" aria-atomic="true" className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-400 font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 flex-shrink-0" aria-hidden="true" />
            Cambios sin guardar
          </div>
          <div className="flex items-center gap-2">
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

      {/* Footer — always show reset, save only when no dirty banner */}
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
        </div>
      </div>
    </div>
  );
}
