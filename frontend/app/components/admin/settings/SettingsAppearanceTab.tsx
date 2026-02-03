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
        <Card className="mt-4">
          <CardContent className="space-y-6">
            {isLoading ? (
              <div className="flex items-center gap-2 text-sm py-4">
                <Loader2 className="h-4 w-4 animate-spin" /> Cargando configuración…
              </div>
            ) : (
              <>
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                    <Palette className="w-4 h-4" />
                    Identidad Visual
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Configura el nombre, logo y color principal del bot
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label htmlFor="bot-name">Nombre del Bot</Label>
                    <Input
                      id="bot-name"
                      value={config.name}
                      disabled={appearanceLocked}
                      onChange={(e) =>
                        setConfig((c) => ({ ...c, name: e.target.value }))
                      }
                    />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] items-end gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="avatar-file">Logo/Avatar</Label>
                      <Input
                        id="avatar-file"
                        type="file"
                        accept="image/*"
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
                              toast.success("Logo subido");
                            } else {
                              const body = await res.json().catch(() => ({}));
                              toast.error(
                                body?.detail || "Error al subir el logo",
                              );
                            }
                          } catch (err: any) {
                            toast.error(
                              err?.message || "Error de red al subir el logo",
                            );
                          }
                        }}
                      />
                      {config.avatarUrl && (
                        <div className="flex items-center gap-2 mt-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={appearanceLocked}
                            onClick={async () => {
                              try {
                                const res = await authenticatedFetch(
                                  `${API_URL}/assets/logo`,
                                  { method: "DELETE" },
                                );
                                if (!res.ok) {
                                  const body = await res
                                    .json()
                                    .catch(() => ({}));
                                  throw new Error(
                                    body?.detail || `Error ${res.status}`,
                                  );
                                }
                                setConfig((c) => ({
                                  ...c,
                                  avatarUrl: "",
                                }));
                                toast.success("Logo eliminado");
                              } catch (err: any) {
                                toast.error(
                                  err?.message ||
                                  "No se pudo eliminar el logo",
                                );
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
                        <Image
                          src={config.avatarUrl}
                          alt="avatar"
                          width={44}
                          height={44}
                          className="h-full w-full object-cover"
                          unoptimized
                        />
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          N/A
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="brand-color">Color Primario</Label>
                    <div className="flex items-center gap-3">
                      <Input
                        id="brand-color"
                        type="color"
                        value={config.brandColor}
                        disabled={appearanceLocked}
                        onChange={(e) =>
                          setConfig((c) => ({
                            ...c,
                            brandColor: e.target.value,
                          }))
                        }
                        className="h-11 w-16 p-1"
                      />
                      <div className="flex items-center gap-2">
                        {presetColors.map((col) => (
                          <button
                            key={col}
                            aria-label={col}
                            disabled={appearanceLocked}
                            onClick={() =>
                              setConfig((c) => ({
                                ...c,
                                brandColor: col,
                              }))
                            }
                            className={`h-8 w-8 rounded-full ring-2 ring-offset-2 ring-gray-200 ${appearanceLocked
                                ? "opacity-50 cursor-not-allowed"
                                : ""
                              }`}
                            style={{ backgroundColor: col }}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label htmlFor="placeholder">Placeholder</Label>
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
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">
                      Atajos rápidos de mensajes
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => {
                        setConfig((c) => ({
                          ...c,
                          starters:
                            c.starters.length >= 6
                              ? c.starters
                              : [...c.starters, "Nuevo atajo"],
                        }));
                        if (config.starters.length < 6) {
                          setFocusIdx(config.starters.length);
                        }
                      }}
                      disabled={
                        config.starters.length >= 6 || appearanceLocked
                      }
                      className="gap-2"
                    >
                      <Plus className="w-4 h-4" /> Agregar
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {config.starters.map((s, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <Input
                          ref={(el) => (startersRefs.current[idx] = el)}
                          value={s}
                          disabled={appearanceLocked}
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
                                  starters: [
                                    ...c.starters,
                                    "Nuevo atajo",
                                  ],
                                }));
                                setFocusIdx(config.starters.length);
                              }
                            }
                          }}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          disabled={appearanceLocked}
                          onClick={() =>
                            setConfig((c) => ({
                              ...c,
                              starters: c.starters.filter(
                                (_, i) => i !== idx,
                              ),
                            }))
                          }
                          className="h-10 w-10"
                        >
                          <Trash className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="pt-2">
                  <Button
                    type="button"
                    className="w-full h-11"
                    onClick={handleSave}
                    disabled={saving || !appearanceIsDirty}
                  >
                    {saving ? (
                      <span className="inline-flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />{" "}
                        Guardando…
                      </span>
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

      <div className="lg:col-span-7 h-auto lg:h-full">
        <div className="relative h-full">
          <div className="relative lg:sticky lg:top-0 h-[650px] lg:h-full">
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
