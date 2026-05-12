"use client";

import {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
  useLayoutEffect,
} from "react";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/app/components/ui/dialog";
import { BrowserMockup } from "@/app/components/ui/BrowserMockup";
import { CodeBlock } from "@/app/components/ui/CodeBlock";
import { ColorPicker } from "@/app/components/ui/ColorPicker";
import { Code2, Monitor, Pencil, Plug, Smartphone } from "lucide-react";
import { useToast } from "@/app/hooks/use-toast";
import { cn } from "@/lib/utils";

type PositionType = "bottom-right" | "bottom-left" | "top-right" | "top-left";
type DeviceMode   = "desktop" | "mobile";

interface WidgetConfig {
  width: string;
  height: string;
  position: PositionType;
  bubbleStartColor: string;
  bubbleEndColor: string;
}

const DEFAULT_CONFIG: WidgetConfig = {
  width: "400",
  height: "600",
  position: "bottom-right",
  bubbleStartColor: "#667eea",
  bubbleEndColor: "#764ba2",
};

const STORAGE_KEY = "widget-config";

const POSITION_LABELS: Record<PositionType, string> = {
  "bottom-right": "Inferior derecha",
  "bottom-left":  "Inferior izquierda",
  "top-right":    "Superior derecha",
  "top-left":     "Superior izquierda",
};

// ── Visual position mini-map ─────────────────────────────────────────────────
// Each quadrant is fully clickable — dot sits in the matching corner.
function PositionMap({
  value,
  onChange,
  disabled,
}: {
  value: PositionType;
  onChange: (v: PositionType) => void;
  disabled: boolean;
}) {
  const quadrants: { value: PositionType; flex: string }[] = [
    { value: "top-left",     flex: "items-start justify-start" },
    { value: "top-right",    flex: "items-start justify-end"   },
    { value: "bottom-left",  flex: "items-end   justify-start" },
    { value: "bottom-right", flex: "items-end   justify-end"   },
  ];

  return (
    <div className="relative h-[90px] rounded-lg border border-border bg-muted/20 overflow-hidden select-none">
      {/* Crosshair dividers */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 bottom-0 left-1/2 w-px bg-border/60" />
        <div className="absolute left-0 right-0 top-1/2 h-px bg-border/60" />
      </div>
      {/* Centered page skeleton */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="space-y-1 w-[40%]">
          <div className="h-1.5 bg-muted-foreground/20 rounded-full" />
          <div className="h-1 bg-muted-foreground/15 rounded-full w-3/4" />
          <div className="h-3 bg-muted-foreground/10 rounded mt-1" />
        </div>
      </div>
      {/* Clickable quadrants */}
      <div className="absolute inset-0 grid grid-cols-2 grid-rows-2">
        {quadrants.map((q) => {
          const active = value === q.value;
          return (
            <button
              key={q.value}
              type="button"
              aria-label={POSITION_LABELS[q.value]}
              aria-pressed={active}
              disabled={disabled}
              onClick={() => onChange(q.value)}
              className={cn(
                "flex p-2.5 transition-colors duration-150 outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-primary",
                q.flex,
                active ? "bg-primary/10" : "hover:bg-muted/70",
                disabled && "pointer-events-none"
              )}
            >
              <div
                className={cn(
                  "w-4 h-4 rounded-full transition-all duration-150 flex-shrink-0",
                  active
                    ? "bg-primary ring-2 ring-primary/25 ring-offset-1"
                    : "bg-muted-foreground/25 hover:bg-primary/40"
                )}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────
export function WidgetPreview() {
  const [savedConfig, setSavedConfig] = useState<WidgetConfig>(DEFAULT_CONFIG);
  const [config,      setConfig]      = useState<WidgetConfig>(DEFAULT_CONFIG);
  const [locked,      setLocked]      = useState(true);
  const [deviceMode,  setDeviceMode]  = useState<DeviceMode>("desktop");

  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [hasEverOpened, setHasEverOpened] = useState(false);
  const [iframeCode,    setIframeCode]    = useState("");
  const [baseUrl,       setBaseUrl]       = useState("");
  const [isLoading,     setIsLoading]     = useState(false);
  const [hovered,       setHovered]       = useState(false);
  const [isBouncing,    setIsBouncing]    = useState(false);

  const { toast }         = useToast();
  const loadingTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const [previewScale, setPreviewScale] = useState(1);

  const MOCKUP_W = deviceMode === "desktop" ? 1280 : 390;
  const MOCKUP_H = deviceMode === "desktop" ? 800  : 844;

  // Recompute scale whenever the container or device mode changes
  useLayoutEffect(() => {
    const el = previewContainerRef.current;
    if (!el) return;
    const compute = () => {
      const { width, height } = el.getBoundingClientRect();
      if (width > 0 && height > 0) {
        setPreviewScale(Math.min(width / MOCKUP_W, height / MOCKUP_H) * 0.92);
      }
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, [MOCKUP_W, MOCKUP_H]);

  const parsedWidth  = Math.max(200, Math.min(1000, parseInt(config.width)  || 400));
  const parsedHeight = Math.max(300, Math.min(1000, parseInt(config.height) || 600));

  const isDirty = useMemo(
    () => JSON.stringify(config) !== JSON.stringify(savedConfig),
    [config, savedConfig]
  );

  // Load persisted config and resolve base URL on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as WidgetConfig;
        setSavedConfig(parsed);
        setConfig(parsed);
      }
    } catch {
      // ignore malformed data
    }
    setBaseUrl(`${window.location.protocol}//${window.location.host}/chat`);
  }, []);

  const positionStyles = useMemo((): React.CSSProperties => {
    const map: Record<PositionType, React.CSSProperties> = {
      "bottom-right": { bottom: 56, right: 40 },
      "bottom-left":  { bottom: 56, left: 40 },
      "top-right":    { top: 40,    right: 40 },
      "top-left":     { top: 40,    left: 40 },
    };
    return map[config.position];
  }, [config.position]);

  const iframePositionStyles = useMemo((): React.CSSProperties => {
    const map: Record<PositionType, React.CSSProperties> = {
      "bottom-right": { bottom: 100, right: 20 },
      "bottom-left":  { bottom: 100, left: 20 },
      "top-right":    { top: 100,    right: 20 },
      "top-left":     { top: 100,    left: 20 },
    };
    return map[config.position];
  }, [config.position]);

  const updateIframeCode = useCallback(() => {
    const resolvedBaseUrl =
      baseUrl || process.env.NEXT_PUBLIC_WIDGET_URL || "http://localhost:3000/chat";
    const hostUrl = baseUrl
      ? `${window.location.protocol}//${window.location.host}`
      : process.env.NEXT_PUBLIC_WIDGET_HOST || "http://localhost:3000";
    const bubbleBackground = `linear-gradient(135deg, ${config.bubbleStartColor} 0%, ${config.bubbleEndColor} 100%)`.replace(/"/g, "&quot;");
    setIframeCode(
`<script
  src="${hostUrl}/widget-loader.js"
  data-chat-url="${resolvedBaseUrl}"
  data-width="${parsedWidth}"
  data-height="${parsedHeight}"
  data-position="${config.position}"
  data-bubble-background="${bubbleBackground}"
  defer
></script>`
    );
  }, [baseUrl, config, parsedWidth, parsedHeight]);

  useEffect(() => { updateIframeCode(); }, [updateIframeCode]);

  useEffect(() => {
    return () => { if (loadingTimerRef.current) clearTimeout(loadingTimerRef.current); };
  }, []);

  const handleEdit    = () => setLocked(false);
  const handleDiscard = () => { setConfig(savedConfig); setLocked(true); };
  const handleSave    = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    setSavedConfig({ ...config });
    setLocked(true);
    toast({ title: "Configuración guardada" });
  };

  const handleCopy = () =>
    toast({ title: "Código copiado", description: "Pégalo antes de </body> en tu sitio." });

  const handleIframeLoad = () => {
    if (loadingTimerRef.current) clearTimeout(loadingTimerRef.current);
    setIsLoading(false);
  };

  const handleIframeError = () => {
    if (loadingTimerRef.current) { clearTimeout(loadingTimerRef.current); loadingTimerRef.current = null; }
    setIsLoading(false);
    toast({ title: "Error de carga", description: "No se pudo cargar el widget.", variant: "destructive" });
  };

  return (
    <div className="flex h-full overflow-hidden">

      {/* ── Inspector ──────────────────────────────────────────────────────── */}
      <aside className="w-[264px] flex-shrink-0 flex flex-col border-r border-border bg-card">

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-border flex-shrink-0">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-0.5">
              Widget
            </p>
            <h2 className="text-sm font-semibold text-foreground leading-tight">
              Inspector
            </h2>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleEdit}
            disabled={!locked}
            aria-label="Editar configuración"
            className={cn(
              "h-7 w-7 text-muted-foreground hover:text-foreground",
              !locked && "opacity-30 pointer-events-none"
            )}
          >
            <Pencil className="w-3.5 h-3.5" />
          </Button>
        </div>

        {/* Form */}
        <div className="flex-1 overflow-y-auto">

          {/* Dimensiones */}
          <section className="px-5 pt-5 pb-4 space-y-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
              Dimensiones
            </p>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label htmlFor="w-input" className="text-[11px] text-muted-foreground">Ancho</Label>
                <div className="relative">
                  <Input
                    id="w-input"
                    type="number"
                    value={config.width}
                    onChange={(e) => setConfig((c) => ({ ...c, width: e.target.value }))}
                    min="200" max="1000"
                    disabled={locked}
                    className="h-8 pr-7 text-xs font-mono"
                  />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground/50 font-mono select-none">
                    px
                  </span>
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="h-input" className="text-[11px] text-muted-foreground">Alto</Label>
                <div className="relative">
                  <Input
                    id="h-input"
                    type="number"
                    value={config.height}
                    onChange={(e) => setConfig((c) => ({ ...c, height: e.target.value }))}
                    min="300" max="1000"
                    disabled={locked}
                    className="h-8 pr-7 text-xs font-mono"
                  />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground/50 font-mono select-none">
                    px
                  </span>
                </div>
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground/50 font-mono text-center">
              {parsedWidth} × {parsedHeight}
            </p>
          </section>

          <div className="mx-5 border-t border-border/60" />

          {/* Posición */}
          <section className="px-5 pt-4 pb-4 space-y-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
              Posición
            </p>
            <div className={cn("transition-opacity duration-200", locked && "opacity-50")}>
              <PositionMap
                value={config.position}
                onChange={(v) => setConfig((c) => ({ ...c, position: v }))}
                disabled={locked}
              />
            </div>
            <p className="text-[11px] text-muted-foreground/60 text-center">
              {POSITION_LABELS[config.position]}
            </p>
          </section>

          <div className="mx-5 border-t border-border/60" />

          {/* Botón */}
          <section className="px-5 pt-4 pb-5 space-y-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
              Botón
            </p>

            <div className={cn("space-y-2 transition-opacity duration-200", locked && "opacity-50 pointer-events-none")}>
              <ColorPicker
                id="bubbleStartColor"
                label="Inicio"
                value={config.bubbleStartColor}
                onChange={(v) => setConfig((c) => ({ ...c, bubbleStartColor: v }))}
              />
              <ColorPicker
                id="bubbleEndColor"
                label="Fin"
                value={config.bubbleEndColor}
                onChange={(v) => setConfig((c) => ({ ...c, bubbleEndColor: v }))}
              />
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 px-5 py-4 border-t border-border space-y-2.5">
          {!locked && (
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleDiscard}
                className="flex-1 h-8 text-xs"
              >
                Cancelar
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleSave}
                disabled={!isDirty}
                className="flex-1 h-8 text-xs gradient-primary hover:opacity-90 text-white"
              >
                Guardar
              </Button>
            </div>
          )}
          <p className="text-[10px] text-center text-muted-foreground/50">
            {isDirty
              ? <span className="text-warning font-medium">Cambios sin guardar</span>
              : locked
              ? "Clic en el lápiz para editar"
              : "Modo edición activo"
            }
          </p>
        </div>
      </aside>

      {/* ── Stage ──────────────────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">

        {/* Stage toolbar */}
        <div className="flex items-center justify-between px-5 py-2.5 border-b border-border bg-card/50 backdrop-blur-sm flex-shrink-0">
          {/* Device toggle */}
          <div className="flex items-center gap-0.5 bg-muted rounded-md p-0.5">
            {(["desktop", "mobile"] as DeviceMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setDeviceMode(mode)}
                aria-pressed={deviceMode === mode}
                className={cn(
                  "flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium transition-colors",
                  deviceMode === mode
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {mode === "desktop"
                  ? <Monitor className="w-3.5 h-3.5" />
                  : <Smartphone className="w-3.5 h-3.5" />
                }
                {mode === "desktop" ? "Desktop" : "Móvil"}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3">
            {/* Zoom readout */}
            <span className="text-[11px] font-mono text-muted-foreground/50 tabular-nums">
              {Math.round(previewScale * 100)}%
            </span>

            {/* Integrar */}
            <Dialog>
              <DialogTrigger asChild>
                <Button
                  size="sm"
                  className="gap-1.5 h-7 text-xs bg-gradient-to-r from-primary to-info hover:opacity-90 shadow-sm"
                >
                  <Plug className="w-3 h-3" />
                  Integrar
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Code2 className="w-5 h-5 text-primary" />
                    Código de Integración
                  </DialogTitle>
                  <DialogDescription>
                    Copia este código y pégalo antes de la etiqueta &lt;/body&gt; en tu sitio web.
                  </DialogDescription>
                </DialogHeader>
                <div className="mt-4">
                  <CodeBlock
                    code={iframeCode || "<!-- Generando código... -->"}
                    language="HTML"
                    onCopy={handleCopy}
                  />
                </div>
                <div className="mt-4 grid grid-cols-3 gap-3">
                  {[
                    { step: "1", title: "Copia",  desc: "Usa el botón de copiar" },
                    { step: "2", title: "Pega",   desc: "Antes de </body>" },
                    { step: "3", title: "Listo",  desc: "El widget aparecerá" },
                  ].map((item) => (
                    <div key={item.step} className="flex flex-col items-center text-center p-3 rounded-lg bg-muted/30">
                      <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold mb-2">
                        {item.step}
                      </div>
                      <span className="text-sm font-medium">{item.title}</span>
                      <span className="text-xs text-muted-foreground">{item.desc}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-4 p-3 rounded-lg bg-primary/5 border border-primary/10 text-sm">
                  <strong>URL del chat:</strong>{" "}
                  <code className="text-primary">{baseUrl || "..."}</code>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Canvas: dot-grid background, BrowserMockup centered + scaled */}
        <div
          ref={previewContainerRef}
          className="flex-1 overflow-hidden relative"
          style={{
            backgroundImage: "radial-gradient(circle, hsl(var(--border)) 1px, transparent 1px)",
            backgroundSize: "20px 20px",
            backgroundColor: "hsl(var(--muted) / 0.35)",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: `translate(-50%, -50%) scale(${previewScale})`,
              transformOrigin: "center center",
            }}
          >
            <BrowserMockup
              url="tusitio.com"
              style={{ width: MOCKUP_W, height: MOCKUP_H }}
            >
              {/* Simulated website — navbar + hero + cards */}
              <div className="pointer-events-none">
                {/* Navbar */}
                <div className="flex items-center justify-between px-8 py-4 border-b border-gray-100">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-gray-200" />
                    <div className="h-3 w-24 bg-gray-200 rounded-full" />
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="h-2.5 w-10 bg-gray-100 rounded-full" />
                    <div className="h-2.5 w-10 bg-gray-100 rounded-full" />
                    <div className="h-2.5 w-10 bg-gray-100 rounded-full" />
                    <div className="h-8 w-24 bg-gray-800 rounded-full" />
                  </div>
                </div>
                {/* Hero */}
                <div className="px-8 pt-14 pb-10">
                  <div className="h-2.5 w-28 bg-gray-100 rounded-full mb-5" />
                  <div className="h-9 w-3/5 bg-gray-200 rounded-lg mb-3" />
                  <div className="h-7 w-2/5 bg-gray-200 rounded-lg mb-6" />
                  <div className="space-y-2 mb-8">
                    <div className="h-3 w-96 bg-gray-100 rounded-full" />
                    <div className="h-3 w-80 bg-gray-100 rounded-full" />
                  </div>
                  <div className="flex gap-3">
                    <div className="h-11 w-32 bg-gray-800 rounded-full" />
                    <div className="h-11 w-32 bg-gray-100 rounded-full border border-gray-200" />
                  </div>
                </div>
                {/* Cards */}
                <div className="px-8 grid grid-cols-3 gap-5">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="p-5 border border-gray-100 rounded-2xl">
                      <div className="w-9 h-9 bg-gray-100 rounded-xl mb-4" />
                      <div className="h-3 w-3/4 bg-gray-200 rounded-full mb-2.5" />
                      <div className="h-2.5 w-full bg-gray-100 rounded-full mb-1.5" />
                      <div className="h-2.5 w-2/3 bg-gray-100 rounded-full" />
                    </div>
                  ))}
                </div>
              </div>

              {/* Widget bubble */}
              <button
                type="button"
                aria-label={isPreviewOpen ? "Cerrar chat" : "Abrir chat"}
                style={{
                  position: "absolute",
                  ...positionStyles,
                  width: 60,
                  height: 60,
                  borderRadius: "50%",
                  background: `linear-gradient(135deg, ${config.bubbleStartColor} 0%, ${config.bubbleEndColor} 100%)`,
                  boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
                  zIndex: 60,
                  border: "none",
                  padding: 0,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transform: isBouncing
                    ? "scale(1.05)"
                    : !isPreviewOpen && hovered
                    ? "translateY(-4px)"
                    : "translateY(0)",
                  filter: hovered ? "brightness(1.05)" : "none",
                  transition: "transform 0.5s cubic-bezier(0.4,0,0.2,1), filter 0.2s ease",
                }}
                onClick={() => {
                  const next = !isPreviewOpen;
                  setIsPreviewOpen(next);
                  if (next) {
                    if (!hasEverOpened) {
                      setHasEverOpened(true);
                      setIsLoading(true);
                      loadingTimerRef.current = setTimeout(() => setIsLoading(false), 15000);
                    }
                    setIsBouncing(true);
                    setTimeout(() => setIsBouncing(false), 200);
                  }
                }}
                onMouseEnter={() => setHovered(true)}
                onMouseLeave={() => setHovered(false)}
              >
                {/* Chat icon */}
                <svg
                  width="28" height="28" viewBox="0 0 24 24"
                  fill="none" stroke="white" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
                  style={{
                    position: "absolute", top: "50%", left: "50%",
                    transform: isPreviewOpen
                      ? "translate(-50%,-50%) scale(0.5) rotate(180deg)"
                      : "translate(-50%,-50%) scale(1) rotate(0deg)",
                    opacity: isPreviewOpen ? 0 : 1,
                    transition: "all 0.5s cubic-bezier(0.4,0,0.2,1)",
                  }}
                >
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
                {/* Chevron icon */}
                <svg
                  width="28" height="28" viewBox="0 0 24 24"
                  fill="none" stroke="white" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
                  style={{
                    position: "absolute", top: "50%", left: "50%",
                    transform: isPreviewOpen
                      ? "translate(-50%,-50%) scale(1) rotate(0deg)"
                      : "translate(-50%,-50%) scale(0.5) rotate(-180deg)",
                    opacity: isPreviewOpen ? 1 : 0,
                    transition: "all 0.5s cubic-bezier(0.4,0,0.2,1)",
                  }}
                >
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>

              {/* Live iframe + loading state */}
              {hasEverOpened && (
                <>
                  <iframe
                    src={baseUrl || "/chat"}
                    style={{
                      position: "absolute",
                      ...iframePositionStyles,
                      width: parsedWidth,
                      height: parsedHeight,
                      border: "none",
                      borderRadius: 16,
                      boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)",
                      zIndex: 50,
                      transition: "width 0.3s ease, height 0.3s ease",
                      visibility: isPreviewOpen ? "visible" : "hidden",
                      pointerEvents: isPreviewOpen ? "auto" : "none",
                    }}
                    title="AI Chatbot Widget Preview"
                    onLoad={handleIframeLoad}
                    onError={handleIframeError}
                  />
                  {isLoading && isPreviewOpen && (
                    <div
                      style={{
                        position: "absolute",
                        ...iframePositionStyles,
                        width: parsedWidth,
                        height: parsedHeight,
                        zIndex: 55,
                        borderRadius: 16,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        background: "hsl(var(--muted) / 0.85)",
                        backdropFilter: "blur(4px)",
                      }}
                    >
                      <div className="flex flex-col items-center gap-2 text-muted-foreground">
                        <div className="w-8 h-8 rounded-full border-2 border-muted-foreground/30 border-t-primary animate-spin" />
                        <span className="text-xs">Cargando chat...</span>
                      </div>
                    </div>
                  )}
                </>
              )}
            </BrowserMockup>
          </div>
        </div>
      </div>
    </div>
  );
}
