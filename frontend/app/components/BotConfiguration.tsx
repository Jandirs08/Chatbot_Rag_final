import React from "react";
import { Button } from "@/app/components/ui/button";
import { Label } from "@/app/components/ui/label";
import { Slider } from "@/app/components/ui/slider";
import { Save, RotateCcw, Pencil, AlertCircle } from "lucide-react";
import { PromptBuilderAssistant } from "@/app/components/PromptBuilderAssistant";

export interface BotConfigurationProps {
  fieldsReadOnly?: boolean;
  onToggleEditFields?: () => void;
  prompt: string;
  onPromptChange: (value: string) => void;
  temperature: number;
  onTemperatureChange: (value: number) => void;
  onSave: () => void;
  onReset: () => void;
  isLoading?: boolean;
  error?: string;
  canSave?: boolean;
  canReset?: boolean;
}

const TEMP_LABEL = (t: number) =>
  t < 0.3 ? "Muy preciso" : t < 0.7 ? "Balanceado" : "Creativo";

export function BotConfiguration({
  fieldsReadOnly,
  onToggleEditFields,
  prompt,
  onPromptChange,
  temperature,
  onTemperatureChange,
  onSave,
  onReset,
  isLoading,
  error,
  canSave,
  canReset,
}: BotConfigurationProps) {
  return (
    <div className="flex flex-col h-full">
      {/* Header row */}
      <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-border flex-shrink-0">
        <div>
          <h2 className="text-base font-semibold text-foreground">Personalidad del bot</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Define el tono, restricciones y comportamiento del asistente.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div aria-live="polite" aria-atomic="true">
            {error && (
              <span className="flex items-center gap-1.5 text-xs text-error">
                <AlertCircle className="w-3.5 h-3.5" aria-hidden="true" />
                {error}
              </span>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggleEditFields}
            aria-label={fieldsReadOnly ? "Editar personalidad" : "Bloquear edición"}
            className="text-muted-foreground hover:text-foreground"
          >
            <Pencil className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-6 py-5 space-y-6">
          {/* Prompt builder */}
          <PromptBuilderAssistant
            prompt={prompt}
            onPromptChange={onPromptChange}
            fieldsReadOnly={!!fieldsReadOnly}
          />

          {/* Temperature */}
          <div className={`space-y-3 pt-2 border-t border-border transition-opacity ${fieldsReadOnly ? "opacity-40 pointer-events-none select-none" : ""}`}>
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Temperatura del modelo</Label>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{TEMP_LABEL(temperature)}</span>
                <span className="text-sm font-mono font-semibold text-foreground tabular-nums">
                  {temperature.toFixed(1)}
                </span>
              </div>
            </div>
            <Slider
              value={[temperature]}
              onValueChange={(vals) => onTemperatureChange(vals[0])}
              max={1}
              min={0}
              step={0.1}
              disabled={!!fieldsReadOnly}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Preciso</span>
              <span>Creativo</span>
            </div>
            <p className="text-xs text-muted-foreground">
              0.3–0.5 para respuestas consistentes. 0.7–1.0 para respuestas más variadas.
            </p>
          </div>
        </div>
      </div>

      {/* Sticky footer actions */}
      <div className="flex-shrink-0 border-t border-border bg-card/80 backdrop-blur-sm px-6 py-4">
        <div className="flex items-center gap-3">
          <Button
            type="button"
            onClick={onSave}
            className="gradient-primary hover:opacity-90 h-9"
            disabled={!!isLoading || !canSave}
          >
            <Save className="w-4 h-4 mr-2" />
            {isLoading ? "Guardando…" : "Guardar cambios"}
          </Button>
          <Button
            type="button"
            onClick={onReset}
            variant="outline"
            className="h-9"
            disabled={!!isLoading || !canReset}
          >
            <RotateCcw className="w-4 h-4 mr-2" />
            Restablecer
          </Button>
          <div aria-live="polite" aria-atomic="true" className="ml-auto">
            {canSave && (
              <span className="text-xs text-warning">Cambios sin guardar</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
