import { useState, useEffect, useCallback } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import { Copy, Eye, MessageCircle, X, Settings } from "lucide-react";
import { useToast } from "@/app/components/ui/use-toast";

export function WidgetPreview() {
  const [width, setWidth] = useState("400");
  const [height, setHeight] = useState("600");
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [position, setPosition] = useState("bottom-right");
  const [bubbleStartColor, setBubbleStartColor] = useState("#667eea");
  const [bubbleEndColor, setBubbleEndColor] = useState("#764ba2");
  const [iframeCode, setIframeCode] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const { toast } = useToast();

  // Función para obtener la URL base (siempre /chat)
  const getBaseUrl = () => {
    if (typeof window !== 'undefined') {
      return `${window.location.protocol}//${window.location.host}/chat`;
    }
    return process.env.NEXT_PUBLIC_WIDGET_URL || "http://localhost:3000/chat";
  };

  // Función para obtener estilos de posición
  const getPositionStyles = () => {
    const positions = {
      "bottom-right": "position: fixed; bottom: 20px; right: 20px;",
      "bottom-left": "position: fixed; bottom: 20px; left: 20px;",
      "top-right": "position: fixed; top: 20px; right: 20px;",
      "top-left": "position: fixed; top: 20px; left: 20px;",
    };
    return positions[position as keyof typeof positions] || positions["bottom-right"];
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(iframeCode);
    toast({
      title: "Código copiado",
      description: "El código del iframe ha sido copiado al portapapeles",
    });
  };

  const updateIframeCode = useCallback(() => {
    const baseUrl = getBaseUrl();
    const hostUrl = typeof window !== 'undefined'
      ? `${window.location.protocol}//${window.location.host}`
      : (process.env.NEXT_PUBLIC_WIDGET_HOST || "http://localhost:3000");
    const bubbleBackground = `linear-gradient(135deg, ${bubbleStartColor} 0%, ${bubbleEndColor} 100%)`;
    const code = `<script 
  src="${hostUrl}/widget-loader.js" 
  data-chat-url="${baseUrl}" 
  data-width="${width}" 
  data-height="${height}" 
  data-position="${position}" 
  data-bubble-background="${bubbleBackground}" 
  defer 
></script>`;

    setIframeCode(code);
  }, [bubbleEndColor, bubbleStartColor, height, position, width]);

  // Actualizar código automáticamente cuando cambien los parámetros
  useEffect(() => {
    updateIframeCode();
  }, [updateIframeCode]);

  const handleWidthChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setWidth(e.target.value);
  };

  const handleHeightChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setHeight(e.target.value);
  };

  const handlePositionChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setPosition(e.target.value);
  };

  // Theme feature placeholder - TODO: implement when needed

  const handleIframeLoad = () => {
    setIsLoading(false);
    setError("");
  };

  const handleIframeError = () => {
    setIsLoading(false);
    setError("Error al cargar el widget. Verifica la conexión.");
    toast({
      title: "Error de carga",
      description: "No se pudo cargar el widget. Verifica la conexión.",
      variant: "destructive",
    });
  };

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-4xl font-bold text-foreground">Widget del Bot</h1>
        <p className="text-xl text-muted-foreground">
          Previsualiza y obtén el código para incrustar el chatbot
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Vista previa */}
        <Card className="border-border/50">
          <CardHeader className="p-4">
            <CardTitle className="flex items-center gap-2">
              <Eye className="w-5 h-5 text-primary" />
              Vista Previa
            </CardTitle>
            <CardDescription>
              Así se verá el bot en tu sitio web
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4">
            <div
              className="relative bg-gradient-to-br from-muted/30 to-secondary/10 p-6 rounded-lg border border-border/30 flex flex-col justify-center overflow-visible h-full"
              style={{ minHeight: `${parseInt(height, 10) + 120}px` }}
            >
              {/* Simulación de una página web */}
              {!isPreviewOpen && (
                <div className="space-y-4 text-sm text-muted-foreground">
                  <div className="h-4 bg-muted rounded w-3/4"></div>
                  <div className="h-4 bg-muted rounded w-1/2"></div>
                  <div className="h-4 bg-muted rounded w-5/6"></div>
                  <div className="h-16 bg-muted rounded"></div>
                  <div className="h-4 bg-muted rounded w-2/3"></div>
                </div>
              )}

              <div
                style={{
                  position: 'absolute',
                  ...(position === 'bottom-right' ? { bottom: 20, right: 20 } :
                    position === 'bottom-left' ? { bottom: 20, left: 20 } :
                      position === 'top-right' ? { top: 20, right: 20 } : { top: 20, left: 20 }),
                  width: '60px',
                  height: '60px',
                  borderRadius: '50%',
                  background: `linear-gradient(135deg, ${bubbleStartColor} 0%, ${bubbleEndColor} 100%)`,
                  boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
                  zIndex: 1000,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer'
                }}
                onClick={() => {
                  const next = !isPreviewOpen;
                  setIsPreviewOpen(next);
                  if (next) {
                    setIsLoading(true);
                    setError("");
                  }
                }}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2}
                  style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: isPreviewOpen
                      ? 'translate(-50%, -50%) scale(0.5) rotate(90deg)'
                      : 'translate(-50%, -50%) scale(1) rotate(0deg)',
                    opacity: isPreviewOpen ? 0 : 1,
                    transition: 'all 0.3s cubic-bezier(0.68, -0.55, 0.27, 1.55)'
                  }}
                >
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2}
                  style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: isPreviewOpen
                      ? 'translate(-50%, -50%) scale(1) rotate(0deg)'
                      : 'translate(-50%, -50%) scale(0.5) rotate(-90deg)',
                    opacity: isPreviewOpen ? 1 : 0,
                    transition: 'all 0.3s cubic-bezier(0.68, -0.55, 0.27, 1.55)'
                  }}
                >
                  <path d="M18 6L6 18" />
                  <path d="M6 6L18 18" />
                </svg>
              </div>

              {/* Vista previa del iframe */}
              <iframe
                src={getBaseUrl()}
                width={width}
                height={height}
                style={{
                  position: 'absolute',
                  ...(position === 'bottom-right' ? { bottom: 90, right: 20 } :
                    position === 'bottom-left' ? { bottom: 90, left: 20 } :
                      position === 'top-right' ? { top: 90, right: 20 } : { top: 90, left: 20 }),
                  display: isPreviewOpen ? 'block' : 'none',
                  border: 'none',
                  borderRadius: '16px',
                  boxShadow: '0 8px 32px rgba(0,0,0,0.1)'
                }}
                title="AI Chatbot Widget Preview"
                onLoad={handleIframeLoad}
                onError={handleIframeError}
              />
            </div>
          </CardContent>
        </Card>

        {/* Integración: código + pasos */}
        <Card className="border-border/50">
          <CardHeader className="p-4">
            <CardTitle className="flex items-center gap-2">
              <Copy className="w-5 h-5 text-primary" />
              Integración
            </CardTitle>
            <CardDescription>
              Copia este código y pégalo en tu sitio web. Los cambios se actualizan automáticamente.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 p-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <div>
                <Label htmlFor="iframe-code">Código completo del widget</Label>
                <div className="relative mt-1">
                  <textarea
                    id="iframe-code"
                    value={iframeCode}
                    className="w-full h-64 p-3 text-sm border border-border rounded-md bg-background font-mono resize-none dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700"
                    readOnly
                  />
                  <Button
                    size="sm"
                    onClick={copyToClipboard}
                    className="absolute top-2 right-2 gradient-primary hover:opacity-90"
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-1">Copia nuevamente el código si cambias la configuración.</p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-foreground mb-3">Lista de Pasos</h3>
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">1</div>
                    <div>
                      <div className="text-sm font-medium">Copia el código</div>
                      <div className="text-xs text-muted-foreground">Usa el botón de copiar del bloque de código</div>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">2</div>
                    <div>
                      <div className="text-sm font-medium">Pégalo en tu &lt;body&gt;</div>
                      <div className="text-xs text-muted-foreground">Inserta el snippet antes de cerrar la etiqueta &lt;/body&gt;</div>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">3</div>
                    <div>
                      <div className="text-sm font-medium">¡Listo!</div>
                      <div className="text-xs text-muted-foreground">Verás un botón flotante que abre el chat</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Configuración básica */}
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-foreground">Configuración Básica</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="width">Ancho (px)</Label>
                  <Input
                    id="width"
                    type="number"
                    value={width}
                    onChange={handleWidthChange}
                    className="mt-1 h-11"
                    min="200"
                    max="800"
                  />
                </div>
                <div>
                  <Label htmlFor="height">Alto (px)</Label>
                  <Input
                    id="height"
                    type="number"
                    value={height}
                    onChange={handleHeightChange}
                    className="mt-1 h-11"
                    min="300"
                    max="1000"
                  />
                </div>
              </div>
            </div>

            {/* Configuración avanzada */}
            <div className="space-y-3 border-t pt-4">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <Settings className="w-4 h-4" />
                Configuración Avanzada
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="position">Posición</Label>
                  <select
                    id="position"
                    value={position}
                    onChange={handlePositionChange}
                    className="w-full mt-1 h-11 px-2 border border-border rounded-md bg-background"
                  >
                    <option value="bottom-right">Abajo Derecha</option>
                    <option value="bottom-left">Abajo Izquierda</option>
                    <option value="top-right">Arriba Derecha</option>
                    <option value="top-left">Arriba Izquierda</option>
                  </select>
                </div>
                {/* Theme selector removed - feature not yet implemented */}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="bubbleStartColor">Color Inicio</Label>
                  <Input
                    id="bubbleStartColor"
                    type="color"
                    value={bubbleStartColor}
                    onChange={(e) => setBubbleStartColor(e.target.value)}
                    className="mt-1 h-11 p-1"
                  />
                </div>
                <div>
                  <Label htmlFor="bubbleEndColor">Color Fin</Label>
                  <Input
                    id="bubbleEndColor"
                    type="color"
                    value={bubbleEndColor}
                    onChange={(e) => setBubbleEndColor(e.target.value)}
                    className="mt-1 h-11 p-1"
                  />
                </div>
              </div>

              <div className="bg-muted/30 p-3 rounded-lg">
                <p className="text-xs text-muted-foreground">
                  <strong>URL del chat:</strong> {getBaseUrl()}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  El widget siempre apunta a la página de chat de tu aplicación.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Se eliminaron tarjetas grandes de instrucciones; ahora están dentro de Integración */}
    </div>
  );
}
