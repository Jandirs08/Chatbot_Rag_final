"use client";

import React, { useState, useRef } from "react";
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

const TONES: { id: Tone; label: string; desc: string; color: string }[] = [
  { id: "formal",   label: "Formal",   desc: "Usted · Preciso",      color: "#4f35cc" },
  { id: "cercano",  label: "Cercano",  desc: "Tú · Natural",         color: "#17a96a" },
  { id: "tecnico",  label: "Técnico",  desc: "Experto · Detallado",  color: "#0ea5e9" },
  { id: "empatico", label: "Empático", desc: "Cálido · Comprensivo", color: "#d48c0a" },
];

// ─── Style constants ──────────────────────────────────────────────────────────

const LABEL: React.CSSProperties = {
  display: "block",
  fontFamily: "'Space Grotesk', system-ui, sans-serif",
  fontSize: "11px",
  fontWeight: 600,
  letterSpacing: "0.07em",
  textTransform: "uppercase",
  color: "#6b6688",
  marginBottom: "8px",
};

const MUTED: React.CSSProperties = {
  fontWeight: 400,
  textTransform: "none",
  letterSpacing: "normal",
  color: "#9a97b4",
};

const INPUT_CLS =
  "text-sm border-[#e0dff0] dark:border-[#2e2c4a] " +
  "focus-visible:border-[#4f35cc] focus-visible:ring-2 " +
  "focus-visible:ring-[#4f35cc]/20 focus-visible:ring-offset-0 transition-shadow";

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
  const isGeneratingRef = useRef(false);

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
      isGeneratingRef.current = false;
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!prompt) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(prompt);
      } else {
        // Fallback for HTTP (non-secure) contexts
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

  const showResult = (hasGenerated || !!prompt) && mode === "ai" && !loading;

  return (
    <div className="space-y-5">

      {/* Mode toggle */}
      <div
        className="inline-flex items-center rounded-full p-1 gap-0.5"
        style={{ background: "oklch(94% 0.04 280)" }}
      >
        {(["ai", "manual"] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className="px-4 py-1.5 rounded-full text-xs font-semibold tracking-wide transition-all duration-150"
            style={
              mode === m
                ? { background: "#4f35cc", color: "#fff", boxShadow: "0 1px 4px rgb(79 53 204 / 0.28)" }
                : { color: "#6b6688" }
            }
          >
            {m === "ai" ? "🧠 Asistente IA" : "✏️ Manual"}
          </button>
        ))}
      </div>

      {/* ── AI MODE ─────────────────────────────────────────────────────────── */}
      {mode === "ai" && (
        <div className="space-y-6">

          {/* 1. Sector */}
          <div>
            <label style={LABEL}>
              ¿En qué rubro está tu negocio?{" "}
              <span style={{ color: "#dc2626", fontWeight: 700 }}>*</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {SECTORS.map((s) => (
                <button
                  key={s}
                  onClick={() => { setSector(s); if (s !== "Otro") setCustomSector(""); }}
                  disabled={fieldsReadOnly || loading}
                  className="px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-150 disabled:opacity-40"
                  style={
                    sector === s
                      ? { background: "#4f35cc", color: "#fff", boxShadow: "0 1px 6px rgb(79 53 204 / 0.3)" }
                      : { background: "oklch(96% 0.01 280)", color: "#6b6688", border: "1px solid #e0dff0" }
                  }
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
                className={`mt-3 ${INPUT_CLS}`}
                autoFocus
              />
            )}
          </div>

          {/* 2. Description */}
          <div>
            <label style={LABEL}>
              ¿Qué ofrece tu negocio?{" "}
              <span style={{ color: "#dc2626", fontWeight: 700 }}>*</span>
            </label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={descPlaceholder}
              rows={2}
              disabled={fieldsReadOnly || loading}
              className={`resize-none ${INPUT_CLS}`}
            />
          </div>

          {/* 3. Audience */}
          <div>
            <label style={LABEL}>
              ¿A quién atiende?{" "}
              <span style={MUTED}>recomendado</span>
            </label>
            <Input
              value={audience}
              onChange={(e) => setAudience(e.target.value)}
              placeholder="Ej: Emprendedores 25-40 años, padres de familia, estudiantes universitarios"
              disabled={fieldsReadOnly || loading}
              className={INPUT_CLS}
            />
          </div>

          {/* 4. Tone */}
          <div>
            <label style={LABEL}>Tono del bot</label>
            <div className="grid grid-cols-2 gap-2">
              {TONES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTone(t.id)}
                  disabled={fieldsReadOnly || loading}
                  className="flex items-start gap-2.5 px-3.5 py-2.5 rounded-lg text-left transition-all duration-150 disabled:opacity-40"
                  style={
                    tone === t.id
                      ? { background: t.color + "12", border: `1.5px solid ${t.color}`, boxShadow: `0 0 0 3px ${t.color}18` }
                      : { border: "1.5px solid #e0dff0", background: "transparent" }
                  }
                >
                  <span
                    className="w-2 h-2 rounded-full mt-1 shrink-0"
                    style={{ background: tone === t.id ? t.color : "#d4d2e0" }}
                  />
                  <span>
                    <span
                      className="block text-xs font-semibold"
                      style={{ color: tone === t.id ? t.color : "#131228", fontFamily: "'Space Grotesk', system-ui" }}
                    >
                      {t.label}
                    </span>
                    <span className="block text-[11px]" style={{ color: "#9a97b4" }}>
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
              onClick={() => setShowExtras(!showExtras)}
              className="flex items-center gap-1.5 text-xs font-medium transition-colors"
              style={{ color: "#6b6688" }}
              onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = "#4f35cc")}
              onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = "#6b6688")}
            >
              {showExtras ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              {showExtras ? "Ocultar" : "Más detalles"} — restricciones, flujos, web
            </button>

            {showExtras && (
              <div
                className="mt-4 space-y-4 p-4 rounded-lg"
                style={{ background: "oklch(97% 0.006 280)", border: "1px solid #e0dff0" }}
              >
                <div>
                  <label style={LABEL}>
                    ¿Qué debe evitar?{" "}
                    <span style={MUTED}>opcional</span>
                  </label>
                  <Input
                    value={restrictions}
                    onChange={(e) => setRestrictions(e.target.value)}
                    placeholder="Ej: No mencionar precios, no comprometerse con fechas"
                    disabled={fieldsReadOnly || loading}
                    className={INPUT_CLS}
                  />
                </div>

                <div>
                  <label style={LABEL}>
                    ¿Algún flujo especial?{" "}
                    <span style={MUTED}>opcional</span>
                  </label>
                  <Input
                    value={specialFlow}
                    onChange={(e) => setSpecialFlow(e.target.value)}
                    placeholder="Ej: Si preguntan por pagos, derivar a soporte@empresa.com"
                    disabled={fieldsReadOnly || loading}
                    className={INPUT_CLS}
                  />
                </div>

                <div>
                  <label style={LABEL}>
                    Sitio web{" "}
                    <span style={MUTED}>contexto adicional</span>
                  </label>
                  <Input
                    value={websiteUrl}
                    onChange={(e) => setWebsiteUrl(e.target.value)}
                    placeholder="https://tuempresa.com"
                    type="url"
                    disabled={fieldsReadOnly || loading}
                    className={INPUT_CLS}
                  />
                  <p className="mt-1.5 text-[11px]" style={{ color: "#9a97b4" }}>
                    Solo se consulta el sitio que indiques. No se siguen otros enlaces.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* CTA */}
          <button
            onClick={generate}
            disabled={!canGenerate}
            className="w-full h-11 rounded-lg flex items-center justify-center gap-2 text-xs font-semibold uppercase tracking-widest text-white transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: "#4f35cc", boxShadow: canGenerate ? "0 2px 14px rgb(79 53 204 / 0.32)" : "none" }}
            onMouseEnter={(e) => { if (canGenerate) (e.currentTarget as HTMLElement).style.background = "#3d25b0"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "#4f35cc"; }}
          >
            {loading ? (
              <>
                <span
                  className="w-4 h-4 rounded-full border-2 animate-spin"
                  style={{ borderColor: "rgb(255 255 255 / 0.3)", borderTopColor: "#fff" }}
                />
                Generando...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                {hasGenerated || prompt ? "Regenerar personalidad" : "Generar personalidad"}
              </>
            )}
          </button>

          {/* Loading shimmer */}
          {loading && (
            <div
              className="rounded-xl p-5 space-y-2"
              style={{ background: "oklch(97% 0.008 280)", border: "1px solid #e0dff0" }}
            >
              {[55, 100, 88, 72, 100, 65, 90, 48, 100, 76].map((w, i) => (
                <div
                  key={i}
                  className="h-2.5 rounded-full animate-pulse"
                  style={{
                    width: `${w}%`,
                    background: i % 4 === 0 ? "#c8c4e8" : "#e0dff0",
                    animationDelay: `${i * 70}ms`,
                  }}
                />
              ))}
            </div>
          )}

          {/* Result */}
          {showResult && (
            <div
              className="rounded-xl overflow-hidden"
              style={{ border: "1.5px solid #4f35cc", boxShadow: "0 0 0 3px rgb(79 53 204 / 0.1)" }}
            >
              <div
                className="flex items-center justify-between px-4 py-2.5"
                style={{ background: "oklch(96% 0.015 280)", borderBottom: "1px solid #e0dff0" }}
              >
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: "#17a96a" }} />
                  <span
                    className="text-[11px] font-semibold uppercase tracking-wider"
                    style={{ color: "#17a96a", fontFamily: "'Space Grotesk', system-ui" }}
                  >
                    Listo para guardar
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleCopy}
                    className="flex items-center gap-1.5 text-[11px] font-medium transition-colors"
                    style={{ color: copied ? "#17a96a" : "#6b6688" }}
                  >
                    {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    {copied ? "Copiado" : "Copiar"}
                  </button>
                  <button
                    onClick={generate}
                    disabled={!canGenerate}
                    className="flex items-center gap-1.5 text-[11px] font-medium transition-colors disabled:opacity-40"
                    style={{ color: "#6b6688" }}
                    onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = "#4f35cc")}
                    onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = "#6b6688")}
                  >
                    <RefreshCw className="w-3 h-3" />
                    Regenerar
                  </button>
                </div>
              </div>

              <div style={{ background: "#fafaff" }}>
                <Textarea
                  value={prompt}
                  onChange={(e) => onPromptChange(e.target.value)}
                  rows={14}
                  disabled={fieldsReadOnly}
                  className="resize-none border-0 focus-visible:ring-0 text-[13px] leading-relaxed p-4"
                  style={{
                    fontFamily: "'DM Mono', 'Fira Code', 'Courier New', monospace",
                    color: "#131228",
                    background: "transparent",
                  }}
                />
                <div
                  className="flex justify-between items-center px-4 pb-3"
                  style={{ borderTop: "1px solid #e0dff0" }}
                >
                  <span className="text-[11px]" style={{ color: "#9a97b4" }}>
                    Ajusta el texto si es necesario antes de guardar
                  </span>
                  <span
                    className="text-[11px]"
                    style={{ color: prompt.length > 2700 ? "#dc2626" : "#9a97b4", fontFamily: "'DM Mono', monospace" }}
                  >
                    {prompt.length} / 3000
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Empty state */}
          {!showResult && !loading && (
            <p className="text-[12px] text-center" style={{ color: "#9a97b4" }}>
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
            disabled={fieldsReadOnly}
            placeholder="Escribe las instrucciones de personalidad: tono, restricciones, flujos especiales..."
            className={`resize-none text-[13px] leading-relaxed ${INPUT_CLS}`}
            style={{
              fontFamily: "'DM Mono', 'Fira Code', 'Courier New', monospace",
              background: "oklch(98.5% 0.005 280)",
            }}
          />
          <div className="flex justify-between items-center">
            <span className="text-[11px]" style={{ color: "#9a97b4" }}>
              Edición directa
            </span>
            <span
              className="text-[11px]"
              style={{ color: prompt.length > 2700 ? "#dc2626" : "#9a97b4", fontFamily: "'DM Mono', monospace" }}
            >
              {prompt.length} / 3000
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
