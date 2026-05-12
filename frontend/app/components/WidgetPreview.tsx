"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Card, CardContent } from "@/app/components/ui/card";
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
import { Code2, Plug } from "lucide-react";
import { useToast } from "@/app/hooks/use-toast";
import { cn } from "@/lib/utils";

// Position options for select
const POSITION_OPTIONS = [
  { value: "bottom-right", label: "Abajo Derecha" },
  { value: "bottom-left", label: "Abajo Izquierda" },
  { value: "top-right", label: "Arriba Derecha" },
  { value: "top-left", label: "Arriba Izquierda" },
] as const;

type PositionType = (typeof POSITION_OPTIONS)[number]["value"];

export function WidgetPreview() {
  const [width, setWidth] = useState("400");
  const [height, setHeight] = useState("600");
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  // hasEverOpened: una vez abierto, mantenemos iframe montado para preservar
  // estado (scroll, conversación, conexión SSE) en sucesivos toggles.
  const [hasEverOpened, setHasEverOpened] = useState(false);
  const [position, setPosition] = useState<PositionType>("bottom-right");
  const [bubbleStartColor, setBubbleStartColor] = useState("#667eea");
  const [bubbleEndColor, setBubbleEndColor] = useState("#764ba2");
  const [iframeCode, setIframeCode] = useState("");
  // baseUrl is populated in a useEffect to avoid SSR/hydration mismatch
  const [baseUrl, setBaseUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const [hovered, setHovered] = useState(false);
  const [isBouncing, setIsBouncing] = useState(false);
  const loadingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Parsed dimensions for reactive preview — always a valid number in [min, max]
  const parsedWidth = Math.max(200, Math.min(1000, parseInt(width) || 400));
  const parsedHeight = Math.max(300, Math.min(1000, parseInt(height) || 600));

  // Memoized position styles to avoid new object references every render
  const positionStyles = useMemo((): React.CSSProperties => {
    const positions: Record<PositionType, React.CSSProperties> = {
      "bottom-right": { bottom: 56, right: 40 },
      "bottom-left": { bottom: 56, left: 40 },
      "top-right": { top: 40, right: 40 },
      "top-left": { top: 40, left: 40 },
    };
    return positions[position];
  }, [position]);

  // Memoized iframe position styles
  const iframePositionStyles = useMemo((): React.CSSProperties => {
    const positions: Record<PositionType, React.CSSProperties> = {
      "bottom-right": { bottom: 100, right: 20 },
      "bottom-left": { bottom: 100, left: 20 },
      "top-right": { top: 100, right: 20 },
      "top-left": { top: 100, left: 20 },
    };
    return positions[position];
  }, [position]);

  // Resolve base URL on client only to avoid SSR/hydration mismatch
  useEffect(() => {
    setBaseUrl(`${window.location.protocol}//${window.location.host}/chat`);
  }, []);

  const updateIframeCode = useCallback(() => {
    const resolvedBaseUrl = baseUrl ||
      process.env.NEXT_PUBLIC_WIDGET_URL ||
      "http://localhost:3000/chat";
    const hostUrl = baseUrl
      ? `${window.location.protocol}//${window.location.host}`
      : process.env.NEXT_PUBLIC_WIDGET_HOST || "http://localhost:3000";
    // Escape double quotes in gradient string to prevent breaking the HTML attribute
    const bubbleBackground = `linear-gradient(135deg, ${bubbleStartColor} 0%, ${bubbleEndColor} 100%)`
      .replace(/"/g, "&quot;");

    const code = `<script
  src="${hostUrl}/widget-loader.js"
  data-chat-url="${resolvedBaseUrl}"
  data-width="${parsedWidth}"
  data-height="${parsedHeight}"
  data-position="${position}"
  data-bubble-background="${bubbleBackground}"
  defer
></script>`;

    setIframeCode(code);
  }, [baseUrl, bubbleEndColor, bubbleStartColor, parsedHeight, position, parsedWidth]);

  useEffect(() => {
    updateIframeCode();
  }, [updateIframeCode]);

  useEffect(() => {
    return () => {
      if (loadingTimerRef.current) clearTimeout(loadingTimerRef.current);
    };
  }, []);

  const handleCopy = () => {
    toast({
      title: "¡Código copiado!",
      description: "El código del widget ha sido copiado al portapapeles",
    });
  };

  const handleIframeLoad = () => {
    if (loadingTimerRef.current) clearTimeout(loadingTimerRef.current);
    setIsLoading(false);
  };

  const handleIframeError = () => {
    if (loadingTimerRef.current) {
      clearTimeout(loadingTimerRef.current);
      loadingTimerRef.current = null;
    }
    setIsLoading(false);
    toast({
      title: "Error de carga",
      description: "No se pudo cargar el widget. Verifica la conexión.",
      variant: "destructive",
    });
  };

  return (
    <div className="h-full flex flex-col min-h-0 animate-fade-in">
      {/* Header with Integration Button */}
      <div className="flex items-start justify-between mb-6">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold text-foreground">
            Widget del Bot
          </h1>
          <p className="text-muted-foreground">
            Diseña y personaliza el chatbot para tu sitio web
          </p>
        </div>

        {/* Integration Button - Opens Modal */}
        <Dialog>
          <DialogTrigger asChild>
            <Button
              size="lg"
              className="gap-2 bg-gradient-to-r from-primary to-info hover:opacity-90 shadow-lg"
            >
              <Plug className="w-4 h-4" />
              Integrar Widget
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Code2 className="w-5 h-5 text-primary" />
                Código de Integración
              </DialogTitle>
              <DialogDescription>
                Copia este código y pégalo antes de la etiqueta &lt;/body&gt; en
                tu sitio web.
              </DialogDescription>
            </DialogHeader>

            <div className="mt-4">
              <CodeBlock
                code={iframeCode || "<!-- Generando código... -->"}
                language="HTML"
                onCopy={handleCopy}
              />
            </div>

            {/* Steps */}
            <div className="mt-4 grid grid-cols-3 gap-3">
              {[
                { step: "1", title: "Copia", desc: "Usa el botón de copiar" },
                { step: "2", title: "Pega", desc: "Antes de </body>" },
                { step: "3", title: "¡Listo!", desc: "El widget aparecerá" },
              ].map((item) => (
                <div
                  key={item.step}
                  className="flex flex-col items-center text-center p-3 rounded-lg bg-muted/30"
                >
                  <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold mb-2">
                    {item.step}
                  </div>
                  <span className="text-sm font-medium">{item.title}</span>
                  <span className="text-xs text-muted-foreground">
                    {item.desc}
                  </span>
                </div>
              ))}
            </div>

            {/* URL Info */}
            <div className="mt-4 p-3 rounded-lg bg-primary/5 border border-primary/10 text-sm">
              <strong>URL del chat:</strong>{" "}
              <code className="text-primary">
                {baseUrl || "..."}
              </code>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Canvas Builder Layout: Config (left narrow) + Preview (right expanded) */}
      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6 flex-1 min-h-0">
        {/* Left Column: Unified Configuration Panel */}
        <div className="lg:sticky lg:top-6 lg:self-start">
          <Card className="border-border/50">
            <CardContent className="p-0 space-y-6">
              {/* Dimensions Section */}
              <div className="p-4">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                  Dimensiones
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="width" className="text-xs">
                      Ancho
                    </Label>
                    <div className="relative">
                      <Input
                        id="width"
                        type="number"
                        value={width}
                        onChange={(e) => setWidth(e.target.value)}
                        min="200"
                        max="1000"
                        className="h-9 pr-8 text-sm"
                      />
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-mono">
                        px
                      </span>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="height" className="text-xs">
                      Alto
                    </Label>
                    <div className="relative">
                      <Input
                        id="height"
                        type="number"
                        value={height}
                        onChange={(e) => setHeight(e.target.value)}
                        min="300"
                        max="1000"
                        className="h-9 pr-8 text-sm"
                      />
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-mono">
                        px
                      </span>
                    </div>
                  </div>
                </div>
                {/* Size indicator */}
                <div className="mt-2 text-xs text-muted-foreground text-center">
                  {parsedWidth} × {parsedHeight}
                </div>
              </div>

              {/* Divider */}
              <div className="border-t border-border/50" />

              {/* Position Section */}
              <div className="p-4">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                  Posición
                </h3>
                <div className="grid grid-cols-2 gap-1.5">
                  {[
                    { value: "top-left" as PositionType, arrow: "↖", label: "Sup. Izq." },
                    { value: "top-right" as PositionType, arrow: "↗", label: "Sup. Der." },
                    { value: "bottom-left" as PositionType, arrow: "↙", label: "Inf. Izq." },
                    { value: "bottom-right" as PositionType, arrow: "↘", label: "Inf. Der." },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setPosition(opt.value)}
                      className={cn(
                        "flex flex-col items-center justify-center gap-0.5 py-2 px-1 rounded-lg transition-all duration-150",
                        position === opt.value
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
                      )}
                    >
                      <span className="text-base leading-none">{opt.arrow}</span>
                      <span className="text-[10px] font-medium">{opt.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Divider */}
              <div className="border-t border-border/50" />

              {/* Colors Section */}
              <div className="p-4">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                  Colores del Botón
                </h3>
                <div className="space-y-2">
                  <ColorPicker
                    id="bubbleStartColor"
                    label="Color Inicio"
                    value={bubbleStartColor}
                    onChange={setBubbleStartColor}
                  />
                  <ColorPicker
                    id="bubbleEndColor"
                    label="Color Fin"
                    value={bubbleEndColor}
                    onChange={setBubbleEndColor}
                  />
                </div>

                {/* Bubble preview */}
                <div className="mt-3 flex items-center justify-center">
                  <div
                    className="w-12 h-12 rounded-full shadow-md flex items-center justify-center"
                    style={{
                      background: `linear-gradient(135deg, ${bubbleStartColor} 0%, ${bubbleEndColor} 100%)`,
                    }}
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                    </svg>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Preview (The Protagonist) - Expanded */}
        <div className="flex items-start justify-center">
          <div className="w-full">
            <BrowserMockup url="tusitio.com" className="min-h-[800px] h-[calc(100vh-140px)]">
              {/* Simulated webpage content */}
              <div className="space-y-4">
                {!isPreviewOpen && (
                  <>
                    <div className="h-6 bg-muted/60 rounded w-2/3" />
                    <div className="h-4 bg-muted/40 rounded w-1/3" />
                    <div className="mt-8 h-32 bg-muted/30 rounded-lg" />
                    <div className="grid grid-cols-3 gap-4 mt-6">
                      <div className="h-20 bg-muted/40 rounded-lg" />
                      <div className="h-20 bg-muted/40 rounded-lg" />
                      <div className="h-20 bg-muted/40 rounded-lg" />
                    </div>
                    <div className="mt-6 space-y-2">
                      <div className="h-4 bg-muted/50 rounded w-full" />
                      <div className="h-4 bg-muted/40 rounded w-5/6" />
                      <div className="h-4 bg-muted/30 rounded w-4/6" />
                    </div>
                  </>
                )}
              </div>

              {/* Widget Bubble Button */}
              <button
                type="button"
                aria-label={isPreviewOpen ? "Cerrar chat" : "Abrir chat"}
                style={{
                  position: "absolute",
                  ...positionStyles,
                  width: "60px",
                  height: "60px",
                  borderRadius: "50%",
                  background: `linear-gradient(135deg, ${bubbleStartColor} 0%, ${bubbleEndColor} 100%)`,
                  boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
                  zIndex: 60,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  border: "none",
                  padding: 0,
                  transform: isBouncing
                    ? "scale(1.05)"
                    : (!isPreviewOpen && hovered ? "translateY(-4px)" : "translateY(0)"),
                  filter: hovered ? "brightness(1.05)" : "none",
                  transition: "transform 0.5s cubic-bezier(0.4, 0, 0.2, 1), filter 0.2s ease",
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
                  width="28"
                  height="28"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="white"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{
                    position: "absolute",
                    top: "50%",
                    left: "50%",
                    transform: isPreviewOpen
                      ? "translate(-50%, -50%) scale(0.5) rotate(180deg)"
                      : "translate(-50%, -50%) scale(1) rotate(0deg)",
                    opacity: isPreviewOpen ? 0 : 1,
                    transition:
                      "all 0.5s cubic-bezier(0.4, 0, 0.2, 1)",
                  }}
                >
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
                {/* Chevron icon */}
                <svg
                  width="28"
                  height="28"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="white"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{
                    position: "absolute",
                    top: "50%",
                    left: "50%",
                    transform: isPreviewOpen
                      ? "translate(-50%, -50%) scale(1) rotate(0deg)"
                      : "translate(-50%, -50%) scale(0.5) rotate(-180deg)",
                    opacity: isPreviewOpen ? 1 : 0,
                    transition:
                      "all 0.5s cubic-bezier(0.4, 0, 0.2, 1)",
                  }}
                >
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>

              {hasEverOpened && (
                <>
                  <iframe
                    src={baseUrl || "/chat"}
                    style={{
                      position: "absolute",
                      ...iframePositionStyles,
                      width: `${parsedWidth}px`,
                      height: `${parsedHeight}px`,
                      border: "none",
                      borderRadius: "16px",
                      boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
                      zIndex: 50,
                      transition: "width 0.3s ease, height 0.3s ease",
                      visibility: isPreviewOpen ? "visible" : "hidden",
                      pointerEvents: isPreviewOpen ? "auto" : "none",
                    }}
                    className="transition-all duration-200"
                    title="AI Chatbot Widget Preview"
                    onLoad={handleIframeLoad}
                    onError={handleIframeError}
                  />
                  {isLoading && isPreviewOpen && (
                    <div
                      style={{
                        position: "absolute",
                        ...iframePositionStyles,
                        width: `${parsedWidth}px`,
                        height: `${parsedHeight}px`,
                        zIndex: 55,
                        borderRadius: "16px",
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
