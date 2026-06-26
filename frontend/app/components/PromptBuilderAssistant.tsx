"use client";

import React, { useState, useRef, useEffect } from "react";
import { Textarea } from "@/app/components/ui/textarea";
import { Input } from "@/app/components/ui/input";
import { Sparkles, RefreshCw, ChevronDown, ChevronUp, Copy, Check } from "lucide-react";
import { generateBotPrompt } from "@/app/lib/services/botConfigService";
import { toast } from "sonner";

// ─── Constants ────────────────────────────────────────────────────────────────

type Tone = "formal" | "cercano" | "tecnico" | "empatico";

const SECTORS = [
  "Educación", "E-commerce", "Servicios profesionales",
  "Salud y bienestar", "Inmobiliaria", "Gastronomía",
  "Tecnología", "Turismo", "Finanzas", "Otro",
];

const SECTOR_PLACEHOLDERS: Record<string, string> = {
  "Educación": "Ofrecemos cursos online de programación para adultos que quieren cambiar de carrera",
  "E-commerce": "Vendemos ropa de mujeres con envío a todo el país, especializados en tallas grandes",
  "Salud y bienestar": "Clínica de nutrición y medicina preventiva, atendemos consultas presenciales y virtuales",
  "Inmobiliaria": "Compramos, vendemos y alquilamos propiedades residenciales en Lima y provincias",
  "Gastronomía": "Restaurante de comida fusión nikkei con servicio de delivery y catering para eventos",
  "Tecnología": "Desarrollamos software a medida para pequeñas y medianas empresas en la región",
  "Turismo": "Agencia de viajes especializada en paquetes a Machu Picchu y circuitos por Sudamérica",
  "Finanzas": "Asesoría financiera para personas naturales: inversiones, seguros y planificación fiscal",
};

const PHASES = [
  "Analizando tu negocio…",
  "Definiendo el tono y la voz…",
  "Escribiendo las instrucciones…",
  "Refinando los detalles…",
  "Últimos toques…",
];

const TONES: { id: Tone; label: string; desc: string; color: string }[] = [
  { id: "formal",   label: "Formal",   desc: "Usted · Preciso",      color: "#4f35cc" },
  { id: "cercano",  label: "Cercano",  desc: "Tú · Natural",         color: "#17a96a" },
  { id: "tecnico",  label: "Técnico",  desc: "Experto · Detallado",  color: "#0ea5e9" },
  { id: "empatico", label: "Empático", desc: "Cálido · Comprensivo", color: "#d48c0a" },
];

// ─── Style constants ──────────────────────────────────────────────────────────

const LABEL_CLS = "block font-sans text-[11px] font-semibold tracking-[0.07em] uppercase text-muted-foreground mb-2";
const MUTED_CLS = "font-normal normal-case tracking-normal text-muted-foreground/70";
const INPUT_CLS =
  "text-sm border-border " +
  "focus-visible:border-primary focus-visible:ring-2 " +
  "focus-visible:ring-primary/20 focus-visible:ring-offset-0 transition-shadow";

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  prompt: string;
  onPromptChange: (val: string) => void;
  fieldsReadOnly: boolean;
}

export function PromptBuilderAssistant({ prompt, onPromptChange, fieldsReadOnly }: Props) {
  const [mode, setMode] = useState<"ai" | "manual">(prompt ? "manual" : "ai");

  const [sector, setSector] = useState("");
  const [customSector, setCustomSector] = useState("");
  const [description, setDescription] = useState("");
  const [audience, setAudience] = useState("");
  const [tone, setTone] = useState<Tone>("cercano");
  const [restrictions, setRestrictions] = useState("");
  const [specialFlow, setSpecialFlow] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [showExtras, setShowExtras] = useState(false);
  const [loading, setLoading] = useState(false);
  const [hasGenerated, setHasGenerated] = useState(false);
  const [copied, setCopied] = useState(false);
  const [phaseIdx, setPhaseIdx] = useState(0);
  const isGeneratingRef = useRef(false);
  const phaseTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const effectiveSector = sector === "Otro" ? customSector.trim() : sector;
  const canGenerate = !!effectiveSector && description.trim().length >= 10 && !loading && !fieldsReadOnly;

  const descPlaceholder =
    sector && sector !== "Otro"
      ? `Ej: ${SECTOR_PLACEHOLDERS[sector] ?? "Describe brevemente qué ofreces y a quién"}`
      : "Describe brevemente qué ofreces y a quién va dirigido";

  const generate = async () => {
    if (!canGenerate || isGeneratingRef.current) return;
    isGeneratingRef.current = true;
    setLoading(true);
    setPhaseIdx(0);
    phaseTimerRef.current = setInterval(() => {
      setPhaseIdx((p) => Math.min(p + 1, PHASES.length - 1));
    }, 1100);
    try {
      const result = await generateBotPrompt({
        business_sector: effectiveSector,
        business_description: description.trim(),
        audience: audience.trim() || undefined,
        tone,
        restrictions: restrictions.trim() || undefined,
        special_flows: specialFlow.trim() || undefined,
        website_url: websiteUrl.trim() || undefined,
      });
      onPromptChange(result);
      setHasGenerated(true);
    } catch {
      toast.error("No se pudo generar el prompt. Intenta de nuevo.");
    } finally {
      if (phaseTimerRef.current) clearInterval(phaseTimerRef.current);
      isGeneratingRef.current = false;
      setLoading(false);
    }
  };

  useEffect(() => {
    return () => { if (phaseTimerRef.current) clearInterval(phaseTimerRef.current); };
  }, []);

  const handleCopy = async () => {
    if (!prompt) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(prompt);
      } else {
        const el = document.createElement("textarea");
        el.value = prompt;
        el.style.position = "fixed";
        el.style.opacity = "0";
        document.body.appendChild(el);
        el.select();
        document.execCommand("copy");
        document.body.removeChild(el);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Selecciona el texto manualmente para copiarlo.");
    }
  };

  const showResult = hasGenerated && mode === "ai" && !loading;

  return (
    <div className="space-y-5">

      {/* Mode toggle */}
      <div className="inline-flex items-center rounded-full p-1 gap-0.5 bg-primary/10">
        {(["ai", "manual"] as const).map((m) => (
          <button
            type="button"
            key={m}
            onClick={() => setMode(m)}
            className={`px-4 py-1.5 rounded-full text-xs font-semibold tracking-wide transition-all duration-150 ${
              mode === m
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground"
            }`}
          >
            {m === "ai" ? "🧠 Asistente IA" : "✏️ Manual"}
          </button>
        ))}
      </div>

      {/* ── AI MODE ─────────────────────────────────────────────────────────── */}
      {mode === "ai" && (
        <div className="space-y-6">

          {/* 1. Sector */}
          <div role="group" aria-labelledby="sector-label">
            <span id="sector-label" className={LABEL_CLS}>
              ¿En qué rubro está tu negocio?{" "}
              <span className="text-destructive font-bold">*</span>
            </span>
            <div className="flex flex-wrap gap-2">
              {SECTORS.map((s) => (
                <button
                  type="button"
                  key={s}
                  onClick={() => { setSector(s); if (s !== "Otro") setCustomSector(""); }}
                  disabled={fieldsReadOnly || loading}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-150 disabled:opacity-40 border ${
                    sector === s
                      ? "bg-primary text-primary-foreground border-primary shadow-sm"
                      : "bg-muted/60 text-foreground border-border hover:border-primary/40 hover:bg-muted"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
            {sector === "Otro" && (
              <Input
                value={customSector}
                onChange={(e) => setCustomSector(e.target.value)}
                placeholder="Escribe el rubro de tu negocio"
                disabled={fieldsReadOnly || loading}
                className={`mt-3 bg-card ${INPUT_CLS}`}
                autoFocus
              />
            )}
          </div>

          {/* 2. Description */}
          <div>
            <label htmlFor="pb-description" className={LABEL_CLS}>
              ¿Qué ofrece tu negocio?{" "}
              <span className="text-destructive font-bold">*</span>
            </label>
            <Textarea
              id="pb-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={descPlaceholder}
              rows={2}
              disabled={fieldsReadOnly || loading}
              className={`resize-none bg-card ${INPUT_CLS}`}
            />
          </div>

          {/* 3. Audience */}
          <div>
            <label htmlFor="pb-audience" className={LABEL_CLS}>
              ¿A quién atiende?{" "}
              <span className={MUTED_CLS}>recomendado</span>
            </label>
            <Input
              id="pb-audience"
              value={audience}
              onChange={(e) => setAudience(e.target.value)}
              placeholder="Ej: Emprendedores 25-40 años, padres de familia, estudiantes universitarios"
              disabled={fieldsReadOnly || loading}
              className={`bg-card ${INPUT_CLS}`}
            />
          </div>

          {/* 4. Tone */}
          <div role="group" aria-labelledby="tone-label">
            <span id="tone-label" className={LABEL_CLS}>Tono del bot</span>
            <div className="grid grid-cols-2 gap-2">
              {TONES.map((t) => (
                <button
                  type="button"
                  key={t.id}
                  onClick={() => setTone(t.id)}
                  disabled={fieldsReadOnly || loading}
                  className="flex items-start gap-2.5 px-3.5 py-2.5 rounded-lg text-left transition-all duration-150 disabled:opacity-40 border"
                  style={
                    tone === t.id
                      ? { background: t.color + "12", borderColor: t.color, boxShadow: `0 0 0 3px ${t.color}18` }
                      : undefined
                  }
                >
                  <span
                    className={`w-2 h-2 rounded-full mt-1 shrink-0 ${tone !== t.id ? "bg-muted-foreground/30" : ""}`}
                    style={{ background: tone === t.id ? t.color : undefined }}
                  />
                  <span>
                    <span
                      className={`block text-xs font-semibold ${tone !== t.id ? "text-foreground" : ""}`}
                      style={{ color: tone === t.id ? t.color : undefined }}
                    >
                      {t.label}
                    </span>
                    <span className="block text-[11px] text-muted-foreground">
                      {t.desc}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Extras disclosure */}
          <div>
            <button
              type="button"
              onClick={() => setShowExtras(!showExtras)}
              className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-primary transition-colors"
            >
              {showExtras ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              {showExtras ? "Ocultar" : "Más detalles"} — restricciones, flujos, web
            </button>

            {showExtras && (
              <div className="mt-4 space-y-4 p-4 rounded-lg bg-muted/50 border border-border">
                <div>
                  <label htmlFor="pb-restrictions" className={LABEL_CLS}>
                    ¿Qué debe evitar?{" "}
                    <span className={MUTED_CLS}>opcional</span>
                  </label>
                  <Input
                    id="pb-restrictions"
                    value={restrictions}
                    onChange={(e) => setRestrictions(e.target.value)}
                    placeholder="Ej: No mencionar precios, no comprometerse con fechas"
                    disabled={fieldsReadOnly || loading}
                    className={`${INPUT_CLS} bg-card`}
                  />
                </div>

                <div>
                  <label htmlFor="pb-special-flow" className={LABEL_CLS}>
                    ¿Algún flujo especial?{" "}
                    <span className={MUTED_CLS}>opcional</span>
                  </label>
                  <Input
                    id="pb-special-flow"
                    value={specialFlow}
                    onChange={(e) => setSpecialFlow(e.target.value)}
                    placeholder="Ej: Si preguntan por pagos, derivar a soporte@empresa.com"
                    disabled={fieldsReadOnly || loading}
                    className={`${INPUT_CLS} bg-card`}
                  />
                </div>

                <div>
                  <label htmlFor="pb-website" className={LABEL_CLS}>
                    Sitio web{" "}
                    <span className={MUTED_CLS}>contexto adicional</span>
                  </label>
                  <Input
                    id="pb-website"
                    value={websiteUrl}
                    onChange={(e) => setWebsiteUrl(e.target.value)}
                    placeholder="https://tuempresa.com"
                    type="url"
                    disabled={fieldsReadOnly || loading}
                    className={`${INPUT_CLS} bg-card`}
                  />
                  <p className="mt-1.5 text-[11px] text-muted-foreground">
                    Solo se consulta el sitio que indiques. No se siguen otros enlaces.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* CTA */}
          {(hasGenerated || prompt) && !loading ? (
            <button
              type="button"
              onClick={generate}
              disabled={!canGenerate}
              className="w-full h-11 rounded-lg flex items-center justify-center gap-2 text-xs font-semibold uppercase tracking-widest border border-primary text-primary bg-primary/5 hover:bg-primary/10 transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <RefreshCw className="w-4 h-4" />
              Regenerar personalidad
            </button>
          ) : (
            <button
              type="button"
              onClick={generate}
              disabled={!canGenerate}
              className="w-full h-11 rounded-lg flex items-center justify-center gap-2 text-xs font-semibold uppercase tracking-widest text-primary-foreground bg-primary transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-primary/90"
            >
              {loading ? (
                <>
                  <span className="w-4 h-4 rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground animate-spin" />
                  Generando...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Generar personalidad
                </>
              )}
            </button>
          )}

          {/* AI working indicator */}
          {loading && (
            <div className="rounded-xl overflow-hidden border border-border bg-muted/40">
              {/* Animated progress bar */}
              <div className="h-0.5 w-full bg-border overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-primary/40 via-primary to-primary/40 animate-[shimmer_1.6s_ease-in-out_infinite]"
                  style={{ width: "60%", backgroundSize: "200% 100%" }}
                />
              </div>
              <style>{`
                @keyframes shimmer {
                  0%   { transform: translateX(-100%); }
                  100% { transform: translateX(260%); }
                }
                @keyframes fadeSwap {
                  0%   { opacity: 0; transform: translateY(4px); }
                  15%  { opacity: 1; transform: translateY(0); }
                  85%  { opacity: 1; transform: translateY(0); }
                  100% { opacity: 0; transform: translateY(-4px); }
                }
              `}</style>

              <div className="px-5 py-5 space-y-4">
                {/* Three-dot pulse */}
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1">
                    {[0, 1, 2].map((i) => (
                      <span
                        key={i}
                        className="block w-2 h-2 rounded-full bg-primary/60 animate-bounce"
                        style={{ animationDelay: `${i * 150}ms`, animationDuration: "900ms" }}
                      />
                    ))}
                  </div>
                  {/* Cycling phase text */}
                  <span
                    key={phaseIdx}
                    className="text-xs font-medium text-muted-foreground"
                    style={{ animation: "fadeSwap 1.1s ease-in-out forwards" }}
                  >
                    {PHASES[phaseIdx]}
                  </span>
                </div>

                {/* Skeleton lines with sweep shimmer */}
                <div className="space-y-2.5">
                  {[92, 78, 100, 65, 88, 72, 100, 55].map((w, i) => (
                    <div
                      key={i}
                      className="h-2 rounded-full bg-muted-foreground/10 overflow-hidden"
                      style={{ width: `${w}%` }}
                    >
                      <div
                        className="h-full bg-gradient-to-r from-transparent via-muted-foreground/20 to-transparent animate-[shimmer_2s_ease-in-out_infinite]"
                        style={{ width: "40%", animationDelay: `${i * 120}ms` }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Result */}
          {showResult && (
            <div className="rounded-xl overflow-hidden border border-primary ring-1 ring-primary/10">
              <div className="flex items-center justify-between px-4 py-2.5 bg-primary/5 border-b border-border">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-success">
                    Listo para guardar
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleCopy}
                    className={`flex items-center gap-1.5 text-[11px] font-medium transition-colors ${copied ? "text-success" : "text-muted-foreground hover:text-primary"}`}
                  >
                    {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    {copied ? "Copiado" : "Copiar"}
                  </button>
                  <button
                    type="button"
                    onClick={generate}
                    disabled={!canGenerate}
                    className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground hover:text-primary transition-colors disabled:opacity-40"
                  >
                    <RefreshCw className="w-3 h-3" />
                    Regenerar
                  </button>
                </div>
              </div>

              <div className="bg-card">
                <Textarea
                  value={prompt}
                  onChange={(e) => onPromptChange(e.target.value)}
                  rows={14}
                  maxLength={3000}
                  disabled={fieldsReadOnly}
                  className="resize-none border-0 focus-visible:ring-0 text-[13px] leading-relaxed p-4 font-mono text-foreground bg-transparent"
                />
                <div className="flex justify-between items-center px-4 pb-3 border-t border-border">
                  <span className="text-[11px] text-muted-foreground">
                    Ajusta el texto si es necesario antes de guardar
                  </span>
                  <span className={`text-[11px] font-mono ${prompt.length > 2700 ? "text-destructive" : "text-muted-foreground"}`}>
                    {prompt.length} / 3000
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Empty state */}
          {!showResult && !loading && (
            <p className="text-[12px] text-center text-muted-foreground">
              Elige el rubro y describe tu negocio. Tomará menos de un minuto.
            </p>
          )}
        </div>
      )}

      {/* ── MANUAL MODE ─────────────────────────────────────────────────────── */}
      {mode === "manual" && (
        <div className="space-y-2">
          <Textarea
            value={prompt}
            onChange={(e) => onPromptChange(e.target.value)}
            rows={14}
            maxLength={3000}
            disabled={fieldsReadOnly}
            placeholder="Escribe las instrucciones de personalidad: tono, restricciones, flujos especiales..."
            className={`resize-none text-[13px] leading-relaxed font-mono bg-card ${INPUT_CLS}`}
          />
          <div className="flex justify-between items-center">
            <span className="text-[11px] text-muted-foreground">Edición directa</span>
            <span className={`text-[11px] font-mono ${prompt.length > 2700 ? "text-destructive" : "text-muted-foreground"}`}>
              {prompt.length} / 3000
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
