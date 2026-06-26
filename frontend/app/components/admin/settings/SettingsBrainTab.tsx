import React from "react";
import { BotConfiguration } from "@/app/components/BotConfiguration";

interface SettingsBrainTabProps {
  uiExtra: string;
  baselineUiExtra: string;
  setUiExtra: (val: string) => void;
  temperature: number;
  setTemperature: (val: number) => void;
  handleBrainSave: () => void;
  handleBrainReset: () => void;
  handleDiscardChanges: () => void;
  isLoading: boolean;
  savingBrain: boolean;
  errorBrain: string | null;
  brainIsDirty: boolean;
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
  isLoading,
  savingBrain,
  errorBrain,
  brainIsDirty,
}: SettingsBrainTabProps) {
  return (
    <div className="h-full overflow-hidden">
      <BotConfiguration
        prompt={uiExtra}
        baselinePrompt={baselineUiExtra}
        onPromptChange={(val) => setUiExtra(val)}
        temperature={temperature}
        onTemperatureChange={setTemperature}
        onSave={handleBrainSave}
        onReset={handleBrainReset}
        onDiscardChanges={handleDiscardChanges}
        isLoading={isLoading || savingBrain}
        error={errorBrain || undefined}
        canSave={brainIsDirty}
        canReset={true}
      />
    </div>
  );
}
