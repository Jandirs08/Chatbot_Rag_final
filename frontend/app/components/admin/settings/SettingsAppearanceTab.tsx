"use client";

import React, { useState, useRef, useEffect } from "react";
import Image from "next/image";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import { Button } from "@/app/components/ui/button";
import { Plus, Trash, Loader2, Pencil, User, Upload, Monitor, Smartphone, Check, Pipette } from "lucide-react";
import { toast } from "sonner";
import { API_URL } from "@/app/lib/config";
import { authenticatedUpload, authenticatedFetch } from "@/app/lib/services/authService";

// ─── Preview components ───────────────────────────────────────────────────────

type PreviewProps = {
  name: string;
  avatarUrl?: string;
  brandColor: string;
  placeholder: string;
  starters: string[];
};

function PhonePreview(p: PreviewProps) {
  return (
    <div className="w-[280px] h-[520px] bg-white border-[12px] border-foreground rounded-[2.2rem] shadow-2xl relative overflow-hidden mx-auto">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 mt-1 h-5 w-24 bg-foreground rounded-b-xl" />
      <div className="flex h-full w-full flex-col">
        <div className="h-14 flex items-center gap-3 px-4 text-white flex-shrink-0" style={{ backgroundColor: p.brandColor }}>
          {p.avatarUrl ? (
            <Image src={p.avatarUrl} alt="avatar" width={28} height={28} className="h-7 w-7 rounded-full object-cover" unoptimized />
          ) : (
            <div className="h-7 w-7 rounded-full bg-white/90 flex items-center justify-center text-foreground font-semibold text-xs">
              {p.name.charAt(0) || "A"}
            </div>
          )}
          <span className="text-sm font-semibold">{p.name || "Asistente IA"}</span>
        </div>
        <div className="flex-1 bg-muted/40 p-3 space-y-2 overflow-hidden">
          {p.starters.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {p.starters.slice(0, 4).map((s, i) => (
                <div key={i} className="rounded-full border px-2.5 py-1 bg-white text-foreground text-[11px]">{s}</div>
              ))}
            </div>
          )}
        </div>
        <div className="h-14 bg-white border-t flex items-center px-3 gap-2 flex-shrink-0">
          <div className="flex-1 h-9 rounded-full border bg-muted/40 flex items-center px-3 text-muted-foreground text-xs">
            <span className="truncate">{p.placeholder}</span>
          </div>
          <div className="h-9 w-9 rounded-full flex-shrink-0" style={{ backgroundColor: p.brandColor }} />
        </div>
      </div>
    </div>
  );
}

function DesktopPreview(p: PreviewProps) {
  return (
    <div className="w-full h-full flex items-end justify-end p-6">
      <div className="w-[320px] h-[440px] bg-white rounded-xl shadow-2xl border overflow-hidden flex flex-col">
        <div className="h-12 flex items-center gap-3 px-4 text-white flex-shrink-0" style={{ backgroundColor: p.brandColor }}>
          {p.avatarUrl ? (
            <Image src={p.avatarUrl} alt="avatar" width={28} height={28} className="h-7 w-7 rounded-full object-cover" unoptimized />
          ) : (
            <div className="h-7 w-7 rounded-full bg-white/90 flex items-center justify-center text-foreground font-semibold text-xs">
              {p.name.charAt(0) || "A"}
            </div>
          )}
          <span className="text-sm font-semibold">{p.name || "Asistente IA"}</span>
        </div>
        <div className="flex-1 bg-muted/40 p-3 space-y-2 overflow-hidden">
          {p.starters.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {p.starters.slice(0, 3).map((s, i) => (
                <div key={i} className="rounded-full border px-2.5 py-1 bg-white text-foreground text-[11px]">{s}</div>
              ))}
            </div>
          )}
        </div>
        <div className="h-14 bg-white border-t flex items-center px-3 gap-2 flex-shrink-0">
          <div className="flex-1 h-9 rounded-md border bg-muted/40 flex items-center px-3 text-muted-foreground text-xs">
            <span className="truncate">{p.placeholder}</span>
          </div>
          <div className="h-9 w-9 rounded-md flex-shrink-0" style={{ backgroundColor: p.brandColor }} />
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface SettingsAppearanceTabProps {
  isLoading: boolean;
  config: {
    name: string;
    avatarUrl: string;
    brandColor: string;
    placeholder: string;
    starters: string[];
  };
  setConfig: React.Dispatch<React.SetStateAction<{
    name: string;
    avatarUrl: string;
    brandColor: string;
    placeholder: string;
    starters: string[];
  }>>;
  appearanceLocked: boolean;
  setAppearanceLocked: (val: boolean) => void;
  baseline: {
    name: string;
    avatarUrl: string;
    brandColor: string;
    placeholder: string;
    starters: string[];
  };
  presetColors: string[];
  saving: boolean;
  appearanceIsDirty: boolean;
  handleSave: () => void;
}

export function SettingsAppearanceTab({
  isLoading,
  config,
  setConfig,
  appearanceLocked,
  setAppearanceLocked,
  baseline,
  presetColors,
  saving,
  appearanceIsDirty,
  handleSave,
}: SettingsAppearanceTabProps) {
  const [previewMode, setPreviewMode] = useState<"mobile" | "desktop">("mobile");
  const [focusIdx, setFocusIdx] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const startersRefs = useRef<(HTMLInputElement | null)[]>([]);
  const colorPickerRef = useRef<HTMLInputElement>(null);
  const keyCounterRef = useRef(0);
  const makeKey = () => String(keyCounterRef.current++);
  const [starterKeys, setStarterKeys] = useState<string[]>(() =>
    config.starters.map(makeKey)
  );

  useEffect(() => {
    setStarterKeys(baseline.starters.map(makeKey));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseline]);

  useEffect(() => {
    if (focusIdx !== null && startersRefs.current[focusIdx]) {
      startersRefs.current[focusIdx]?.focus();
      startersRefs.current[focusIdx]?.select();
      setFocusIdx(null);
    }
  }, [focusIdx, config.starters]);

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* ── Form column ─────────────────────────────────────────────────────── */}
      <div className="w-full lg:w-[420px] xl:w-[460px] flex-shrink-0 flex flex-col border-r border-border">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-border flex-shrink-0">
          <div>
            <h2 className="text-base font-semibold text-foreground">Apariencia</h2>
            <p className="text-sm text-muted-foreground mt-0.5">Identidad visual del asistente.</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setAppearanceLocked(!appearanceLocked)}
            aria-label={appearanceLocked ? "Editar apariencia" : "Bloquear edición"}
            className="text-muted-foreground hover:text-foreground"
          >
            <Pencil className="w-4 h-4" />
          </Button>
        </div>

        {/* Scrollable form */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">

          {/* ── Card 1: Identidad ─────────────────────────────────────────────── */}
          <div className="glass rounded-xl border border-border/60 overflow-hidden" style={{ boxShadow: "var(--shadow-card)" }}>
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border/60 bg-accent-violet/5">
              <User className="w-3.5 h-3.5 text-accent-violet flex-shrink-0" aria-hidden="true" />
              <span className="text-xs font-semibold text-foreground">Identidad</span>
            </div>
            <div className="px-4 py-4 space-y-4">

          {/* Logo / Avatar */}
          <div className="space-y-3">
            <p className="text-[11px] font-medium text-muted-foreground">Logo del asistente</p>
            <div className="flex items-center gap-5">
              <div className="relative flex-shrink-0">
                <button
                  type="button"
                  aria-label="Subir imagen del asistente"
                  onClick={() => !appearanceLocked && !uploading && document.getElementById("avatar-file")?.click()}
                  className={`w-20 h-20 rounded-xl overflow-hidden border-2 border-border bg-muted/50 flex items-center justify-center relative group transition-all ${
                    !appearanceLocked && !uploading ? "cursor-pointer hover:border-primary/50" : "cursor-default"
                  }`}
                >
                  {config.avatarUrl ? (
                    <Image src={config.avatarUrl} alt="avatar" width={80} height={80} className="h-full w-full object-cover" unoptimized />
                  ) : (
                    <User className="w-8 h-8 text-muted-foreground/40" />
                  )}
                  {!appearanceLocked && (
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      {uploading ? (
                        <Loader2 className="w-5 h-5 text-white animate-spin" />
                      ) : (
                        <Upload className="w-5 h-5 text-white" />
                      )}
                    </div>
                  )}
                </button>
                <Input
                  id="avatar-file"
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={appearanceLocked || uploading}
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    if (!file.type.startsWith("image/")) {
                      toast.error("El archivo debe ser una imagen");
                      return;
                    }
                    if (file.size > 5 * 1024 * 1024) {
                      toast.error("La imagen debe pesar menos de 5 MB");
                      return;
                    }
                    setUploading(true);
                    try {
                      const formData = new FormData();
                      formData.append("file", file);
                      const res = await authenticatedUpload(`${API_URL}/assets/logo`, { method: "POST", body: formData });
                      if (res.ok) {
                        setConfig((c) => ({ ...c, avatarUrl: `${API_URL}/assets/logo?ts=${Date.now()}` }));
                        toast.success("Logo subido");
                      } else {
                        toast.error("Error al subir el logo");
                      }
                    } catch {
                      toast.error("Error de conexión");
                    } finally {
                      setUploading(false);
                    }
                  }}
                />
              </div>
              <div className="space-y-1.5 text-sm text-muted-foreground">
                <p>PNG, JPG o WEBP. Máx. 5 MB.</p>
                <p>Recomendado: 256×256 px o mayor.</p>
                {config.avatarUrl && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={appearanceLocked}
                    className="text-destructive hover:text-destructive hover:bg-destructive/10 h-7 text-xs px-2 -ml-2"
                    onClick={async () => {
                      try {
                        const res = await authenticatedFetch(`${API_URL}/assets/logo`, { method: "DELETE" });
                        if (!res.ok) throw new Error();
                        setConfig((c) => ({ ...c, avatarUrl: "" }));
                        toast.success("Logo eliminado");
                      } catch {
                        toast.error("No se pudo eliminar el logo");
                      }
                    }}
                  >
                    Eliminar
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* Nombre */}
          <div className="space-y-2">
            <p className="text-[11px] font-medium text-muted-foreground">Nombre del asistente</p>
            <Input
              id="bot-name"
              value={config.name}
              disabled={appearanceLocked}
              onChange={(e) => setConfig((c) => ({ ...c, name: e.target.value }))}
              placeholder="Ej. Mi Asistente Virtual"
              className="h-9"
            />
          </div>

            </div>{/* /card-1 body */}
          </div>{/* /card-1 */}

          {/* ── Card 2: Color ─────────────────────────────────────────────────── */}
          <div className="glass rounded-xl border border-border/60 overflow-hidden" style={{ boxShadow: "var(--shadow-card)" }}>
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border/60 bg-accent-cyan/5">
              <Pipette className="w-3.5 h-3.5 text-accent-cyan flex-shrink-0" aria-hidden="true" />
              <span className="text-xs font-semibold text-foreground">Color de marca</span>
            </div>
            <div className="px-4 py-4">
          {/* Color de marca */}
          <div className="space-y-3">
            <p className="text-[11px] font-medium text-muted-foreground sr-only">Color de marca</p>

            {/* Preset swatches */}
            <div className="grid grid-cols-6 gap-2">
              {presetColors.map((col) => {
                const isSelected = config.brandColor === col;
                return (
                  <button
                    key={col}
                    type="button"
                    onClick={() => !appearanceLocked && setConfig((c) => ({ ...c, brandColor: col }))}
                    disabled={appearanceLocked}
                    aria-label={`Color ${col}`}
                    aria-pressed={isSelected}
                    className={`relative h-10 rounded-xl transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${
                      isSelected ? "scale-110 shadow-md" : "hover:scale-105 hover:shadow-sm"
                    } ${appearanceLocked ? "cursor-default" : "cursor-pointer"}`}
                    style={{
                      backgroundColor: col,
                      boxShadow: isSelected ? `0 0 0 2px white, 0 0 0 4px ${col}` : undefined,
                    }}
                  >
                    {isSelected && (
                      <span className="absolute inset-0 flex items-center justify-center">
                        <Check className="w-4 h-4 drop-shadow-sm" style={{ color: "rgba(255,255,255,0.95)" }} />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Custom color + hex input row */}
            <div className="flex items-center gap-2 mt-1">
              {/* Custom picker button */}
              <button
                type="button"
                onClick={() => !appearanceLocked && colorPickerRef.current?.click()}
                disabled={appearanceLocked}
                aria-label="Elegir color personalizado"
                className={`flex items-center gap-2 h-10 px-3 rounded-xl border transition-all duration-150 text-xs font-medium ${
                  !presetColors.includes(config.brandColor)
                    ? "border-primary bg-primary/5 text-primary shadow-sm"
                    : "border-border bg-muted/40 text-muted-foreground hover:border-primary/50 hover:text-foreground"
                } ${appearanceLocked ? "cursor-default opacity-60" : "cursor-pointer"}`}
              >
                {/* Mini color swatch */}
                <span
                  className="w-5 h-5 rounded-md border border-white/20 shadow-inner flex-shrink-0"
                  style={{ backgroundColor: config.brandColor }}
                />
                <Pipette className="w-3.5 h-3.5 flex-shrink-0" />
                <span>Personalizado</span>
              </button>
              <input
                ref={colorPickerRef}
                type="color"
                value={config.brandColor}
                onChange={(e) => setConfig((c) => ({ ...c, brandColor: e.target.value }))}
                className="sr-only"
                disabled={appearanceLocked}
                aria-label="Selector de color personalizado"
              />

              {/* Hex input */}
              <div className="relative flex items-center flex-1">
                <span className="absolute left-3 text-muted-foreground/50 text-xs select-none font-mono">#</span>
                <Input
                  value={config.brandColor.startsWith("#") ? config.brandColor.substring(1).toUpperCase() : config.brandColor.toUpperCase()}
                  onChange={(e) => {
                    const val = e.target.value.replace(/[^0-9a-fA-F]/g, "");
                    if (val.length <= 6) setConfig((c) => ({ ...c, brandColor: `#${val}` }));
                  }}
                  className="pl-6 h-10 font-mono uppercase text-sm rounded-xl w-full"
                  maxLength={6}
                  placeholder="HEX"
                  disabled={appearanceLocked}
                />
              </div>
            </div>

          </div>
            </div>{/* /card-2 body */}
          </div>{/* /card-2 */}

          {/* ── Card 3: Comportamiento ────────────────────────────────────────── */}
          <div className="glass rounded-xl border border-border/60 overflow-hidden" style={{ boxShadow: "var(--shadow-card)" }}>
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border/60 bg-muted/40">
              <Monitor className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" aria-hidden="true" />
              <span className="text-xs font-semibold text-foreground">Comportamiento</span>
            </div>
            <div className="px-4 py-4 space-y-4">

          {/* Placeholder */}
          <div className="space-y-2">
            <p className="text-[11px] font-medium text-muted-foreground">Placeholder del input</p>
            <Input
              id="placeholder"
              value={config.placeholder}
              disabled={appearanceLocked}
              onChange={(e) => setConfig((c) => ({ ...c, placeholder: e.target.value }))}
              placeholder="Ej. Escribe tu mensaje..."
              className="h-9"
            />
          </div>

          {/* Atajos de conversación */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-medium text-muted-foreground">Atajos de conversación</p>
                <p className="text-[11px] text-muted-foreground/70 mt-0.5">Sugerencias rápidas para iniciar el chat. Máx. 6.</p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  if (config.starters.length < 6) {
                    setConfig((c) => ({ ...c, starters: [...c.starters, "Nuevo atajo"] }));
                    setStarterKeys((k) => [...k, makeKey()]);
                    setFocusIdx(config.starters.length);
                  }
                }}
                disabled={config.starters.length >= 6 || appearanceLocked}
                className="h-8 gap-1.5 text-xs"
              >
                <Plus className="w-3.5 h-3.5" /> Agregar
              </Button>
            </div>

            {config.starters.length === 0 ? (
              <div className="text-center py-8 border border-dashed border-border rounded-lg text-muted-foreground text-sm bg-muted/30">
                Sin atajos configurados.
              </div>
            ) : (
              <div className="space-y-2">
                {config.starters.map((s, idx) => (
                  <div key={starterKeys[idx] ?? String(idx)} className="flex items-center gap-2 group">
                    <Input
                      ref={(el) => (startersRefs.current[idx] = el)}
                      value={s}
                      disabled={appearanceLocked}
                      className="flex-1 h-9 text-sm"
                      onChange={(e) =>
                        setConfig((c) => ({
                          ...c,
                          starters: c.starters.map((t, i) => (i === idx ? e.target.value : t)),
                        }))
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          if (config.starters.length < 6) {
                            setConfig((c) => ({ ...c, starters: [...c.starters, "Nuevo atajo"] }));
                            setStarterKeys((k) => [...k, makeKey()]);
                            setFocusIdx(config.starters.length);
                          }
                        }
                      }}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={appearanceLocked}
                      onClick={() => {
                        setConfig((c) => ({ ...c, starters: c.starters.filter((_, i) => i !== idx) }));
                        setStarterKeys((k) => k.filter((_, i) => i !== idx));
                      }}
                      className="h-9 w-9 text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 md:opacity-0 md:group-hover:opacity-100 transition-opacity flex-shrink-0"
                    >
                      <Trash className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
            </div>{/* /card-3 body */}
          </div>{/* /card-3 */}
        </div>

        {/* Sticky footer */}
        <div className="flex-shrink-0 border-t border-border bg-card/80 backdrop-blur-sm px-6 py-4 flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {appearanceIsDirty ? (
              <span className="text-warning">Cambios sin guardar</span>
            ) : (
              "Todo actualizado"
            )}
          </span>
          <Button
            type="button"
            onClick={handleSave}
            disabled={saving || !appearanceIsDirty}
            className="gradient-primary hover:opacity-90 h-9"
          >
            {saving ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Guardando…
              </span>
            ) : (
              "Guardar cambios"
            )}
          </Button>
        </div>
      </div>

      {/* ── Preview column ───────────────────────────────────────────────────── */}
      <div className="hidden lg:flex flex-1 flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-border flex-shrink-0">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Vista previa</p>
          <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
            <button
              type="button"
              onClick={() => setPreviewMode("mobile")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                previewMode === "mobile"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              aria-pressed={previewMode === "mobile"}
            >
              <Smartphone className="w-3.5 h-3.5" />
              Móvil
            </button>
            <button
              type="button"
              onClick={() => setPreviewMode("desktop")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                previewMode === "desktop"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              aria-pressed={previewMode === "desktop"}
            >
              <Monitor className="w-3.5 h-3.5" />
              Desktop
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-hidden relative bg-muted/20">
          <div className="absolute inset-0 bg-[radial-gradient(circle,_hsl(var(--border))_1px,_transparent_1px)] [background-size:20px_20px] opacity-60" />
          <div className="relative h-full flex items-center justify-center p-6">
            {previewMode === "mobile" ? (
              <PhonePreview
                name={config.name || baseline.name}
                avatarUrl={config.avatarUrl}
                brandColor={config.brandColor}
                placeholder={config.placeholder}
                starters={config.starters}
              />
            ) : (
              <DesktopPreview
                name={config.name || baseline.name}
                avatarUrl={config.avatarUrl}
                brandColor={config.brandColor}
                placeholder={config.placeholder}
                starters={config.starters}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
