import React from "react";
import { BotConfiguration } from "@/app/components/BotConfiguration";
import { PersonalityHistoryPanel } from "./PersonalityHistoryPanel";

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
}: SettingsBrainTabProps) {
  return (
    <div className="h-full overflow-hidden flex flex-col">
      <div className="flex-1 overflow-hidden">
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
      <div className="px-6 py-4 border-t border-border flex-shrink-0">
        <PersonalityHistoryPanel onRestored={onHistoryRestored} />
      </div>
    </div>
  );
}
