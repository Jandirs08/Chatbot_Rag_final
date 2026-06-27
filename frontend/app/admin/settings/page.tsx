"use client";
import React, { useMemo, useState } from "react";
import { useRequirePermission } from "@/app/hooks/useAuthGuard";
import { useBotConfig } from "@/app/hooks/useBotConfig";
import { Button } from "@/app/components/ui/button";
import { Skeleton } from "@/app/components/ui/skeleton";
import {
  Loader2,
  Palette,
  Brain,
  Shield,
  Terminal,
  Settings as SettingsIcon,
} from "lucide-react";
import { toast } from "sonner";
import { FadeIn, PulseDot } from "@/app/_components/motion";
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

const NAV_ITEMS: { id: SettingsTab; label: string; icon: React.ElementType }[] =
  [
    { id: "appearance", label: "Apariencia", icon: Palette },
    { id: "brain", label: "Personalidad", icon: Brain },
    { id: "system", label: "Sistema", icon: Shield },
  ];

export default function AdminSettingsPage() {
  const { isAuthorized, isChecking } =
    useRequirePermission("manage_bot_config");
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
  const [temperature, setTemperature] = useState<number>(0.7);
  const [uiExtra, setUiExtra] = useState<string>("");
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

  const { checkUnsavedChanges } = useUnsavedChanges(
    appearanceIsDirty || brainIsDirty,
  );

  const handleTabChange = (targetTab: SettingsTab) => {
    if (
      activeTab === "appearance" &&
      appearanceIsDirty &&
      targetTab !== "appearance"
    ) {
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
    setTemperature(
      typeof data.temperature === "number" ? data.temperature : 0.7,
    );
    setUiExtra(sanitizeUiExtra(data.ui_prompt_extra));
    setBaselineUiExtra(sanitizeUiExtra(data.ui_prompt_extra));
    setBaselineTemperature(
      typeof data.temperature === "number" ? data.temperature : 0.7,
    );
    let cancelled = false;
    botService
      .getState()
      .then((st) => {
        if (!cancelled) setIsBotActive(!!st.is_active);
      })
      .catch(() => {
        if (!cancelled) setIsBotActive(false);
      });
    return () => {
      cancelled = true;
    };
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
      toast.error(
        e instanceof Error ? e.message : "Error al guardar configuración",
      );
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
        ui_prompt_extra: (uiExtra || "").trim(),
      });
      setUiExtra(sanitizeUiExtra(updated.ui_prompt_extra));
      setBaselineUiExtra(sanitizeUiExtra(updated.ui_prompt_extra));
      setBaselineTemperature(updated.temperature ?? temperature);
      mutate();
      toast.success("Configuración guardada. Cambios aplicados al bot.");
    } catch (e: unknown) {
      const msg =
        e instanceof Error ? e.message : "Error al guardar configuración";
      setErrorBrain(msg);
      toast.error(msg);
    } finally {
      setSavingBrain(false);
    }
  };

  const handleDiscardChanges = () => {
    setUiExtra(baselineUiExtra);
    setTemperature(baselineTemperature);
  };

  const [resetConfirmOpen, setResetConfirmOpen] = useState<boolean>(false);

  const handleBrainReset = () => setResetConfirmOpen(true);

  const handleBrainResetConfirmed = async () => {
    setResetConfirmOpen(false);
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
      const msg =
        e instanceof Error ? e.message : "Error al restablecer configuración";
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
      toast.error(
        `Error al obtener runtime: ${e instanceof Error ? e.message : String(e)}`,
      );
    } finally {
      setRuntimeLoading(false);
    }
  };

  if (isChecking) {
    return <SettingsLoading />;
  }

  if (!isAuthorized) return null;

  if (isLoading || !data) {
    return <SettingsLoading />;
  }

  return (
    <FadeIn className="flex h-full overflow-hidden">
      {/* ── Sidebar nav ─────────────────────────────────────────────────────── */}
      <aside className="w-60 flex-shrink-0 flex flex-col overflow-hidden border-r border-border bg-card relative">
        <div
          aria-hidden="true"
          className="absolute -top-10 -left-10 w-44 h-44 opacity-25 animate-orb-float pointer-events-none"
        >
          <img
            src="/assets/decor/glow-orb-violet.svg"
            alt=""
            className="w-full h-full"
            loading="lazy"
          />
        </div>
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-grid opacity-15 pointer-events-none"
        />

        <div className="relative px-5 pt-6 pb-5 border-b border-border/60">
          <div className="flex items-center gap-2.5 mb-3">
            <span className="font-mono text-[10px] text-accent-violet/80 tabular-nums">
              07 / 09
            </span>
            <span className="h-px w-6 bg-accent-violet/40" />
          </div>
          <div className="flex items-center gap-2.5 mb-3">
            <SettingsIcon className="h-5 w-5 text-accent-violet" />
            <h1 className="text-xl font-heading font-bold tracking-tight leading-none">
              <span className="gradient-hero-display">Configuración</span>
            </h1>
          </div>
          <div
            className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-[10px] font-mono uppercase tracking-wider ${
              isBotActive
                ? "bg-success/10 text-success border border-success/25"
                : "bg-muted text-muted-foreground border border-border"
            }`}
          >
            {isBotActive ? (
              <PulseDot color="success" size={6} />
            ) : (
              <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50" />
            )}
            {isBotActive ? "activo" : "en pausa"}
          </div>
        </div>

        <nav
          role="tablist"
          aria-label="Secciones de configuración"
          className="relative flex-1 overflow-y-auto p-3 space-y-1"
        >
          {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
            const isActive = activeTab === id;
            const isDirty =
              (id === "appearance" && appearanceIsDirty) ||
              (id === "brain" && brainIsDirty);
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => handleTabChange(id)}
                className={`group w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ease-out-expo text-left ${
                  isActive
                    ? "bg-accent-violet/10 text-accent-violet border border-accent-violet/25 shadow-glow-violet"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/60 border border-transparent"
                }`}
              >
                <Icon
                  className={`w-4 h-4 flex-shrink-0 transition-transform duration-200 ${isActive ? "" : "group-hover:scale-110"}`}
                />
                <span className="flex-1">{label}</span>
                {isDirty && (
                  <>
                    <span
                      className="w-1.5 h-1.5 rounded-full bg-amber flex-shrink-0"
                      aria-hidden="true"
                    />
                    <span className="sr-only">Cambios sin guardar</span>
                  </>
                )}
              </button>
            );
          })}
        </nav>

        <div className="relative flex-shrink-0 p-3 border-t border-border/60">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2 text-xs font-mono text-accent-violet/70 hover:text-accent-violet hover:bg-accent-violet/10 transition-colors"
            onClick={handleOpenRuntime}
            disabled={runtimeLoading}
          >
            {runtimeLoading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin flex-shrink-0" />
            ) : (
              <Terminal className="w-3.5 h-3.5 flex-shrink-0" />
            )}
            ver runtime
          </Button>
        </div>
      </aside>

      {/* ── Content ─────────────────────────────────────────────────────────── */}
      <main className="flex-1 min-w-0 overflow-hidden relative">
        <div aria-hidden="true" className="absolute inset-0 bg-grid opacity-[0.04] pointer-events-none" />
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
        {/* Keep brain tab mounted to preserve AI form state across tab switches */}
        <div className={activeTab === "brain" ? "contents" : "hidden"}>
          <SettingsBrainTab
            uiExtra={uiExtra}
            baselineUiExtra={baselineUiExtra}
            setUiExtra={setUiExtra}
            temperature={temperature}
            setTemperature={setTemperature}
            handleBrainSave={handleBrainSave}
            handleBrainReset={handleBrainReset}
            handleDiscardChanges={handleDiscardChanges}
            onHistoryRestored={mutate}
            isLoading={isLoading}
            savingBrain={savingBrain}
            errorBrain={errorBrain}
            brainIsDirty={brainIsDirty}
          />
        </div>
        {activeTab === "system" && <SettingsSystemTab isLoading={isLoading} />}
      </main>

      {/* ── Runtime dialog ───────────────────────────────────────────────────── */}
      <Dialog open={runtimeOpen} onOpenChange={setRuntimeOpen}>
        <DialogContent className="max-w-2xl glass border-accent-violet/30">
          <DialogHeader>
            <div className="flex items-center gap-2.5 mb-1">
              <Terminal className="h-4 w-4 text-accent-violet" />
              <DialogTitle className="font-heading">
                Runtime del bot
              </DialogTitle>
            </div>
            <DialogDescription className="font-mono text-xs">
              estado efectivo · modelo, temperatura, prompt compuesto.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {runtimeData ? (
              <pre className="text-xs whitespace-pre-wrap break-words bg-background/60 p-4 rounded-lg border border-border/60 font-mono max-h-[60vh] overflow-y-auto">
                {JSON.stringify(runtimeData, null, 2)}
              </pre>
            ) : (
              <div className="relative overflow-hidden rounded-xl border border-dashed border-border bg-card/40 p-8">
                <div
                  aria-hidden="true"
                  className="absolute inset-0 bg-grid opacity-25 pointer-events-none"
                />
                <div className="relative flex flex-col items-center text-center gap-3">
                  <div className="text-accent-violet w-24 h-16">
                    <img
                      src="/assets/decor/empty-brain.svg"
                      alt=""
                      className="w-full h-full"
                      loading="lazy"
                    />
                  </div>
                  <p className="font-heading font-semibold text-sm text-foreground">
                    runtime no disponible
                  </p>
                  <p className="text-xs text-muted-foreground font-mono max-w-xs">
                    backend no respondió o aún no se ejecutó la consulta
                    inicial.
                  </p>
                  <button
                    onClick={handleOpenRuntime}
                    className="inline-flex items-center gap-1.5 text-[11px] font-mono text-accent-violet hover:text-accent-violet/80 transition-colors"
                  >
                    <Terminal className="h-3 w-3" />
                    reintentar consulta
                  </button>
                </div>
              </div>
            )}
            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={handleOpenRuntime}
                disabled={runtimeLoading}
                className="font-mono text-xs"
              >
                {runtimeLoading ? "actualizando..." : "actualizar"}
              </Button>
              <Button
                size="sm"
                onClick={() => setRuntimeOpen(false)}
                className="font-mono text-xs"
              >
                cerrar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Reset confirmation dialog ────────────────────────────────────────── */}
      <Dialog open={resetConfirmOpen} onOpenChange={setResetConfirmOpen}>
        <DialogContent className="max-w-sm glass border-destructive/30">
          <DialogHeader>
            <DialogTitle className="font-heading">
              ¿Restablecer configuración?
            </DialogTitle>
            <DialogDescription className="text-sm">
              El prompt y la temperatura volverán a sus valores de fábrica. Esta
              acción no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 justify-end pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setResetConfirmOpen(false)}
              className="font-mono text-xs"
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={handleBrainResetConfirmed}
              disabled={savingBrain}
              className="font-mono text-xs"
            >
              {savingBrain ? "Restableciendo…" : "Sí, restablecer"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </FadeIn>
  );
}

function SettingsLoading() {
  return (
    <div className="flex h-full overflow-hidden">
      <aside className="w-60 flex-shrink-0 flex flex-col gap-3 p-5 border-r border-border bg-card">
        <Skeleton className="h-4 w-24 rounded" />
        <Skeleton className="h-7 w-40 rounded" />
        <Skeleton className="h-6 w-20 rounded-full" />
        <div className="space-y-2 mt-4">
          <Skeleton className="h-10 w-full rounded-lg" />
          <Skeleton className="h-10 w-full rounded-lg" />
          <Skeleton className="h-10 w-full rounded-lg" />
        </div>
      </aside>
      <main className="flex-1 p-8 space-y-4">
        <Skeleton className="h-8 w-64 rounded" />
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </main>
    </div>
  );
}
