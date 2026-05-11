"use client";
import React, { useMemo, useState } from "react";
import { useRequirePermission } from "@/app/hooks/useAuthGuard";
import { useBotConfig } from "@/app/hooks/useBotConfig";
import { Button } from "@/app/components/ui/button";
import { Loader2, Palette, Brain, Shield, Terminal } from "lucide-react";
import { toast } from "sonner";
import {
  updateBotConfig,
  resetBotConfig,
  getBotRuntime,
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

function sanitizeUiExtra(val?: string | null) {
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
  } catch {
    // Plain text is valid for this field.
  }
  return txt;
}

const presetColors = [
  "#0EA5E9",
  "#22C55E",
  "#EF4444",
  "#F59E0B",
  "#8B5CF6",
  "#06B6D4",
];

type SettingsTab = "appearance" | "brain" | "system";

const NAV_ITEMS: { id: SettingsTab; label: string; icon: React.ElementType }[] = [
  { id: "appearance", label: "Apariencia", icon: Palette },
  { id: "brain",      label: "Personalidad", icon: Brain },
  { id: "system",     label: "Sistema",     icon: Shield },
];

export default function AdminSettingsPage() {
  const { isAuthorized, isChecking } = useRequirePermission("manage_bot_config");
  const [activeTab, setActiveTab] = useState<SettingsTab>("appearance");
  const [config, setConfig] = useState({
    name: "",
    avatarUrl: "",
    brandColor: "#0EA5E9",
    placeholder: "Escribe aquí...",
    starters: [] as string[],
  });
  const { data, isLoading, mutate } = useBotConfig({
    enabled: isAuthorized,
    revalidateOnFocus: true,
  });
  const baseline = useMemo(() => {
    const name = data?.bot_name || "Asistente IA";
    const brand = data?.theme_color || "#F97316";
    const ph = data?.input_placeholder || "Escribe aquí...";
    const starters = Array.isArray(data?.starters) ? data!.starters!.slice(0, 6) : [];
    const avatarUrl = `${API_URL}/assets/logo`;
    return { name, brandColor: brand, placeholder: ph, starters, avatarUrl };
  }, [data]);

  React.useEffect(() => {
    if (data) setConfig(baseline);
  }, [data, baseline]);

  const [saving, setSaving] = useState(false);
  const [temperature, setTemperature] = useState<number>(0.7);
  const [uiExtra, setUiExtra] = useState<string>("");
  const [fieldsLocked, setFieldsLocked] = useState<boolean>(true);
  const [appearanceLocked, setAppearanceLocked] = useState<boolean>(true);
  const [baselineUiExtra, setBaselineUiExtra] = useState<string>("");
  const [baselineTemperature, setBaselineTemperature] = useState<number>(0.7);
  const [savingBrain, setSavingBrain] = useState<boolean>(false);
  const [errorBrain, setErrorBrain] = useState<string | null>(null);
  const [isBotActive, setIsBotActive] = useState<boolean>(false);

  const brainIsDirty = useMemo(
    () => uiExtra !== baselineUiExtra || temperature !== baselineTemperature,
    [uiExtra, baselineUiExtra, temperature, baselineTemperature],
  );

  const appearanceIsDirty = useMemo(
    () =>
      config.name !== baseline.name ||
      config.brandColor !== baseline.brandColor ||
      config.placeholder !== baseline.placeholder ||
      JSON.stringify(config.starters) !== JSON.stringify(baseline.starters),
    [config, baseline],
  );

  const { checkUnsavedChanges } = useUnsavedChanges(appearanceIsDirty || brainIsDirty);

  const handleTabChange = (targetTab: SettingsTab) => {
    if (activeTab === "appearance" && appearanceIsDirty && targetTab !== "appearance") {
      checkUnsavedChanges(() => setActiveTab(targetTab));
      return;
    }
    if (activeTab === "brain" && brainIsDirty && targetTab !== "brain") {
      checkUnsavedChanges(() => setActiveTab(targetTab));
      return;
    }
    setActiveTab(targetTab);
  };

  React.useEffect(() => {
    if (typeof window !== "undefined") {
      const hash = window.location.hash.replace("#", "") as SettingsTab;
      if (hash === "appearance" || hash === "brain" || hash === "system") {
        setActiveTab(hash);
      }
    }
  }, []);

  React.useEffect(() => {
    if (!data) return;
    setTemperature(typeof data.temperature === "number" ? data.temperature : 0.7);
    setUiExtra(sanitizeUiExtra(data.ui_prompt_extra));
    setBaselineUiExtra(sanitizeUiExtra(data.ui_prompt_extra));
    setBaselineTemperature(typeof data.temperature === "number" ? data.temperature : 0.7);
    botService
      .getState()
      .then((st) => setIsBotActive(!!st.is_active))
      .catch(() => setIsBotActive(false));
  }, [data]);

  const handleSave = async () => {
    try {
      setSaving(true);
      await updateBotConfig({
        bot_name: config.name || undefined,
        theme_color: config.brandColor,
        input_placeholder: config.placeholder,
        starters: config.starters.slice(0, 6),
      });
      toast.success("Configuración guardada");
      mutate();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Error al guardar configuración");
    } finally {
      setSaving(false);
    }
  };

  const handleBrainSave = async () => {
    try {
      setSavingBrain(true);
      setErrorBrain(null);
      const updated = await updateBotConfig({
        temperature,
        ui_prompt_extra: (uiExtra || "").trim() || undefined,
      });
      setUiExtra(sanitizeUiExtra(updated.ui_prompt_extra));
      setBaselineUiExtra(sanitizeUiExtra(updated.ui_prompt_extra));
      setBaselineTemperature(updated.temperature ?? temperature);
      toast.success("Configuración guardada. Cambios aplicados al bot.");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Error al guardar configuración";
      setErrorBrain(msg);
      toast.error(msg);
    } finally {
      setSavingBrain(false);
    }
  };

  const handleBrainReset = async () => {
    try {
      setSavingBrain(true);
      setErrorBrain(null);
      await resetBotConfig();
      setUiExtra("");
      setBaselineUiExtra("");
      setTemperature(0.7);
      setBaselineTemperature(0.7);
      mutate();
      toast.success("Configuración restablecida.");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Error al restablecer configuración";
      setErrorBrain(msg);
      toast.error(`Error al restablecer: ${msg}`);
    } finally {
      setSavingBrain(false);
    }
  };

  const [runtimeOpen, setRuntimeOpen] = useState<boolean>(false);
  const [runtimeData, setRuntimeData] = useState<BotRuntimeDTO | null>(null);
  const [runtimeLoading, setRuntimeLoading] = useState<boolean>(false);

  const handleOpenRuntime = async () => {
    if (runtimeLoading) return;
    try {
      setRuntimeLoading(true);
      const rt = await getBotRuntime();
      setRuntimeData(rt);
      setRuntimeOpen(true);
    } catch (e: unknown) {
      toast.error(`Error al obtener runtime: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setRuntimeLoading(false);
    }
  };

  if (isChecking) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

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
    <div className="flex h-full overflow-hidden">
      {/* ── Sidebar nav ─────────────────────────────────────────────────────── */}
      <aside className="w-56 flex-shrink-0 flex flex-col overflow-hidden border-r border-border bg-card">
        <div className="px-5 pt-6 pb-4 border-b border-border">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-3">
            Configuración
          </p>
          <div
            className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-md text-xs font-medium ${
              isBotActive
                ? "bg-success/10 text-success border border-success/20"
                : "bg-muted text-muted-foreground border border-border"
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                isBotActive ? "bg-success animate-pulse" : "bg-muted-foreground/50"
              }`}
            />
            {isBotActive ? "Activo" : "En pausa"}
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto p-3 space-y-0.5">
          {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
            const isActive = activeTab === id;
            const isDirty =
              (id === "appearance" && appearanceIsDirty) ||
              (id === "brain" && brainIsDirty);
            return (
              <button
                key={id}
                type="button"
                onClick={() => handleTabChange(id)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors text-left ${
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                <span className="flex-1">{label}</span>
                {isDirty && (
                  <span className="w-1.5 h-1.5 rounded-full bg-warning flex-shrink-0" />
                )}
              </button>
            );
          })}
        </nav>

        <div className="flex-shrink-0 p-3 border-t border-border">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2 text-xs text-primary/70 hover:text-primary hover:bg-primary/10"
            onClick={handleOpenRuntime}
            disabled={runtimeLoading}
          >
            {runtimeLoading
              ? <Loader2 className="w-3.5 h-3.5 animate-spin flex-shrink-0" />
              : <Terminal className="w-3.5 h-3.5 flex-shrink-0" />}
            Ver Runtime
          </Button>
        </div>
      </aside>

      {/* ── Content ─────────────────────────────────────────────────────────── */}
      <main className="flex-1 min-w-0 overflow-hidden">
        {activeTab === "appearance" && (
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
        )}
        {activeTab === "brain" && (
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
            brainIsDirty={brainIsDirty}
          />
        )}
        {activeTab === "system" && (
          <SettingsSystemTab isLoading={isLoading} />
        )}
      </main>

      {/* ── Runtime dialog ───────────────────────────────────────────────────── */}
      <Dialog open={runtimeOpen} onOpenChange={setRuntimeOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Runtime del Bot</DialogTitle>
            <DialogDescription>
              Estado efectivo actual: modelo, temperatura, nombre y composición del prompt.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {runtimeData ? (
              <pre className="text-sm whitespace-pre-wrap break-words bg-muted/50 p-4 rounded-lg border border-border font-mono max-h-[60vh] overflow-y-auto">
                {JSON.stringify(runtimeData, null, 2)}
              </pre>
            ) : (
              <p className="text-sm text-muted-foreground">No hay datos disponibles.</p>
            )}
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={handleOpenRuntime} disabled={runtimeLoading}>
                {runtimeLoading ? "Actualizando..." : "Actualizar"}
              </Button>
              <Button size="sm" onClick={() => setRuntimeOpen(false)}>Cerrar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
