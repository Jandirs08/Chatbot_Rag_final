"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { Textarea } from "@/app/components/ui/textarea";
import { Input } from "@/app/components/ui/input";
import {
  Sparkles,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  PenLine,
  X,
} from "lucide-react";
import { generateBotPrompt } from "@/app/lib/services/botConfigService";
import { toast } from "sonner";

// ─── Constants ────────────────────────────────────────────────────────────────

type Tone = "formal" | "cercano" | "tecnico" | "empatico";

const SECTORS = [
  "Educación",
  "E-commerce",
  "Servicios profesionales",
  "Salud y bienestar",
  "Inmobiliaria",
  "Gastronomía",
  "Tecnología",
  "Turismo",
  "Finanzas",
  "Otro",
];

const SECTOR_PLACEHOLDERS: Record<string, string> = {
  Educación:
    "Ofrecemos cursos online de programación para adultos que quieren cambiar de carrera",
  "E-commerce":
    "Vendemos ropa de mujeres con envío a todo el país, especializados en tallas grandes",
  "Salud y bienestar":
    "Clínica de nutrición y medicina preventiva, atendemos consultas presenciales y virtuales",
  Inmobiliaria:
    "Compramos, vendemos y alquilamos propiedades residenciales en Lima y provincias",
  Gastronomía:
    "Restaurante de comida fusión nikkei con servicio de delivery y catering para eventos",
  Tecnología:
    "Desarrollamos software a medida para pequeñas y medianas empresas en la región",
  Turismo:
    "Agencia de viajes especializada en paquetes a Machu Picchu y circuitos por Sudamérica",
  Finanzas:
    "Asesoría financiera para personas naturales: inversiones, seguros y planificación fiscal",
};

const AI_FORM_PRESETS = [
  {
    label: "Soporte al cliente",
    sector: "Servicios profesionales",
    tone: "cercano" as Tone,
    description:
      "Brindamos soporte técnico y atención al cliente para productos de software",
    audience: "Usuarios con dudas técnicas o incidencias",
    restrictions: "No comprometerse con fechas de resolución",
  },
  {
    label: "E-commerce",
    sector: "E-commerce",
    tone: "cercano" as Tone,
    description:
      "Tienda online con catálogo de productos, envíos y devoluciones",
    audience: "Compradores online buscando productos y seguimiento de pedidos",
    restrictions: "No confirmar stock en tiempo real",
  },
  {
    label: "Educación",
    sector: "Educación",
    tone: "empatico" as Tone,
    description:
      "Plataforma de cursos online con tutorías y contenido on-demand",
    audience: "Estudiantes adultos que buscan aprender nuevas habilidades",
    restrictions: "No prometer resultados de aprendizaje garantizados",
  },
  {
    label: "B2B formal",
    sector: "Tecnología",
    tone: "formal" as Tone,
    description:
      "Soluciones de software empresarial para optimización de procesos",
    audience:
      "Gerentes y directores de empresa buscando soluciones tecnológicas",
    restrictions: "No revelar precios sin pasar por el equipo comercial",
  },
] as const;

const PHASES = [
  "Analizando tu negocio…",
  "Definiendo el tono y la voz…",
  "Escribiendo las instrucciones…",
  "Refinando los detalles…",
  "Últimos toques…",
];

const TONES: { id: Tone; label: string; desc: string; color: string }[] = [
  { id: "formal", label: "Formal", desc: "Usted · Preciso", color: "#4f35cc" },
  { id: "cercano", label: "Cercano", desc: "Tú · Natural", color: "#17a96a" },
  { id: "tecnico", label: "Técnico", desc: "Experto · Detallado", color: "#0ea5e9" },
  { id: "empatico", label: "Empático", desc: "Cálido · Comprensivo", color: "#d48c0a" },
];

const LABEL_CLS =
  "block font-sans text-[11px] font-semibold tracking-[0.07em] uppercase text-muted-foreground mb-2";
const MUTED_CLS =
  "font-normal normal-case tracking-normal text-muted-foreground/70";
const INPUT_CLS =
  "text-sm border-border focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:ring-offset-0 transition-shadow";

// ─── URL validation ───────────────────────────────────────────────────────────

function isValidHttpUrl(val: string): boolean {
  try {
    const { protocol, hostname } = new URL(val);
    if (protocol !== "http:" && protocol !== "https:") return false;
    const h = hostname.toLowerCase();
    if (h === "localhost" || h === "127.0.0.1" || h === "::1") return false;
    if (/^10\.\d+\.\d+\.\d+$/.test(h)) return false;
    if (/^192\.168\.\d+\.\d+$/.test(h)) return false;
    if (/^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/.test(h)) return false;
    if (/^169\.254\.\d+\.\d+$/.test(h)) return false;
    return true;
  } catch {
    return false;
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  prompt: string;
  onPromptChange: (val: string) => void;
  fieldsReadOnly: boolean;
}

export function PromptBuilderAssistant({
  prompt,
  onPromptChange,
  fieldsReadOnly,
}: Props) {
  // AI panel open by default only when there's no existing prompt
  const [aiOpen, setAiOpen] = useState(() => !prompt);
  const [sector, setSector] = useState("");
  const [customSector, setCustomSector] = useState("");
  const [description, setDescription] = useState("");
  const [audience, setAudience] = useState("");
  const [tone, setTone] = useState<Tone>("cercano");
  const [restrictions, setRestrictions] = useState("");
  const [specialFlow, setSpecialFlow] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [websiteUrlError, setWebsiteUrlError] = useState<string | null>(null);
  const [showExtras, setShowExtras] = useState(false);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [phaseIdx, setPhaseIdx] = useState(0);
  const isGeneratingRef = useRef(false);
  const phaseTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const effectiveSector = sector === "Otro" ? customSector.trim() : sector;
  const descTrimLen = description.trim().length;
  const canGenerate =
    !!effectiveSector &&
    descTrimLen >= 10 &&
    !loading &&
    !fieldsReadOnly &&
    !websiteUrlError;

  const descPlaceholder =
    sector && sector !== "Otro"
      ? `Ej: ${SECTOR_PLACEHOLDERS[sector] ?? "Describe brevemente qué ofreces y a quién"}`
      : "Describe brevemente qué ofreces y a quién va dirigido";

  // Close AI panel when prompt appears for the first time (edge-case guard)
  const hadPromptRef = useRef(!!prompt);
  useEffect(() => {
    if (!hadPromptRef.current && prompt) {
      hadPromptRef.current = true;
    }
  }, [prompt]);

  useEffect(() => {
    return () => {
      if (phaseTimerRef.current) clearInterval(phaseTimerRef.current);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  const handleWebsiteUrlBlur = () => {
    if (!websiteUrl.trim()) {
      setWebsiteUrlError(null);
      return;
    }
    setWebsiteUrlError(
      isValidHttpUrl(websiteUrl.trim())
        ? null
        : "URL inválida. Usa https://tuempresa.com",
    );
  };

  const generate = useCallback(async () => {
    // Validate URL eagerly in case blur never fired (e.g. direct button click)
    if (websiteUrl.trim() && !isValidHttpUrl(websiteUrl.trim())) {
      setWebsiteUrlError("URL inválida. Usa https://tuempresa.com");
      return;
    }
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
      setAiOpen(false);
      setTimeout(() => textareaRef.current?.focus(), 80);
    } catch {
      toast.error("No se pudo generar el prompt. Intenta de nuevo.");
    } finally {
      if (phaseTimerRef.current) clearInterval(phaseTimerRef.current);
      isGeneratingRef.current = false;
      setLoading(false);
    }
  }, [canGenerate, effectiveSector, description, audience, tone, restrictions, specialFlow, websiteUrl, onPromptChange]);

  const handleCopy = useCallback(async () => {
    if (!prompt) return;
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("No se pudo copiar. Selecciona el texto manualmente.");
    }
  }, [prompt]);

  const openAiAndFocus = useCallback(() => {
    setAiOpen(true);
  }, []);

  const focusTextarea = useCallback(() => {
    setAiOpen(false);
    setTimeout(() => textareaRef.current?.focus(), 50);
  }, []);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">

      {/* ── Textarea section ──────────────────────────────────────────────── */}
      <div>
        {!fieldsReadOnly && (
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] text-muted-foreground">
              {prompt ? "Instrucciones del bot" : "Escribe tus instrucciones"}
            </span>
            <div className="flex items-center gap-1">
              {prompt && (
                <button
                  type="button"
                  onClick={handleCopy}
                  className={`flex items-center gap-1 text-[11px] px-2 py-1 rounded-md transition-colors ${
                    copied
                      ? "text-success"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                  }`}
                  title="Copiar prompt"
                >
                  {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  {copied ? "Copiado" : "Copiar"}
                </button>
              )}
              <button
                type="button"
                onClick={() => setAiOpen((v) => !v)}
                className={`flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-md font-medium transition-all ${
                  aiOpen
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-primary hover:bg-primary/5"
                }`}
              >
                <Sparkles className="w-3 h-3" aria-hidden="true" />
                {aiOpen ? "Cerrar IA" : prompt ? "Regenerar con IA" : "Crear con IA"}
              </button>
            </div>
          </div>
        )}

        <Textarea
          ref={textareaRef}
          value={prompt}
          onChange={(e) => onPromptChange(e.target.value)}
          rows={fieldsReadOnly ? 12 : prompt ? 14 : 6}
          maxLength={3000}
          disabled={fieldsReadOnly}
          aria-describedby="prompt-char-count"
          placeholder={
            fieldsReadOnly
              ? ""
              : "Eres un asistente de [negocio]. Tu función es [función]. Siempre responde en [idioma]…"
          }
          className={`resize-none text-[13px] leading-relaxed font-mono bg-card ${INPUT_CLS} ${
            !fieldsReadOnly && !prompt ? "border-dashed" : ""
          }`}
        />
        {!fieldsReadOnly && (
          <div className="flex justify-between items-center mt-1">
            <span className="text-[11px] text-muted-foreground">
              {prompt ? "Edición directa" : "O usa la IA para generar"}
            </span>
            <span
              id="prompt-char-count"
              className={`text-[11px] font-mono ${prompt.length > 2700 ? "text-destructive" : "text-muted-foreground"}`}
            >
              {prompt.length} / 3000
            </span>
          </div>
        )}
      </div>

      {/* Screen reader generation status */}
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {loading ? "Generando personalidad, por favor espera." : ""}
      </div>

      {/* ── Empty-state CTAs (no prompt, AI panel closed) ─────────────────── */}
      {!fieldsReadOnly && !prompt && !aiOpen && (
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <p className="text-xs text-muted-foreground">¿Cómo quieres empezar?</p>
          <div className="flex gap-2 flex-wrap justify-center">
            <button
              type="button"
              onClick={openAiAndFocus}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold text-primary-foreground gradient-primary hover:opacity-90 transition-opacity"
            >
              <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
              Crear con IA
            </button>
            <button
              type="button"
              onClick={focusTextarea}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold text-foreground bg-muted/60 border border-border hover:bg-muted transition-colors"
            >
              <PenLine className="w-3.5 h-3.5" aria-hidden="true" />
              Escribir yo mismo
            </button>
          </div>
        </div>
      )}

      {/* ── AI Panel (collapsible) ─────────────────────────────────────────── */}
      {!fieldsReadOnly && aiOpen && (
        <div className="rounded-xl border border-primary/25 bg-primary/3 overflow-hidden">
          {/* Panel header */}
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-primary/15 bg-primary/5">
            <span className="text-xs font-semibold text-primary flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
              {prompt ? "Regenerar personalidad con IA" : "Crear personalidad con IA"}
            </span>
            <button
              type="button"
              onClick={() => setAiOpen(false)}
              className="text-muted-foreground hover:text-foreground transition-colors p-0.5 rounded"
              aria-label="Cerrar panel de IA"
            >
              <X className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>

          {/* AI loading state */}
          {loading && (
            <div className="p-4">
              <div className="h-0.5 w-full bg-border overflow-hidden rounded mb-4">
                <div
                  className="h-full bg-gradient-to-r from-primary/40 via-primary to-primary/40 animate-[shimmer_1.6s_ease-in-out_infinite]"
                  style={{ width: "60%", backgroundSize: "200% 100%" }}
                />
              </div>
              <div className="flex items-center gap-3 mb-4">
                <div className="flex items-center gap-1">
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className="block w-2 h-2 rounded-full bg-primary/60 animate-bounce"
                      style={{ animationDelay: `${i * 150}ms`, animationDuration: "900ms" }}
                    />
                  ))}
                </div>
                <span
                  key={phaseIdx}
                  className="text-xs font-medium text-muted-foreground"
                  style={{ animation: "fadeSwap 1.1s ease-in-out forwards" }}
                >
                  {PHASES[phaseIdx]}
                </span>
              </div>
              <div className="space-y-2">
                {[92, 78, 100, 65, 88, 72].map((w, i) => (
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
          )}

          {/* AI form */}
          {!loading && (
            <div className="px-4 py-4 space-y-5">
              {/* Quick presets */}
              <div>
                <span className={LABEL_CLS}>Preset rápido</span>
                <div className="flex flex-wrap gap-2">
                  {AI_FORM_PRESETS.map((p) => (
                    <button
                      key={p.label}
                      type="button"
                      disabled={fieldsReadOnly}
                      onClick={() => {
                        setSector(p.sector);
                        setCustomSector("");
                        setTone(p.tone);
                        setDescription(p.description);
                        setAudience(p.audience);
                        setRestrictions(p.restrictions);
                        setShowExtras(true);
                      }}
                      className="px-3 py-1.5 rounded-md text-xs font-medium border border-dashed border-border bg-muted/40 text-muted-foreground hover:border-primary/50 hover:text-foreground hover:bg-muted transition-all disabled:opacity-40"
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Sector */}
              <div role="group" aria-labelledby="sector-label" aria-required="true">
                <span id="sector-label" className={LABEL_CLS}>
                  Rubro del negocio{" "}
                  <span className="text-destructive font-bold" aria-hidden="true">*</span>
                </span>
                <div className="flex flex-wrap gap-2">
                  {SECTORS.map((s) => (
                    <button
                      type="button"
                      key={s}
                      onClick={() => {
                        setSector(s);
                        if (s !== "Otro") setCustomSector("");
                      }}
                      aria-pressed={sector === s}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-150 border ${
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
                    className={`mt-3 bg-card ${INPUT_CLS}`}
                    autoFocus
                  />
                )}
              </div>

              {/* Description */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label htmlFor="pb-description" className={`${LABEL_CLS} mb-0`}>
                    ¿Qué ofrece tu negocio?{" "}
                    <span className="text-destructive font-bold" aria-hidden="true">*</span>
                  </label>
                  <span className={`text-[11px] font-mono ${descTrimLen >= 10 ? "text-success" : "text-muted-foreground"}`}>
                    {descTrimLen}/10 mín
                  </span>
                </div>
                <Textarea
                  id="pb-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={descPlaceholder}
                  rows={2}
                  required
                  aria-required="true"
                  className={`resize-none bg-card ${INPUT_CLS}`}
                />
              </div>

              {/* Audience */}
              <div>
                <label htmlFor="pb-audience" className={LABEL_CLS}>
                  ¿A quién atiende? <span className={MUTED_CLS}>recomendado</span>
                </label>
                <Input
                  id="pb-audience"
                  value={audience}
                  onChange={(e) => setAudience(e.target.value)}
                  placeholder="Ej: Emprendedores 25-40 años, padres de familia, estudiantes universitarios"
                  className={`bg-card ${INPUT_CLS}`}
                />
              </div>

              {/* Tone */}
              <div role="group" aria-labelledby="tone-label">
                <span id="tone-label" className={LABEL_CLS}>Tono del bot</span>
                <div className="grid grid-cols-2 gap-2">
                  {TONES.map((t) => (
                    <button
                      type="button"
                      key={t.id}
                      onClick={() => setTone(t.id)}
                      aria-pressed={tone === t.id}
                      className="flex items-start gap-2.5 px-3.5 py-2.5 rounded-lg text-left transition-all duration-150 border"
                      style={
                        tone === t.id
                          ? { background: t.color + "12", borderColor: t.color, boxShadow: `0 0 0 3px ${t.color}18` }
                          : undefined
                      }
                    >
                      <span
                        aria-hidden="true"
                        className="w-2 h-2 rounded-full mt-1 shrink-0"
                        style={{ background: tone === t.id ? t.color : "#94a3b8" }}
                      />
                      <span>
                        <span
                          className="block text-xs font-semibold"
                          style={{ color: tone === t.id ? t.color : undefined }}
                        >
                          {t.label}
                        </span>
                        <span className="block text-[11px] text-muted-foreground">{t.desc}</span>
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
                        ¿Qué debe evitar? <span className={MUTED_CLS}>opcional</span>
                      </label>
                      <Input
                        id="pb-restrictions"
                        value={restrictions}
                        onChange={(e) => setRestrictions(e.target.value)}
                        placeholder="Ej: No mencionar precios, no comprometerse con fechas"
                        className={`${INPUT_CLS} bg-card`}
                      />
                    </div>
                    <div>
                      <label htmlFor="pb-special-flow" className={LABEL_CLS}>
                        ¿Algún flujo especial? <span className={MUTED_CLS}>opcional</span>
                      </label>
                      <Input
                        id="pb-special-flow"
                        value={specialFlow}
                        onChange={(e) => setSpecialFlow(e.target.value)}
                        placeholder="Ej: Si preguntan por pagos, derivar a soporte@empresa.com"
                        className={`${INPUT_CLS} bg-card`}
                      />
                    </div>
                    <div>
                      <label htmlFor="pb-website" className={LABEL_CLS}>
                        Sitio web <span className={MUTED_CLS}>contexto adicional</span>
                      </label>
                      <Input
                        id="pb-website"
                        value={websiteUrl}
                        onChange={(e) => { setWebsiteUrl(e.target.value); setWebsiteUrlError(null); }}
                        onBlur={handleWebsiteUrlBlur}
                        placeholder="https://tuempresa.com"
                        type="url"
                        aria-invalid={!!websiteUrlError}
                        aria-describedby={websiteUrlError ? "pb-website-error" : "pb-website-hint"}
                        className={`${INPUT_CLS} bg-card ${websiteUrlError ? "border-destructive" : ""}`}
                      />
                      {websiteUrlError ? (
                        <p id="pb-website-error" className="mt-1.5 text-[11px] text-destructive">{websiteUrlError}</p>
                      ) : (
                        <p id="pb-website-hint" className="mt-1.5 text-[11px] text-muted-foreground">
                          Solo se consulta el sitio indicado. No se siguen otros enlaces.
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Generate CTA */}
              <button
                type="button"
                onClick={generate}
                disabled={!canGenerate}
                className={`w-full h-11 rounded-lg flex items-center justify-center gap-2 text-xs font-semibold uppercase tracking-widest transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed ${
                  prompt
                    ? "border border-primary text-primary bg-primary/5 hover:bg-primary/10"
                    : "text-primary-foreground bg-primary hover:bg-primary/90"
                }`}
              >
                {prompt ? (
                  <><RefreshCw className="w-4 h-4" /> Regenerar personalidad</>
                ) : (
                  <><Sparkles className="w-4 h-4" /> Generar personalidad</>
                )}
              </button>

              {!canGenerate && !loading && (
                <p className="text-[11px] text-center text-muted-foreground">
                  Elige el rubro y describe tu negocio para continuar.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
