"use client";
import React from "react";
import { Thermometer, AlertCircle } from "lucide-react";
import { Slider } from "@/app/components/ui/slider";

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
  if (t < 0.3)
    return "Respuestas consistentes y predecibles. Menor riesgo de alucinaciones.";
  if (t < 0.6)
    return "Balance entre variedad y precisión. Recomendado para soporte al cliente.";
  if (t < 0.85)
    return "Respuestas más variadas y expresivas. Verifica el comportamiento en producción.";
  return "Alta variabilidad. Riesgo elevado de respuestas inventadas.";
}

interface TemperatureCardProps {
  temperature: number;
  onTemperatureChange: (val: number) => void;
  disabled?: boolean;
}

export function TemperatureCard({
  temperature,
  onTemperatureChange,
  disabled,
}: TemperatureCardProps) {
  return (
    <div
      className={`glass rounded-xl border border-border/60 overflow-hidden transition-opacity ${disabled ? "opacity-55 pointer-events-none select-none" : ""}`}
      style={{ boxShadow: "var(--shadow-card)" }}
    >
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border/60 bg-accent-violet/8">
        <Thermometer
          className="w-3.5 h-3.5 text-accent-violet flex-shrink-0"
          aria-hidden="true"
        />
        <span className="text-xs font-semibold text-foreground">
          Temperatura
        </span>
        <span className="ml-auto font-mono text-sm font-bold text-accent-violet tabular-nums">
          {temperature.toFixed(1)}
        </span>
      </div>
      <div className="px-4 py-4 space-y-3">
        <div className="flex gap-1.5">
          {TEMP_PRESETS.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => onTemperatureChange(p.value)}
              disabled={disabled}
              aria-pressed={temperature === p.value}
              className={`flex-1 py-1.5 rounded-lg text-[11px] font-medium border transition-all duration-150 ${
                temperature === p.value
                  ? "bg-accent-violet/12 text-accent-violet border-accent-violet/50 shadow-sm"
                  : "bg-muted/40 text-muted-foreground border-border/60 hover:border-accent-violet/35 hover:text-foreground hover:bg-muted/60"
              } disabled:opacity-40 disabled:cursor-not-allowed`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <Slider
          value={[temperature]}
          onValueChange={(vals) => onTemperatureChange(vals[0])}
          max={1}
          min={0}
          step={0.1}
          disabled={disabled}
          className="w-full"
          aria-label="Temperatura del modelo"
          aria-valuetext={`${temperature.toFixed(1)} — ${tempLabel(temperature)}`}
        />
        <div className="flex justify-between text-[10px] text-muted-foreground">
          <span>Preciso</span>
          <span className="font-medium text-foreground">
            {tempLabel(temperature)}
          </span>
          <span>Creativo</span>
        </div>
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          {tempDescriptor(temperature)}
        </p>
        {temperature >= 0.85 && (
          <div className="flex items-start gap-1.5 px-2.5 py-2 rounded-lg bg-destructive/8 border border-destructive/20 text-[11px] text-destructive">
            <AlertCircle
              className="w-3 h-3 flex-shrink-0 mt-0.5"
              aria-hidden="true"
            />
            Alta temperatura puede generar alucinaciones. Verifica en
            producción.
          </div>
        )}
      </div>
    </div>
  );
}
