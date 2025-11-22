import { useState, useEffect } from "react";
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
  const [theme, setTheme] = useState("default");
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

  const updateIframeCode = () => {
    const baseUrl = getBaseUrl();
    const positionStyles = getPositionStyles();
    const themeParam = theme !== "default" ? `?theme=${theme}` : "";
    
    // Generar código que incluye el botón flotante del widget
    const code = `<!-- Widget del Chatbot -->
<div id="chatbot-widget" style="${positionStyles} z-index: 1000;">
  <!-- Botón flotante del widget -->
  <div id="chatbot-button" style="width: 60px; height: 60px; border-radius: 50%; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); display: flex; align-items: center; justify-content: center; cursor: pointer; box-shadow: 0 4px 20px rgba(0,0,0,0.15); transition: transform 0.2s ease;" onclick="toggleChatbot()">
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
    </svg>
  </div>
  
  <!-- Iframe del chat (inicialmente oculto) -->
  <iframe 
    id="chatbot-iframe"
    src="${baseUrl}${themeParam}" 
    width="${width}" 
    height="${height}" 
    frameborder="0" 
    style="display: none; border-radius: 16px; box-shadow: 0 8px 32px rgba(0,0,0,0.1); margin-bottom: 10px;"
    title="AI Chatbot Widget">
  </iframe>
</div>

<script>
function toggleChatbot() {
  var iframe = document.getElementById('chatbot-iframe');
  var button = document.getElementById('chatbot-button');
  
  if (iframe.style.display === 'none') {
    iframe.style.display = 'block';
    button.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
  } else {
    iframe.style.display = 'none';
    button.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>';
  }
}
</script>`;
    
    setIframeCode(code);
  };

  // Actualizar código automáticamente cuando cambien los parámetros
  useEffect(() => {
    updateIframeCode();
  }, [width, height, position, theme]);

  const handleWidthChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setWidth(e.target.value);
  };

  const handleHeightChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setHeight(e.target.value);
  };

  const handlePositionChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setPosition(e.target.value);
  };

  const handleThemeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setTheme(e.target.value);
  };

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
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Eye className="w-5 h-5 text-primary" />
              Vista Previa
            </CardTitle>
            <CardDescription>
              Así se verá el bot en tu sitio web
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="relative bg-gradient-to-br from-muted/30 to-secondary/10 p-8 rounded-lg h-[600px] border border-border/30 flex flex-col justify-center overflow-visible">
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

              {/* Widget flotante simulado - Ahora incluye el botón flotante */}
              {!isPreviewOpen && (
                <div
                  className={`absolute ${
                    position === 'bottom-right' ? 'bottom-4 right-4' :
                    position === 'bottom-left' ? 'bottom-4 left-4' :
                    position === 'top-right' ? 'top-4 right-4' :
                    'top-4 left-4'
                  } w-16 h-16 rounded-full gradient-primary flex items-center justify-center shadow-lg hover:scale-110 transition-transform cursor-pointer`}
                  onClick={() => {
                    setIsPreviewOpen(true);
                    setIsLoading(true);
                    setError("");
                  }}
                >
                  <MessageCircle className="w-8 h-8 text-white" />
                </div>
              )}

              {/* Vista previa del iframe */}
              {isPreviewOpen && (
                <div
                  className="absolute inset-0 flex items-center justify-center z-50"
                  style={{ width: "100%", height: "100%" }}
                >
                  <div
                    className="relative"
                    style={{ width: `${width}px`, height: `${height}px` }}
                  >
                    {isLoading && (
                      <div className="absolute inset-0 flex items-center justify-center bg-background/80 rounded-2xl">
                        <div className="text-center">
                          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
                          <p className="text-sm text-muted-foreground">Cargando widget...</p>
                        </div>
                      </div>
                    )}
                    {error && (
                      <div className="absolute inset-0 flex items-center justify-center bg-background/80 rounded-2xl">
                        <div className="text-center p-4">
                          <div className="text-destructive mb-2">⚠️</div>
                          <p className="text-sm text-destructive">{error}</p>
                        </div>
                      </div>
                    )}
                    <iframe
                      src={getBaseUrl()}
                      width={width}
                      height={height}
                      style={{
                        border: "none",
                        borderRadius: "16px",
                        boxShadow: "0 8px 32px rgba(0,0,0,0.1)",
                      }}
                      title="AI Chatbot Widget Preview"
                      onLoad={handleIframeLoad}
                      onError={handleIframeError}
                    />
                    <button
                      onClick={() => {
                        setIsPreviewOpen(false);
                        setIsLoading(false);
                        setError("");
                      }}
                      className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-destructive text-white flex items-center justify-center shadow-md z-50 hover:bg-destructive/90 transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Integración: código + pasos */}
        <Card className="border-border/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Copy className="w-5 h-5 text-primary" />
              Integración
            </CardTitle>
            <CardDescription>
              Copia este código y pégalo en tu sitio web. Los cambios se actualizan automáticamente.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div>
                <Label htmlFor="iframe-code">Código completo del widget</Label>
                <div className="relative mt-2">
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
                <p className="text-xs text-muted-foreground mt-2">
                  Este código incluye el botón flotante y el iframe del chat. Se actualiza automáticamente cuando cambias la configuración.
                </p>
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
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-foreground">Configuración Básica</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="width">Ancho (px)</Label>
                  <Input
                    id="width"
                    type="number"
                    value={width}
                    onChange={handleWidthChange}
                    className="mt-1"
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
                    className="mt-1"
                    min="300"
                    max="1000"
                  />
                </div>
              </div>
            </div>

            {/* Configuración avanzada */}
            <div className="space-y-4 border-t pt-4">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <Settings className="w-4 h-4" />
                Configuración Avanzada
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="position">Posición</Label>
                  <select
                    id="position"
                    value={position}
                    onChange={handlePositionChange}
                    className="w-full mt-1 p-2 border border-border rounded-md bg-background"
                  >
                    <option value="bottom-right">Abajo Derecha</option>
                    <option value="bottom-left">Abajo Izquierda</option>
                    <option value="top-right">Arriba Derecha</option>
                    <option value="top-left">Arriba Izquierda</option>
                  </select>
                </div>
                <div>
                  <Label htmlFor="theme">Tema</Label>
                  <select
                    id="theme"
                    value={theme}
                    onChange={handleThemeChange}
                    className="w-full mt-1 p-2 border border-border rounded-md bg-background"
                  >
                    <option value="default">Por Defecto</option>
                    <option value="light">Claro</option>
                    <option value="dark">Oscuro</option>
                  </select>
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
