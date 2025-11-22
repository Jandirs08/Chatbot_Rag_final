"use client";
import { useEffect, useMemo, useState } from "react";
import { useAuthGuard } from "@/app/hooks/useAuthGuard";
import { BotConfiguration } from "@/app/components/BotConfiguration";
import {
  getBotConfig,
  updateBotConfig,
  resetBotConfig,
  getBotRuntime,
  BotRuntimeDTO,
} from "@/app/lib/services/botConfigService";
import { toast } from "sonner";
import { Button } from "@/app/components/ui/button";
import { Terminal } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/app/components/ui/dialog";

export default function SettingsPage() {
  const { isAuthorized, isLoading, redirectToLogin } = useAuthGuard({
    requireAdmin: true,
  });
  // Sonner Toaster está montado en app/layout.tsx

  const [prompt, setPrompt] = useState<string>("");
  const [uiExtra, setUiExtra] = useState<string>("");
  const [botName, setBotName] = useState<string>("");
  const [temperature, setTemperature] = useState<number>(0.7);
  const [fieldsLocked, setFieldsLocked] = useState<boolean>(true);
  // Baselines para detectar cambios reales
  const [baselineUiExtra, setBaselineUiExtra] = useState<string>("");
  const [baselineBotName, setBaselineBotName] = useState<string>("");
  const [baselineTemperature, setBaselineTemperature] = useState<number>(0.7);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [runtimeOpen, setRuntimeOpen] = useState<boolean>(false);
  const [runtimeData, setRuntimeData] = useState<BotRuntimeDTO | null>(null);
  const [runtimeLoading, setRuntimeLoading] = useState<boolean>(false);
  const [isBotActive, setIsBotActive] = useState<boolean>(false);

  useEffect(() => {
    if (!isLoading && !isAuthorized) {
      redirectToLogin();
    }
  }, [isLoading, isAuthorized, redirectToLogin]);

  // Cargar la configuración y estado del bot SOLO cuando el usuario esté autorizado (admin)
  useEffect(() => {
    const loadConfig = async () => {
      try {
        setLoading(true);
        const [cfg, state] = await Promise.all([
          getBotConfig(),
          botService.getState().catch((e) => {
            console.warn("No se pudo obtener estado del bot", e);
            return { is_active: false, message: "Estado no disponible" };
          }),
        ]);
        setPrompt(cfg.system_prompt || "");
        setUiExtra(cfg.ui_prompt_extra || "");
        setBotName(cfg.bot_name || "");
        setTemperature(cfg.temperature ?? 0.7);
        setIsBotActive(!!state.is_active);
        // Inicializar baselines para habilitar Guardar solo si hay cambios
        setBaselineUiExtra(cfg.ui_prompt_extra || "");
        setBaselineBotName(cfg.bot_name || "");
        setBaselineTemperature(cfg.temperature ?? 0.7);
      } catch (e: any) {
        setError(e?.message || "Error cargando configuración");
      } finally {
        setLoading(false);
      }
    };

    if (!isLoading && isAuthorized) {
      loadConfig();
    }
  }, [isLoading, isAuthorized]);

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      const updated = await updateBotConfig({
        system_prompt: prompt,
        temperature,
        bot_name: botName || undefined,
        ui_prompt_extra: uiExtra || undefined,
      });
      setPrompt(updated.system_prompt || "");
      setUiExtra(updated.ui_prompt_extra || "");
      setBotName(updated.bot_name || "");
      setTemperature(updated.temperature ?? temperature);
      // Actualizar baselines y re-bloquear ambos campos
      setBaselineUiExtra(updated.ui_prompt_extra || "");
      setBaselineBotName(updated.bot_name || "");
      setBaselineTemperature(updated.temperature ?? temperature);
      setFieldsLocked(true);
      toast.success("Configuración guardada. Cambios aplicados al bot.");
    } catch (e: any) {
      setError(e?.message || "Error al guardar configuración");
      toast.error(e?.message || "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    (async () => {
      try {
        setSaving(true);
        setError(null);
        const updated = await resetBotConfig();
        setUiExtra(updated.ui_prompt_extra || "");
        setBotName(updated.bot_name || "");
        // Actualizar baselines tras reset para que Guardar no quede habilitado
        setBaselineUiExtra(updated.ui_prompt_extra || "");
        setBaselineBotName(updated.bot_name || "");
        // La temperatura no cambia en reset, mantenemos baseline
        // No tocamos temperatura aquí a menos que quieras un default
        toast.success("Configuración restablecida y limpiada en backend.");
      } catch (e: any) {
        setError(e?.message || "Error al restablecer configuración");
        toast.error(`Error al restablecer: ${e?.message || e}`);
      } finally {
        setSaving(false);
      }
    })();
  };

  const effectivePreview = useMemo(() => {
    const base = prompt || "";
    const extra = uiExtra ? `\n\nInstrucciones adicionales:\n${uiExtra}` : "";
    return `${base}${extra}`;
  }, [prompt, uiExtra]);

  const isDirty = useMemo(() => {
    return (
      botName !== baselineBotName ||
      uiExtra !== baselineUiExtra ||
      temperature !== baselineTemperature
    );
  }, [botName, baselineBotName, uiExtra, baselineUiExtra, temperature, baselineTemperature]);

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

  if (!isAuthorized && !isLoading) {
    return null;
  }

  return (
    <>
      <BotConfiguration
        botName={botName}
        onBotNameChange={setBotName}
        fieldsReadOnly={fieldsLocked}
        onToggleEditFields={() => setFieldsLocked(false)}
        prompt={uiExtra}
        onPromptChange={(val) => setUiExtra(val)}
        temperature={temperature}
        onTemperatureChange={setTemperature}
        onSave={handleSave}
        onReset={handleReset}
        isLoading={loading || saving}
        error={error || undefined}
        previewText={effectivePreview}
        showPreview={true}
        canSave={isDirty}
        isBotActive={isBotActive}
        canReset={isDirty}
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

      <Dialog open={runtimeOpen} onOpenChange={setRuntimeOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Runtime del Bot</DialogTitle>
            <DialogDescription>
              Estado efectivo actual (modelo, temperatura, nombre y composición
              del prompt)
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {runtimeData ? (
              <pre className="text-sm whitespace-pre-wrap break-words bg-muted/30 p-3 rounded-md border border-border/50">
                {JSON.stringify(runtimeData, null, 2)}
              </pre>
            ) : (
              <div className="text-sm text-muted-foreground">No hay datos</div>
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
    </>
  );
}
import { botService } from "@/app/lib/services/botService";
