"use client";

import React, { useState, useRef, useEffect } from "react";
import Image from "next/image";
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "@/app/components/ui/tabs";
import {
  Card,
  CardContent,
} from "@/app/components/ui/card";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import { Button } from "@/app/components/ui/button";
import {
  Plus,
  Trash,
  Loader2,
  Pencil,
  Palette,
  User,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { API_URL } from "@/app/lib/config";
import {
  authenticatedUpload,
  authenticatedFetch,
} from "@/app/lib/services/authService";

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
  const startersRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (focusIdx !== null && startersRefs.current[focusIdx]) {
      startersRefs.current[focusIdx]?.focus();
      startersRefs.current[focusIdx]?.select();
      setFocusIdx(null);
    }
  }, [focusIdx, config.starters]);

  const PhonePreview = (p: {
    name: string;
    avatarUrl?: string;
    brandColor: string;
    placeholder: string;
    starters: string[];
  }) => (
    <div className="w-[320px] h-[600px] bg-white border-[14px] border-gray-900 rounded-[2.5rem] shadow-2xl relative overflow-hidden mx-auto">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 mt-1 h-6 w-28 bg-gray-900 rounded-b-2xl" />
      <div className="flex h-full w-full flex-col">
        <div
          className="h-16 flex items-center justify-between px-4 text-white"
          style={{ backgroundColor: p.brandColor }}
        >
          <div className="flex items-center gap-3">
            {p.avatarUrl ? (
              <Image
                src={p.avatarUrl}
                alt="avatar"
                width={32}
                height={32}
                className="h-8 w-8 rounded-full object-cover"
                unoptimized
              />
            ) : (
              <div className="h-8 w-8 rounded-full bg-white/90 flex items-center justify-center text-gray-700 font-semibold">
                {p.name.charAt(0) || "A"}
              </div>
            )}
            <div className="text-sm font-semibold">
              {p.name || "Asistente IA"}
            </div>
          </div>
          <div className="h-8 w-8 rounded-full bg-white/20" />
        </div>
        <div className="flex-1 bg-gray-50 p-3 overflow-y-auto space-y-3">
          {p.starters.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {p.starters.map((s, i) => (
                <div
                  key={`${s}-${i}`}
                  className="rounded-full border px-3 py-1 bg-white text-gray-700 text-xs"
                >
                  {s}
                </div>
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

  const DesktopPreview = (p: {
    name: string;
    avatarUrl?: string;
    brandColor: string;
    placeholder: string;
    starters: string[];
  }) => (
    <div className="relative w-full h-full">
      <div className="absolute inset-0 bg-[radial-gradient(circle,_rgba(226,232,240,0.6)_1px,_transparent_1px)] [background-size:16px_16px]" />
      <div className="absolute bottom-8 right-8 w-[380px] h-[520px] bg-white rounded-xl shadow-2xl border overflow-hidden">
        <div
          className="h-14 flex items-center justify-between px-4 text-white"
          style={{ backgroundColor: p.brandColor }}
        >
          <div className="flex items-center gap-3">
            {p.avatarUrl ? (
              <Image
                src={p.avatarUrl}
                alt="avatar"
                width={32}
                height={32}
                className="h-8 w-8 rounded-full object-cover"
                unoptimized
              />
            ) : (
              <div className="h-8 w-8 rounded-full bg-white/90 flex items-center justify-center text-gray-700 font-semibold">
                {p.name.charAt(0) || "A"}
              </div>
            )}
            <div className="text-sm font-semibold">
              {p.name || "Asistente IA"}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-white/70" />
            <div className="h-2 w-2 rounded-full bg-white/70" />
            <div className="h-2 w-2 rounded-full bg-white/70" />
          </div>
        </div>
        <div className="flex-1 bg-gray-50 p-3 overflow-y-auto space-y-3">
          {p.starters.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {p.starters.map((s, i) => (
                <div
                  key={`${s}-${i}`}
                  className="rounded-full border px-3 py-1 bg-white text-gray-700 text-xs"
                >
                  {s}
                </div>
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
    <div className="flex flex-col lg:grid lg:grid-cols-12 gap-6 min-h-0 h-auto lg:h-full">
      <div className="lg:col-span-5 h-auto lg:h-full lg:overflow-y-auto">
        <div className="flex items-center justify-between px-4 md:px-6 pt-4 md:pt-6">
          <h2 className="text-base font-semibold">
            Apariencia y Comportamiento
          </h2>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setAppearanceLocked(!appearanceLocked)}
            title="Editar"
          >
            <Pencil className="w-4 h-4" />
          </Button>
        </div>
        <Card className="mt-4 border-0 shadow-none bg-transparent">
          <CardContent className="space-y-6 p-0">
            {isLoading ? (
              <div className="flex items-center gap-2 text-sm py-4">
                <Loader2 className="h-4 w-4 animate-spin" /> Cargando configuración…
              </div>
            ) : (
              <div className="flex flex-col h-full relative">
                <Card className="border shadow-sm bg-white rounded-xl flex flex-col">
                  <div className="p-4 space-y-4">
                    {/* Identidad Visual */}
                    <div className="space-y-1 border-b pb-2">
                      <div className="flex items-center gap-2 text-base font-semibold text-gray-900">
                        <Palette className="w-4 h-4 text-blue-500" />
                        Identidad Visual
                      </div>
                    </div>

                    {/* Layout 2 Columnas: Avatar (Izq) - Datos (Der) */}
                    <div className="flex flex-col md:flex-row gap-4 items-start">
                      {/* Columna Izquierda: Avatar */}
                      <div className="flex-shrink-0 w-full md:w-auto flex flex-col items-center md:items-start gap-3">
                        <Label className="text-sm font-medium">Logo / Avatar</Label>
                        <div 
                          className="relative group cursor-pointer"
                          onClick={() => document.getElementById('avatar-file')?.click()}
                        >
                          <div className="w-24 h-24 rounded-full overflow-hidden border-4 border-white shadow-lg ring-1 ring-gray-200 relative bg-gray-50 flex items-center justify-center transition-transform group-hover:scale-105">
                            {config.avatarUrl ? (
                              <Image
                                src={config.avatarUrl}
                                alt="avatar"
                                width={96}
                                height={96}
                                  className="h-full w-full object-cover"
                                  unoptimized
                                />
                              ) : (
                                <User className="w-12 h-12 text-gray-300" />
                              )}
                              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                <Upload className="w-8 h-8 text-white" />
                              </div>
                            </div>
                            <div className="absolute bottom-1 right-1 bg-white rounded-full p-2.5 shadow-md border border-gray-100 text-blue-600 transition-transform hover:scale-110">
                              <Pencil className="w-4 h-4" />
                            </div>
                          </div>

                          <div className="flex flex-col gap-2 w-full items-center md:items-start">
                            <Input
                              id="avatar-file"
                              type="file"
                              accept="image/*"
                              className="hidden"
                              disabled={appearanceLocked}
                              onChange={async (e) => {
                                const file = e.target.files?.[0];
                                if (!file) return;
                                try {
                                  const formData = new FormData();
                                  formData.append("file", file);
                                  const res = await authenticatedUpload(
                                    `${API_URL}/assets/logo`,
                                    {
                                      method: "POST",
                                      body: formData,
                                    },
                                  );
                                  if (res.ok) {
                                    const ts = Date.now();
                                    setConfig((c) => ({
                                      ...c,
                                      avatarUrl: `${API_URL}/assets/logo?ts=${ts}`,
                                    }));
                                    toast.success("Logo subido correctamente");
                                  } else {
                                    toast.error("Error al subir el logo");
                                  }
                                } catch (err) {
                                  toast.error("Error de conexión");
                                }
                              }}
                            />
                            {config.avatarUrl && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="text-red-500 hover:text-red-600 hover:bg-red-50 h-8 text-xs"
                                onClick={async () => {
                                  try {
                                    const res = await authenticatedFetch(
                                      `${API_URL}/assets/logo`,
                                      { method: "DELETE" },
                                    );
                                    if (!res.ok) throw new Error("Error eliminando logo");
                                    setConfig((c) => ({ ...c, avatarUrl: "" }));
                                    toast.success("Logo eliminado");
                                  } catch (err) {
                                    toast.error("No se pudo eliminar el logo");
                                  }
                                }}
                              >
                                Eliminar imagen
                              </Button>
                            )}
                          </div>
                        </div>

                        {/* Columna Derecha: Datos Principales */}
                        <div className="flex-1 space-y-3 w-full">
                          <div className="space-y-2">
                            <Label htmlFor="bot-name">Nombre del Asistente</Label>
                            <Input
                              id="bot-name"
                              value={config.name}
                              disabled={appearanceLocked}
                              onChange={(e) =>
                                setConfig((c) => ({ ...c, name: e.target.value }))
                              }
                              placeholder="Ej. Mi Asistente Virtual"
                              className="h-11"
                            />
                          </div>

                          <div className="space-y-3">
                            <Label>Color de Marca</Label>
                            <div className="flex flex-wrap gap-3 items-center">
                              {presetColors.map((col) => (
                                <button
                                  key={col}
                                  type="button"
                                  onClick={() => setConfig((c) => ({ ...c, brandColor: col }))}
                                  className={`h-9 w-9 rounded-full transition-all duration-200 ${
                                    config.brandColor === col 
                                      ? "ring-2 ring-offset-2 ring-blue-500 scale-110" 
                                      : "ring-1 ring-gray-200 hover:scale-105"
                                  }`}
                                  style={{ backgroundColor: col }}
                                  disabled={appearanceLocked}
                                />
                              ))}
                              
                              <div className="relative flex items-center ml-2">
                                <div className="absolute left-3 text-gray-400 select-none text-xs">#</div>
                                <Input
                                  value={config.brandColor.startsWith('#') ? config.brandColor.substring(1) : config.brandColor}
                                  onChange={(e) => {
                                    let val = e.target.value;
                                    if (val.length <= 6) {
                                      setConfig((c) => ({ ...c, brandColor: `#${val}` }));
                                    }
                                  }}
                                  className="w-24 pl-6 h-9 font-mono uppercase text-sm"
                                  maxLength={6}
                                  placeholder="HEX"
                                  disabled={appearanceLocked}
                                />
                                <input
                                  type="color"
                                  value={config.brandColor}
                                  onChange={(e) => setConfig((c) => ({ ...c, brandColor: e.target.value }))}
                                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                  disabled={appearanceLocked}
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Inputs Secundarios en Grid */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-0">
                        <div className="space-y-2">
                          <Label htmlFor="placeholder">Texto del Input (Placeholder)</Label>
                          <Input
                            id="placeholder"
                            value={config.placeholder}
                            disabled={appearanceLocked}
                            onChange={(e) =>
                              setConfig((c) => ({
                                ...c,
                                placeholder: e.target.value,
                              }))
                            }
                            placeholder="Ej. Escribe tu mensaje..."
                          />
                        </div>
                        {/* Espacio para futuros inputs */}
                      </div>

                    {/* Quick Replies / Atajos Compactos */}
                    <div className="space-y-2 pt-2 border-t">
                      <div className="flex items-center justify-between">
                        <div>
                          <Label className="text-base font-semibold">Atajos de Conversación</Label>
                          <p className="text-xs text-muted-foreground mt-1">
                            Sugerencias rápidas para iniciar el chat.
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            if (config.starters.length < 6) {
                              setConfig((c) => ({
                                ...c,
                                starters: [...c.starters, "Nuevo atajo"],
                              }));
                              setFocusIdx(config.starters.length);
                            }
                          }}
                          disabled={config.starters.length >= 6 || appearanceLocked}
                          className="gap-2 text-blue-600 border-blue-100 hover:bg-blue-50"
                        >
                          <Plus className="w-4 h-4" /> Agregar
                        </Button>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {config.starters.length === 0 && (
                          <div className="col-span-1 md:col-span-2 text-center py-6 border-2 border-dashed rounded-lg text-muted-foreground text-sm bg-gray-50/50">
                            Sin atajos configurados.
                          </div>
                        )}
                        {config.starters.map((s, idx) => (
                          <div 
                            key={idx} 
                            className="flex items-center gap-2 animate-in fade-in slide-in-from-left-2 duration-300 group"
                          >
                            <Input
                              ref={(el) => (startersRefs.current[idx] = el)}
                              value={s}
                              disabled={appearanceLocked}
                              className="flex-1 h-9 text-sm"
                              onChange={(e) =>
                                setConfig((c) => ({
                                  ...c,
                                  starters: c.starters.map((t, i) =>
                                    i === idx ? e.target.value : t,
                                  ),
                                }))
                              }
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  if (config.starters.length < 6) {
                                    setConfig((c) => ({
                                      ...c,
                                      starters: [...c.starters, "Nuevo atajo"],
                                    }));
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
                              onClick={() =>
                                setConfig((c) => ({
                                  ...c,
                                  starters: c.starters.filter((_, i) => i !== idx),
                                }))
                              }
                              className="h-8 w-8 text-gray-400 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all"
                            >
                              <Trash className="w-4 h-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Sticky Footer Action Bar */}
                  <div className="sticky bottom-0 z-20 bg-white/80 backdrop-blur-md border-t p-4 flex justify-between items-center rounded-b-xl">
                    <span className="text-xs text-muted-foreground pl-0 hidden md:inline-block">
                      {appearanceIsDirty ? "Tienes cambios sin guardar" : "Todo actualizado"}
                    </span>
                    <Button
                      type="button"
                      className="min-w-[140px] bg-blue-600 hover:bg-blue-700 text-white shadow-md transition-all hover:shadow-lg"
                      onClick={handleSave}
                      disabled={saving || !appearanceIsDirty}
                    >
                      {saving ? (
                        <span className="inline-flex items-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin" /> Guardando
                        </span>
                      ) : (
                        "Guardar Cambios"
                      )}
                    </Button>
                  </div>
                </Card>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="lg:col-span-7 h-auto lg:h-full">
        <div className="relative h-full">
          <div className="relative lg:sticky lg:top-5 h-[650px] lg:h-full">
            <div className="border rounded-md bg-white/60 backdrop-blur-sm">
              <div className="flex items-center justify-between px-4 py-2 border-b">
                <div className="text-sm font-medium">Preview</div>
                <Tabs
                  defaultValue={previewMode}
                  onValueChange={(v) => setPreviewMode(v as any)}
                >
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
        </div>
      </div>
    </div>
  );
}
