import React from "react";
import { BotConfiguration } from "@/app/components/BotConfiguration";
import { PersonalityHistoryPanel } from "./PersonalityHistoryPanel";
import { TemperatureCard } from "./TemperatureCard";
import { PersonalityPreviewCard } from "./PersonalityPreviewCard";
import { type BotConfigDTO } from "@/app/lib/services/botConfigService";

interface SettingsBrainTabProps {
  uiExtra: string;
  baselineUiExtra: string;
  setUiExtra: (val: string) => void;
  temperature: number;
  setTemperature: (val: number) => void;
  handleBrainSave: () => void;
  handleBrainReset: () => void;
  handleDiscardChanges: () => void;
  onHistoryRestored: (config: BotConfigDTO, personalityName: string) => void;
  isLoading: boolean;
  savingBrain: boolean;
  errorBrain: string | null;
  brainIsDirty: boolean;
  brainLocked: boolean;
  onBrainUnlock: () => void;
  onBrainLock: () => void;
  personalityName: string;
  onPersonalityNameChange: (val: string) => void;
  savedPersonalityName: string;
  historyRefreshKey: number;
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
  onBrainLock,
  personalityName,
  onPersonalityNameChange,
  savedPersonalityName,
  historyRefreshKey,
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
          canReset={!!uiExtra.trim() || temperature !== 0.7}
          locked={brainLocked}
          onUnlock={onBrainUnlock}
          onLock={onBrainLock}
          personalityName={personalityName}
          onPersonalityNameChange={onPersonalityNameChange}
          savedPersonalityName={savedPersonalityName}
        />
      </div>

      {/* Right: cards panel */}
      <div className="w-72 xl:w-80 flex-shrink-0 overflow-y-auto p-4 space-y-3 bg-muted/30 border-l-0">
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
        <PersonalityHistoryPanel
          onRestored={onHistoryRestored}
          currentUiExtra={uiExtra}
          currentTemperature={temperature}
          refreshKey={historyRefreshKey}
        />
      </div>
    </div>
  );
}
