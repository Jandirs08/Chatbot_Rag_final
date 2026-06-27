import React from "react";
import { BotConfiguration } from "@/app/components/BotConfiguration";
import { PersonalityHistoryPanel } from "./PersonalityHistoryPanel";
import { TemperatureCard } from "./TemperatureCard";
import { PersonalityPreviewCard } from "./PersonalityPreviewCard";

interface SettingsBrainTabProps {
  uiExtra: string;
  baselineUiExtra: string;
  setUiExtra: (val: string) => void;
  temperature: number;
  setTemperature: (val: number) => void;
  handleBrainSave: () => void;
  handleBrainReset: () => void;
  handleDiscardChanges: () => void;
  onHistoryRestored: () => void;
  isLoading: boolean;
  savingBrain: boolean;
  errorBrain: string | null;
  brainIsDirty: boolean;
  brainLocked: boolean;
  onBrainUnlock: () => void;
}

export function SettingsBrainTab({
  uiExtra,
  baselineUiExtra,
  setUiExtra,
  temperature,
  setTemperature,
  handleBrainSave,
  handleBrainReset,
  handleDiscardChanges,
  onHistoryRestored,
  isLoading,
  savingBrain,
  errorBrain,
  brainIsDirty,
  brainLocked,
  onBrainUnlock,
}: SettingsBrainTabProps) {
  const disabled = isLoading || savingBrain;
  return (
    <div className="h-full overflow-hidden flex">
      {/* Left: prompt editor */}
      <div className="flex-1 min-w-0 flex flex-col border-r border-border/60">
        <BotConfiguration
          prompt={uiExtra}
          baselinePrompt={baselineUiExtra}
          onPromptChange={setUiExtra}
          onSave={handleBrainSave}
          onReset={handleBrainReset}
          onDiscardChanges={handleDiscardChanges}
          isLoading={disabled}
          error={errorBrain || undefined}
          canSave={brainIsDirty}
          canReset={true}
          locked={brainLocked}
          onUnlock={onBrainUnlock}
        />
      </div>

      {/* Right: cards panel */}
      <div className="w-72 xl:w-80 flex-shrink-0 overflow-y-auto p-4 space-y-3 bg-muted/20">
        <TemperatureCard
          temperature={temperature}
          onTemperatureChange={setTemperature}
          disabled={disabled || brainLocked}
        />
        {brainIsDirty && !brainLocked && (
          <PersonalityPreviewCard
            prompt={uiExtra}
            temperature={temperature}
            disabled={disabled}
          />
        )}
        <PersonalityHistoryPanel onRestored={onHistoryRestored} />
      </div>
    </div>
  );
}
