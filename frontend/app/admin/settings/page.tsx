"use client";
import React, { useMemo, useState } from "react";
import Image from "next/image";
import useSWR from "swr";
import { useRequireAdmin } from "@/app/hooks/useAuthGuard";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/app/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card";
import { Input } from "@/app/components/ui/input";
import { Textarea } from "@/app/components/ui/textarea";
import { Label } from "@/app/components/ui/label";
import { Button } from "@/app/components/ui/button";
import { Plus, Trash, Loader2, AlertTriangle, CheckCircle2, Terminal } from "lucide-react";
import { toast } from "sonner";
import { getBotConfig, updateBotConfig, resetBotConfig, getBotRuntime, type BotConfigDTO, type BotRuntimeDTO } from "@/app/lib/services/botConfigService";
import { Slider } from "@/app/components/ui/slider";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/app/components/ui/dialog";
import { Progress } from "@/app/components/ui/progress";
import { Alert, AlertDescription } from "@/app/components/ui/alert";
import { API_URL } from "@/app/lib/config";
import { authenticatedFetch, TokenManager } from "@/app/lib/services/authService";
import { BotConfiguration } from "@/app/components/BotConfiguration";
import { botService } from "@/app/lib/services/botService";

export default function AdminSettingsPage() {
  const { isAuthorized } = useRequireAdmin();
  const [activeTab, setActiveTab] = useState<"appearance" | "brain" | "system">("appearance");
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
    { revalidateOnFocus: true }
  );
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
  const [prompt, setPrompt] = useState<string>("");
  const [temperature, setTemperature] = useState<number>(0.7);
  const [uiExtra, setUiExtra] = useState<string>("");
  const [fieldsLocked, setFieldsLocked] = useState<boolean>(true);
  const [baselineUiExtra, setBaselineUiExtra] = useState<string>("");
  const [baselineTemperature, setBaselineTemperature] = useState<number>(0.7);
  const [savingBrain, setSavingBrain] = useState<boolean>(false);
  const [errorBrain, setErrorBrain] = useState<string | null>(null);
  const [isBotActive, setIsBotActive] = useState<boolean>(false);
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [progress, setProgress] = useState(0);
  const [processing, setProcessing] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState<"mobile" | "desktop">("mobile");
  const timerRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    if (typeof window !== "undefined") {
      const hash = window.location.hash.replace("#", "");
      if (hash === "appearance" || hash === "brain" || hash === "system") {
        setActiveTab(hash as any);
      }
    }
    if (data) {
      setPrompt(data.system_prompt || "");
      setTemperature(typeof data.temperature === "number" ? data.temperature : 0.7);
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
        } catch (_) {}
        return txt;
      };
      setUiExtra(sanitizeUiExtra(data.ui_prompt_extra));
      setBaselineUiExtra(sanitizeUiExtra(data.ui_prompt_extra));
      setBaselineTemperature(typeof data.temperature === "number" ? data.temperature : 0.7);
      botService
        .getState()
        .then((st) => setIsBotActive(!!st.is_active))
        .catch(() => setIsBotActive(false));
    }
  }, [data]);

  React.useEffect(() => {
    if (!open) {
      setConfirmText("");
      setProgress(0);
      setProcessing(false);
      setSuccess(false);
      setError(null);
      if (timerRef.current) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  }, [open]);

  const presetColors = ["#0EA5E9", "#22C55E", "#EF4444", "#F59E0B", "#8B5CF6", "#06B6D4"];

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

  const brainIsDirty = useMemo(() => {
    return (
      uiExtra !== baselineUiExtra ||
      temperature !== baselineTemperature
    );
  }, [uiExtra, baselineUiExtra, temperature, baselineTemperature]);

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
        } catch (_) {}
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
      <div className="h-[calc(100vh-64px)] flex items-center justify-center">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Cargando configuración…
        </div>
      </div>
    );
  }

  const PhonePreview = (p: { name: string; avatarUrl?: string; brandColor: string; placeholder: string; starters: string[] }) => (
    <div className="w-[320px] h-[600px] bg-white border-[14px] border-gray-900 rounded-[2.5rem] shadow-2xl relative overflow-hidden mx-auto">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 mt-1 h-6 w-28 bg-gray-900 rounded-b-2xl" />
      <div className="flex h-full w-full flex-col">
        <div className="h-16 flex items-center justify-between px-4 text-white" style={{ backgroundColor: p.brandColor }}>
          <div className="flex items-center gap-3">
            {p.avatarUrl ? (
              <Image src={p.avatarUrl} alt="avatar" width={32} height={32} className="rounded-full object-cover" />
            ) : (
              <div className="h-8 w-8 rounded-full bg-white/90 flex items-center justify-center text-gray-700 font-semibold">{p.name.charAt(0) || "A"}</div>
            )}
            <div className="text-sm font-semibold">{p.name || "Asistente IA"}</div>
          </div>
          <div className="h-8 w-8 rounded-full bg-white/20" />
        </div>
        <div className="flex-1 bg-gray-50 p-3 overflow-y-auto space-y-3">
          {/* Bienvenida eliminada */}
          {p.starters.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {p.starters.map((s, i) => (
                <div key={`${s}-${i}`} className="rounded-full border px-3 py-1 bg-white text-gray-700 text-xs">{s}</div>
              ))}
            </div>
          )}
        </div>
        <div className="h-16 bg-white border-t flex items-center px-3">
          <div className="flex-1 h-10 rounded-full border bg-gray-50 flex items-center px-4 text-gray-500 text-sm">
            <span className="truncate">{p.placeholder}</span>
          </div>
          <div className="ml-2 h-10 w-10 rounded-full bg-gray-200" />
        </div>
      </div>
    </div>
  );

  const DesktopPreview = (p: { name: string; avatarUrl?: string; brandColor: string; placeholder: string; starters: string[] }) => (
    <div className="relative w-full h-full">
      <div className="absolute inset-0 bg-[radial-gradient(circle,_rgba(226,232,240,0.6)_1px,_transparent_1px)] [background-size:16px_16px]" />
      <div className="absolute bottom-8 right-8 w-[380px] h-[520px] bg-white rounded-xl shadow-2xl border overflow-hidden">
        <div className="h-14 flex items-center justify-between px-4 text-white" style={{ backgroundColor: p.brandColor }}>
          <div className="flex items-center gap-3">
            {p.avatarUrl ? (
              <Image src={p.avatarUrl} alt="avatar" width={32} height={32} className="rounded-full object-cover" />
            ) : (
              <div className="h-8 w-8 rounded-full bg-white/90 flex items-center justify-center text-gray-700 font-semibold">{p.name.charAt(0) || "A"}</div>
            )}
            <div className="text-sm font-semibold">{p.name || "Asistente IA"}</div>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-white/70" />
            <div className="h-2 w-2 rounded-full bg-white/70" />
            <div className="h-2 w-2 rounded-full bg-white/70" />
          </div>
        </div>
        <div className="flex-1 bg-gray-50 p-3 overflow-y-auto space-y-3">
          {/* Bienvenida eliminada */}
          {p.starters.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {p.starters.map((s, i) => (
                <div key={`${s}-${i}`} className="rounded-full border px-3 py-1 bg-white text-gray-700 text-xs">{s}</div>
              ))}
            </div>
          )}
        </div>
        <div className="h-16 bg-white border-t flex items-center px-3">
          <div className="flex-1 h-10 rounded-md border bg-gray-50 flex items-center px-4 text-gray-500 text-sm">
            <span className="truncate">{p.placeholder}</span>
          </div>
          <div className="ml-2 h-10 w-10 rounded-md bg-gray-200" />
        </div>
      </div>
    </div>
  );

  return (
    <div className="h-[calc(100vh-64px)] flex flex-col overflow-hidden">
      <Tabs defaultValue={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="flex-1 min-h-0 flex flex-col">
        <TabsList className="w-full">
          <TabsTrigger value="appearance">Apariencia</TabsTrigger>
          <TabsTrigger value="brain">Cerebro</TabsTrigger>
          <TabsTrigger value="system">Sistema</TabsTrigger>
        </TabsList>
        <TabsContent value="appearance" className="flex-1 min-h-0">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-full">
            <div className="lg:col-span-5 h-full overflow-y-auto">
              <div className="px-6 pt-6">
                <h2 className="text-base font-semibold">Apariencia y Comportamiento</h2>
              </div>
              <Card className="mt-4">
                <CardContent className="space-y-6">
                  {isLoading ? (
                    <div className="flex items-center gap-2 text-sm py-4"><Loader2 className="h-4 w-4 animate-spin" /> Cargando configuración…</div>
                  ) : (
                    <>
                      <div className="space-y-3">
                        <div className="space-y-2">
                          <Label htmlFor="bot-name">Nombre del Bot</Label>
                          <Input id="bot-name" value={config.name} onChange={(e) => setConfig((c) => ({ ...c, name: e.target.value }))} />
                        </div>
                        <div className="grid grid-cols-[1fr_auto] items-end gap-3">
                          <div className="space-y-2">
                            <Label htmlFor="avatar-file">Logo/Avatar</Label>
                            <Input
                              id="avatar-file"
                              type="file"
                              accept="image/*"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (!file) return;
                                try {
                                  const xhr = new XMLHttpRequest();
                                  const url = `${API_URL}/assets/logo`;
                                  xhr.open("POST", url);
                                  const token = TokenManager.getAccessToken();
                                  if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
                                  xhr.onreadystatechange = () => {
                                    if (xhr.readyState === XMLHttpRequest.DONE) {
                                      if (xhr.status >= 200 && xhr.status < 300) {
                                        const ts = Date.now();
                                        setConfig((c) => ({ ...c, avatarUrl: `${API_URL}/assets/logo?ts=${ts}` }));
                                        toast.success("Logo subido");
                                      } else {
                                        let detail = "Error al subir el logo";
                                        try {
                                          const json = JSON.parse(xhr.responseText);
                                          detail = json?.detail || detail;
                                        } catch {}
                                        toast.error(detail);
                                      }
                                    }
                                  };
                                  xhr.onerror = () => {
                                    toast.error("Error de red al subir el logo");
                                  };
                                  const formData = new FormData();
                                  formData.append("file", file);
                                  xhr.send(formData);
                                } catch (err: any) {
                                  toast.error(err?.message || "Error inesperado");
                                }
                              }}
                            />
                            {config.avatarUrl && (
                              <div className="flex items-center gap-2 mt-2">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={async () => {
                                    try {
                                      const token = TokenManager.getAccessToken();
                                      const res = await fetch(`${API_URL}/assets/logo`, {
                                        method: "DELETE",
                                        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
                                      });
                                      if (!res.ok) {
                                        const body = await res.json().catch(() => ({}));
                                        throw new Error(String(body?.detail || `Error ${res.status}`));
                                      }
                                      setConfig((c) => ({ ...c, avatarUrl: "" }));
                                      toast.success("Logo eliminado");
                                    } catch (err: any) {
                                      toast.error(err?.message || "No se pudo eliminar el logo");
                                    }
                                  }}
                                >
                                  Eliminar logo
                                </Button>
                              </div>
                            )}
                          </div>
                          <div className="h-11 w-11 rounded-full border overflow-hidden bg-gray-100 flex items-center justify-center">
                            {config.avatarUrl ? (
                              <Image src={config.avatarUrl} alt="avatar" width={44} height={44} className="object-cover" />
                            ) : (
                              <span className="text-xs text-muted-foreground">N/A</span>
                            )}
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="brand-color">Color Primario</Label>
                          <div className="flex items-center gap-3">
                            <Input id="brand-color" type="color" value={config.brandColor} onChange={(e) => setConfig((c) => ({ ...c, brandColor: e.target.value }))} className="h-11 w-16 p-1" />
                            <div className="flex items-center gap-2">
                              {presetColors.map((col) => (
                                <button key={col} aria-label={col} onClick={() => setConfig((c) => ({ ...c, brandColor: col }))} className="h-8 w-8 rounded-full ring-2 ring-offset-2 ring-gray-200" style={{ backgroundColor: col }} />
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-3">
                        <div className="space-y-2">
                          <Label htmlFor="placeholder">Placeholder</Label>
                          <Input id="placeholder" value={config.placeholder} onChange={(e) => setConfig((c) => ({ ...c, placeholder: e.target.value }))} />
                        </div>
                      </div>

                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">Atajos Rápidos</span>
                          <Button type="button" size="sm" onClick={() => setConfig((c) => ({ ...c, starters: c.starters.length >= 6 ? c.starters : [...c.starters, "Nuevo atajo"] }))} disabled={config.starters.length >= 6} className="gap-2">
                            <Plus className="w-4 h-4" /> Agregar
                          </Button>
                        </div>
                        <div className="space-y-2">
                          {config.starters.map((s, idx) => (
                            <div key={idx} className="flex items-center gap-2">
                              <Input value={s} onChange={(e) => setConfig((c) => ({ ...c, starters: c.starters.map((t, i) => (i === idx ? e.target.value : t)) }))} />
                              <Button type="button" variant="outline" size="icon" onClick={() => setConfig((c) => ({ ...c, starters: c.starters.filter((_, i) => i !== idx) }))} className="h-10 w-10">
                                <Trash className="w-4 h-4" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="pt-2">
                        <Button type="button" className="w-full" onClick={handleSave} disabled={saving}>
                          {saving ? (
                            <span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Guardando…</span>
                          ) : (
                            "Guardar Cambios"
                          )}
                        </Button>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="lg:col-span-7 h-full">
              <div className="relative h-full">
                <div className="sticky top-0 h-full">
                  <div className="border rounded-md bg-white/60 backdrop-blur-sm">
                    <div className="flex items-center justify-between px-4 py-2 border-b">
                      <div className="text-sm font-medium">Preview</div>
                      <Tabs defaultValue={previewMode} onValueChange={(v) => setPreviewMode(v as any)}>
                        <TabsList className="h-9">
                          <TabsTrigger value="mobile">📱 Móvil</TabsTrigger>
                          <TabsTrigger value="desktop">💻 Desktop</TabsTrigger>
                        </TabsList>
                      </Tabs>
                    </div>
                    <div className="relative h-[640px]">
                      <div className="absolute inset-0 bg-[radial-gradient(circle,_rgba(226,232,240,0.6)_1px,_transparent_1px)] [background-size:16px_16px]" />
                      <div className="relative h-full flex items-center justify-center p-4">
                        {previewMode === "mobile" ? (
                          <PhonePreview name={config.name || baseline.name} avatarUrl={config.avatarUrl} brandColor={config.brandColor} placeholder={config.placeholder} starters={config.starters} />
                        ) : (
                          <DesktopPreview name={config.name || baseline.name} avatarUrl={config.avatarUrl} brandColor={config.brandColor} placeholder={config.placeholder} starters={config.starters} />
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>
        <TabsContent value="brain" className="flex-1 min-h-0">
          <div className="p-6 h-full overflow-y-auto">
            <BotConfiguration
              showBotName={false}
              fieldsReadOnly={fieldsLocked}
              onToggleEditFields={() => setFieldsLocked(false)}
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
        </TabsContent>

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
        <TabsContent value="system" className="flex-1 min-h-0">
          <div className="p-6 h-full overflow-y-auto">
            <Card className="border-red-200 bg-red-50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-red-700">
                  <AlertTriangle className="w-5 h-5" /> Zona de Peligro
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div className="text-sm text-red-700">Eliminar Historial de Conversaciones</div>
                  <Dialog open={open} onOpenChange={setOpen}>
                    <DialogTrigger asChild>
                      <Button variant="destructive" className="gap-2" disabled={isLoading}>
                        <Trash className="w-4 h-4" /> Eliminar todo
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Confirmar eliminación</DialogTitle>
                        {!processing && !success && !error && (
                          <DialogDescription>
                            <span>Esta acción eliminará permanentemente todos los mensajes y conversaciones. Esta acción no se puede deshacer.</span>
                          </DialogDescription>
                        )}
                      </DialogHeader>
                      {(processing || success || error) && (
                        <div className="space-y-3">
                          <Progress value={progress} />
                          {success && (
                            <div className="flex items-center gap-2 text-green-700 text-sm">
                              <CheckCircle2 className="w-5 h-5" /> Base de datos limpia
                            </div>
                          )}
                          {error && (
                            <Alert variant="destructive">
                              <AlertDescription className="flex items-center gap-2">
                                <AlertTriangle className="w-4 h-4" /> {error}
                              </AlertDescription>
                            </Alert>
                          )}
                        </div>
                      )}
                      {!processing && !success && (
                        <div className="space-y-3">
                          <div className="space-y-2">
                            <label className="text-sm font-medium" htmlFor="confirm">Escribe ELIMINAR para continuar</label>
                            <Input id="confirm" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="ELIMINAR" />
                          </div>
                          <DialogFooter>
                            <Button variant="destructive" className="w-full" disabled={confirmText.trim().toUpperCase() !== "ELIMINAR" || isLoading} onClick={async () => {
                              try {
                                setProcessing(true);
                                setError(null);
                                setSuccess(false);
                                if (timerRef.current) window.clearInterval(timerRef.current);
                                setProgress(5);
                                timerRef.current = window.setInterval(() => {
                                  setProgress((p) => (p + 3 >= 90 ? 90 : p + 3));
                                }, 250);
                                const res = await authenticatedFetch(`${API_URL}/chat/history`, { method: "DELETE" });
                                const body = await res.json().catch(() => ({}));
                                if (!res.ok) {
                                  if (timerRef.current) { window.clearInterval(timerRef.current); timerRef.current = null; }
                                  setProgress(100);
                                  setProcessing(false);
                                  setError(String(body?.detail || body?.message || `Error ${res.status}`));
                                  return;
                                }
                                if (timerRef.current) { window.clearInterval(timerRef.current); timerRef.current = null; }
                                setProgress(100);
                                setSuccess(true);
                                setProcessing(false);
                              } catch (e: any) {
                                if (timerRef.current) { window.clearInterval(timerRef.current); timerRef.current = null; }
                                setProgress(100);
                                setProcessing(false);
                                setError(String(e?.message || "Error inesperado al eliminar"));
                              }
                            }}>Eliminar definitivamente</Button>
                          </DialogFooter>
                        </div>
                      )}
                    </DialogContent>
                  </Dialog>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
