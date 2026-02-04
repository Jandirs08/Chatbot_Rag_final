"use client";
import React, { useMemo, useState } from "react";
import useSWR from "swr";
import { useRequireAdmin } from "@/app/hooks/useAuthGuard";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/app/components/ui/tabs";
import { Button } from "@/app/components/ui/button";
import {
  Loader2,
  Terminal,
} from "lucide-react";
import { toast } from "sonner";
import {
  getBotConfig,
  updateBotConfig,
  resetBotConfig,
  getBotRuntime,
  type BotConfigDTO,
  type BotRuntimeDTO,
} from "@/app/lib/services/botConfigService";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/app/components/ui/dialog";
import { API_URL } from "@/app/lib/config";
import { botService } from "@/app/lib/services/botService";
import { useUnsavedChanges } from "@/app/hooks/useUnsavedChanges";

import { SettingsAppearanceTab } from "@/app/components/admin/settings/SettingsAppearanceTab";
import { SettingsBrainTab } from "@/app/components/admin/settings/SettingsBrainTab";
import { SettingsSystemTab } from "@/app/components/admin/settings/SettingsSystemTab";

export default function AdminSettingsPage() {
  const { isAuthorized } = useRequireAdmin();
  const [activeTab, setActiveTab] = useState<"appearance" | "brain" | "system">(
    "appearance",
  );
  const [config, setConfig] = useState({
    name: "",
    avatarUrl: "",
    brandColor: "#0EA5E9",
    placeholder: "Escribe aquí...",
    starters: [] as string[],
  });
  const { data, isLoading, mutate } = useSWR<BotConfigDTO>(
    isAuthorized ? "bot-config" : null,
    async () => getBotConfig(),
    { revalidateOnFocus: true },
  );
  const baseline = useMemo(() => {
    const name = data?.bot_name || "Asistente IA";
    const brand = data?.theme_color || "#F97316";
    const ph = data?.input_placeholder || "Escribe aquí...";
    const starters = Array.isArray(data?.starters)
      ? data!.starters!.slice(0, 6)
      : [];
    const avatarUrl = `${API_URL}/assets/logo`;
    return { name, brandColor: brand, placeholder: ph, starters, avatarUrl };
  }, [data]);

  React.useEffect(() => {
    if (data) setConfig(baseline);
  }, [data, baseline]);

  const [saving, setSaving] = useState(false);
  const [prompt, setPrompt] = useState<string>("");
  const [temperature, setTemperature] = useState<number>(0.7);
  const [uiExtra, setUiExtra] = useState<string>("");
  const [fieldsLocked, setFieldsLocked] = useState<boolean>(true);
  const [appearanceLocked, setAppearanceLocked] = useState<boolean>(true);

  const [baselineUiExtra, setBaselineUiExtra] = useState<string>("");
  const [baselineTemperature, setBaselineTemperature] = useState<number>(0.7);
  const [savingBrain, setSavingBrain] = useState<boolean>(false);
  const [errorBrain, setErrorBrain] = useState<string | null>(null);
  const [isBotActive, setIsBotActive] = useState<boolean>(false);

  const brainIsDirty = useMemo(() => {
    return uiExtra !== baselineUiExtra || temperature !== baselineTemperature;
  }, [uiExtra, baselineUiExtra, temperature, baselineTemperature]);

  const appearanceIsDirty = useMemo(() => {
    return (
      config.name !== baseline.name ||
      config.brandColor !== baseline.brandColor ||
      config.placeholder !== baseline.placeholder ||
      JSON.stringify(config.starters) !== JSON.stringify(baseline.starters)
    );
  }, [config, baseline]);

  const { checkUnsavedChanges } = useUnsavedChanges(
    appearanceIsDirty || brainIsDirty,
  );

  const handleTabChange = (value: string) => {
    const targetTab = value as "appearance" | "brain" | "system";

    // Check for unsaved changes in Appearance tab
    if (
      activeTab === "appearance" &&
      appearanceIsDirty &&
      targetTab !== "appearance"
    ) {
      checkUnsavedChanges(() => setActiveTab(targetTab));
      return;
    }

    // Check for unsaved changes in Brain tab
    if (activeTab === "brain" && brainIsDirty && targetTab !== "brain") {
      checkUnsavedChanges(() => setActiveTab(targetTab));
      return;
    }

    setActiveTab(targetTab);
  };

  React.useEffect(() => {
    if (typeof window !== "undefined") {
      const hash = window.location.hash.replace("#", "");
      if (hash === "appearance" || hash === "brain" || hash === "system") {
        setActiveTab(hash as any);
      }
    }
    if (data) {
      setPrompt(data.system_prompt || "");
      setTemperature(
        typeof data.temperature === "number" ? data.temperature : 0.7,
      );
      const sanitizeUiExtra = (val?: string | null) => {
        const txt = String(val || "").trim();
        try {
          const obj = JSON.parse(txt);
          if (
            obj &&
            typeof obj === "object" &&
            ("brandColor" in obj ||
              "placeholder" in obj ||
              "welcomeMessage" in obj ||
              "starters" in obj ||
              "avatarUrl" in obj)
          ) {
            return "";
          }
        } catch (_) { }
        return txt;
      };
      setUiExtra(sanitizeUiExtra(data.ui_prompt_extra));
      setBaselineUiExtra(sanitizeUiExtra(data.ui_prompt_extra));
      setBaselineTemperature(
        typeof data.temperature === "number" ? data.temperature : 0.7,
      );
      botService
        .getState()
        .then((st) => setIsBotActive(!!st.is_active))
        .catch(() => setIsBotActive(false));
    }
  }, [data]);

  const presetColors = [
    "#0EA5E9",
    "#22C55E",
    "#EF4444",
    "#F59E0B",
    "#8B5CF6",
    "#06B6D4",
  ];

  const handleSave = async () => {
    try {
      setSaving(true);
      await updateBotConfig({
        bot_name: config.name || undefined,
        system_prompt: prompt || undefined,
        temperature,
        theme_color: config.brandColor,
        input_placeholder: config.placeholder,
        starters: config.starters.slice(0, 6),
      });
      toast.success("Configuración guardada");
      mutate();
    } catch (e: any) {
      toast.error(e?.message || "Error al guardar configuración");
    } finally {
      setSaving(false);
    }
  };

  const effectivePreview = useMemo(() => {
    const base = prompt || "";
    const extra = uiExtra ? `\n\nInstrucciones adicionales:\n${uiExtra}` : "";
    return `${base}${extra}`;
  }, [prompt, uiExtra]);

  const handleBrainSave = async () => {
    try {
      setSavingBrain(true);
      setErrorBrain(null);
      const updated = await updateBotConfig({
        system_prompt: prompt,
        temperature,
        ui_prompt_extra: (uiExtra || "").trim() || undefined,
      });
      setPrompt(updated.system_prompt || "");
      const sanitizeUiExtra = (val?: string | null) => {
        const txt = String(val || "").trim();
        try {
          const obj = JSON.parse(txt);
          if (
            obj &&
            typeof obj === "object" &&
            ("brandColor" in obj ||
              "placeholder" in obj ||
              "welcomeMessage" in obj ||
              "starters" in obj ||
              "avatarUrl" in obj)
          ) {
            return "";
          }
        } catch (_) { }
        return txt;
      };
      setUiExtra(sanitizeUiExtra(updated.ui_prompt_extra));
      setBaselineUiExtra(sanitizeUiExtra(updated.ui_prompt_extra));
      setBaselineTemperature(updated.temperature ?? temperature);
      setFieldsLocked(true);
      toast.success("Configuración guardada. Cambios aplicados al bot.");
    } catch (e: any) {
      setErrorBrain(e?.message || "Error al guardar configuración");
      toast.error(e?.message || "No se pudo guardar");
    } finally {
      setSavingBrain(false);
    }
  };

  const handleBrainReset = async () => {
    try {
      setSavingBrain(true);
      setErrorBrain(null);
      const updated = await resetBotConfig();
      setUiExtra("");
      setBaselineUiExtra("");
      toast.success("Configuración restablecida y limpiada en backend.");
    } catch (e: any) {
      setErrorBrain(e?.message || "Error al restablecer configuración");
      toast.error(`Error al restablecer: ${e?.message || e}`);
    } finally {
      setSavingBrain(false);
    }
  };

  const [runtimeOpen, setRuntimeOpen] = useState<boolean>(false);
  const [runtimeData, setRuntimeData] = useState<BotRuntimeDTO | null>(null);
  const [runtimeLoading, setRuntimeLoading] = useState<boolean>(false);

  const handleOpenRuntime = async () => {
    try {
      setRuntimeLoading(true);
      const rt = await getBotRuntime();
      setRuntimeData(rt);
      setRuntimeOpen(true);
    } catch (e: any) {
      toast.error(`Error al obtener runtime: ${e?.message || e}`);
    } finally {
      setRuntimeLoading(false);
    }
  };

  if (!isAuthorized) return null;
  if (isLoading || !data) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Cargando configuración…
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col lg:h-full lg:overflow-hidden">
      <div className="px-4 md:px-6 pt-4 md:pt-6 pb-4 border-b">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold text-foreground">Configuración del Bot</h1>
            <span
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold ${
                isBotActive
                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                  : "bg-slate-100 text-slate-700 border border-slate-200"
              }`}
            >
              <span
                className={`inline-block w-2 h-2 rounded-full ${
                  isBotActive ? "bg-emerald-500" : "bg-gray-400"
                }`}
              />
              {isBotActive ? "Estado: Activo" : "Estado: En Pausa"}
            </span>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={handleOpenRuntime}
              disabled={runtimeLoading}
              className="gradient-primary hover:opacity-90"
            >
              <Terminal className="w-4 h-4 mr-2" />
              {runtimeLoading ? "Cargando..." : "Ver Runtime"}
            </Button>
          </div>
        </div>
      </div>
      <Tabs
        value={activeTab}
        onValueChange={handleTabChange}
        className="flex-1 min-h-0 flex flex-col"
      >
        <TabsList className="w-full overflow-x-auto whitespace-nowrap scroll-smooth md:overflow-visible">
          <TabsTrigger value="appearance">Apariencia</TabsTrigger>
          <TabsTrigger value="brain">Cerebro</TabsTrigger>
          <TabsTrigger value="system">Sistema</TabsTrigger>
        </TabsList>
        <TabsContent value="appearance" className="flex-1 min-h-0">
          <SettingsAppearanceTab
            isLoading={isLoading}
            config={config}
            setConfig={setConfig}
            appearanceLocked={appearanceLocked}
            setAppearanceLocked={setAppearanceLocked}
            baseline={baseline}
            presetColors={presetColors}
            saving={saving}
            appearanceIsDirty={appearanceIsDirty}
            handleSave={handleSave}
          />
        </TabsContent>
        <TabsContent value="brain" className="flex-1 min-h-0">
          <SettingsBrainTab
            uiExtra={uiExtra}
            setUiExtra={setUiExtra}
            temperature={temperature}
            setTemperature={setTemperature}
            fieldsLocked={fieldsLocked}
            setFieldsLocked={setFieldsLocked}
            handleBrainSave={handleBrainSave}
            handleBrainReset={handleBrainReset}
            isLoading={isLoading}
            savingBrain={savingBrain}
            errorBrain={errorBrain}
            effectivePreview={effectivePreview}
            brainIsDirty={brainIsDirty}
            isBotActive={isBotActive}
            handleOpenRuntime={handleOpenRuntime}
            runtimeLoading={runtimeLoading}
          />
        </TabsContent>
        <TabsContent value="system" className="flex-1 min-h-0">
          <SettingsSystemTab isLoading={isLoading} />
        </TabsContent>

        <Dialog open={runtimeOpen} onOpenChange={setRuntimeOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Runtime del Bot</DialogTitle>
              <DialogDescription>
                Estado efectivo actual (modelo, temperatura, nombre y
                composición del prompt)
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              {runtimeData ? (
                <pre className="text-sm whitespace-pre-wrap break-words bg-muted/30 p-3 rounded-md border border-border/50">
                  {JSON.stringify(runtimeData, null, 2)}
                </pre>
              ) : (
                <div className="text-sm text-muted-foreground">
                  No hay datos
                </div>
              )}
              <div className="flex gap-2 justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleOpenRuntime}
                  disabled={runtimeLoading}
                >
                  {runtimeLoading ? "Actualizando..." : "Actualizar"}
                </Button>
                <Button size="sm" onClick={() => setRuntimeOpen(false)}>
                  Cerrar
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </Tabs>
    </div>
  );
}
