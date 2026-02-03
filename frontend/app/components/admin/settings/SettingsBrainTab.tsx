import React from "react";
import { Button } from "@/app/components/ui/button";
import { Terminal } from "lucide-react";
import { BotConfiguration } from "@/app/components/BotConfiguration";

interface SettingsBrainTabProps {
  uiExtra: string;
  setUiExtra: (val: string) => void;
  temperature: number;
  setTemperature: (val: number) => void;
  fieldsLocked: boolean;
  setFieldsLocked: (val: boolean) => void;
  handleBrainSave: () => void;
  handleBrainReset: () => void;
  isLoading: boolean;
  savingBrain: boolean;
  errorBrain: string | null;
  effectivePreview: string;
  brainIsDirty: boolean;
  isBotActive: boolean;
  handleOpenRuntime: () => void;
  runtimeLoading: boolean;
}

export function SettingsBrainTab({
  uiExtra,
  setUiExtra,
  temperature,
  setTemperature,
  fieldsLocked,
  setFieldsLocked,
  handleBrainSave,
  handleBrainReset,
  isLoading,
  savingBrain,
  errorBrain,
  effectivePreview,
  brainIsDirty,
  isBotActive,
  handleOpenRuntime,
  runtimeLoading,
}: SettingsBrainTabProps) {
  return (
    <div className="p-4 md:p-6 h-full overflow-y-auto">
      <BotConfiguration
        showBotName={false}
        fieldsReadOnly={fieldsLocked}
        onToggleEditFields={() => setFieldsLocked(!fieldsLocked)}
        prompt={uiExtra}
        onPromptChange={(val) => setUiExtra(val)}
        temperature={temperature}
        onTemperatureChange={setTemperature}
        onSave={handleBrainSave}
        onReset={handleBrainReset}
        isLoading={isLoading || savingBrain}
        error={errorBrain || undefined}
        previewText={effectivePreview}
        showPreview={true}
        canSave={brainIsDirty}
        isBotActive={isBotActive}
        canReset={brainIsDirty}
        rightAction={
          <Button
            size="sm"
            onClick={handleOpenRuntime}
            disabled={runtimeLoading}
            className="bg-orange-50 text-orange-600 border border-orange-200 hover:bg-orange-100 hover:text-orange-700"
          >
            <Terminal className="w-4 h-4 mr-2" />
            {runtimeLoading ? "Cargando..." : "Ver Runtime"}
          </Button>
        }
      />
    </div>
  );
}
