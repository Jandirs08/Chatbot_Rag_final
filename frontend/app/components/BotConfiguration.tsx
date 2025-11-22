import React from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Settings, Save, RotateCcw, Clock } from "lucide-react";
import { toast } from "sonner";
export interface BotConfigurationProps {
  botName?: string;
  onBotNameChange?: (value: string) => void;
  fieldsReadOnly?: boolean;
  onToggleEditFields?: () => void;
  prompt: string;
  onPromptChange: (value: string) => void;
  // unified readOnly handled by fieldsReadOnly
  temperature: number;
  onTemperatureChange: (value: number) => void;
  onSave: () => void;
  onReset: () => void;
  isLoading?: boolean;
  error?: string;
  previewText?: string;
  showPreview?: boolean;
  canSave?: boolean;
  rightAction?: React.ReactNode;
  isBotActive?: boolean;
  canReset?: boolean;
}

export function BotConfiguration({
  botName,
  onBotNameChange,
  fieldsReadOnly,
  onToggleEditFields,
  prompt,
  onPromptChange,
  temperature,
  onTemperatureChange,
  onSave,
  onReset,
  isLoading,
  error,
  previewText,
  showPreview,
  canSave,
  rightAction,
  isBotActive,
  canReset,
}: BotConfigurationProps) {
  // Sonner Toaster montado en layout

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div className="pb-6 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <h1 className="text-4xl font-bold text-foreground dark:text-white">Configuración del Bot</h1>
            <p className="text-xl text-muted-foreground dark:text-slate-400">Ajusta el comportamiento y personalidad del chatbot</p>
          </div>
          {rightAction}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Configuración principal con Tabs */}
        <div className="lg:col-span-2 space-y-6">
          <Tabs defaultValue="personalidad" className="w-full">
            <TabsList className="w-full">
              <TabsTrigger value="personalidad">Personalidad</TabsTrigger>
              <TabsTrigger value="parametros">Parámetros</TabsTrigger>
              <TabsTrigger value="vista-previa">Vista Previa</TabsTrigger>
            </TabsList>

            <TabsContent value="personalidad" className="space-y-6">
              <Card className="border-border/50">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Settings className="w-5 h-5 text-primary" />
                    Instrucciones Adicionales
                  </CardTitle>
                  <CardDescription>
                    Complementa la personalidad base del bot sin reemplazarla
                  </CardDescription>
                  <div className="flex justify-end">
                    <Button variant="outline" size="sm" onClick={onToggleEditFields}>
                      Editar
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid grid-cols-1 gap-4">
                    <Label htmlFor="bot-name">Nombre del Bot (opcional)</Label>
                    <Input
                      id="bot-name"
                      value={botName || ""}
                      onChange={(e) =>
                        onBotNameChange && onBotNameChange(e.target.value)
                      }
                      placeholder="Ej: Asesor Académico"
                      disabled={!!fieldsReadOnly}
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between">
                      <Label htmlFor="ui-extra">Instrucciones adicionales</Label>
                    </div>
                    <Textarea
                      id="ui-extra"
                      value={prompt}
                      onChange={(e) => onPromptChange(e.target.value)}
                      className="mt-2 min-h-[300px] font-mono text-sm bg-gray-50 border-gray-200 focus:ring-2 focus:ring-orange-500/20"
                      placeholder="Añade lineamientos adicionales (tono, estilo, etc.)"
                      disabled={!!fieldsReadOnly}
                    />
                    <p className="text-xs text-muted-foreground mt-2">
                      Caracteres: {prompt.length}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Consejo: usa frases breves y concretas; no incluyas variables
                      ni herramientas.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="parametros">
              <Card className="border-border/50">
                <CardHeader>
                  <CardTitle>Temperatura del Modelo</CardTitle>
                  <CardDescription>
                    Controla la creatividad vs precisión en las respuestas (0 = más
                    preciso, 1 = más creativo)
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <div className="flex justify-between items-center mb-4">
                      <Label>Temperatura: {temperature.toFixed(1)}</Label>
                      <span className="text-sm text-muted-foreground">
                        {temperature < 0.3
                          ? "Muy Preciso"
                          : temperature < 0.7
                            ? "Balanceado"
                            : "Creativo"}
                      </span>
                    </div>
                    <Slider
                      value={[temperature]}
                      onValueChange={(vals) => onTemperatureChange(vals[0])}
                      max={1}
                      min={0}
                      step={0.1}
                      className="w-full"
                    />
                    <div className="flex justify-between text-xs text-muted-foreground mt-2">
                      <span>Preciso</span>
                      <span>Creativo</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="vista-previa">
              {showPreview ? (
                <Card className="border-border/50">
                  <CardHeader>
                    <CardTitle>Vista previa del Prompt efectivo</CardTitle>
                    <CardDescription>
                      Así se compone la personalidad final aplicada
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <pre className="text-sm whitespace-pre-wrap break-words font-mono text-muted-foreground bg-muted/20 dark:bg-slate-800 p-3 rounded-md border border-border/50 dark:border-slate-700">
                      {previewText || ""}
                    </pre>
                  </CardContent>
                </Card>
              ) : (
                <Card className="border-border/50">
                  <CardContent>
                    <div className="text-sm text-muted-foreground">No hay vista previa disponible</div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>
          </Tabs>
        </div>

        {/* Panel lateral */}
        <div className="space-y-6">
          <Card className="border-border/50">
            <CardHeader>
              <CardTitle>Estado del Bot</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div
                className={`inline-flex items-center gap-2 px-3 py-1 rounded-full border ${
                  isBotActive
                    ? "bg-emerald-100 text-emerald-800 border-emerald-200"
                    : "bg-gray-100 text-gray-700 border-gray-200"
                }`}
                aria-live="polite"
              >
                <div
                  className={`w-2 h-2 rounded-full ${
                    isBotActive ? "bg-emerald-600 animate-pulse" : "bg-red-500"
                  }`}
                ></div>
                <span className="text-sm font-medium">
                  {isBotActive ? "Activo" : "Inactivo"}
                </span>
              </div>
              {isLoading ? (
                <div className="text-sm text-muted-foreground">Cargando...</div>
              ) : null}
              {error ? (
                <div className="text-sm text-red-600">{error}</div>
              ) : null}
              <div className="text-sm text-muted-foreground space-y-1">
                <p className="flex items-center gap-2">
                  <Clock className="w-4 h-4" /> Última actualización: Hace 5 min
                </p>
                <p>Documentos procesados: 3</p>
                <p>Consultas hoy: 247</p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/50">
            <CardHeader>
              <CardTitle>Acciones</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button
                onClick={() => {
                  onSave();
                }}
                className="w-full gradient-primary hover:opacity-90"
                disabled={!!isLoading || !canSave}
              >
                <Save className="w-4 h-4 mr-2" />
                {isLoading ? "Guardando…" : "Guardar Cambios"}
              </Button>
              <Button
                onClick={() => {
                  onReset();
                }}
                variant="outline"
                className={`w-full ${!canReset ? "opacity-50 cursor-not-allowed" : ""}`}
                disabled={!!isLoading || !canReset}
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                Restablecer
              </Button>
            </CardContent>
          </Card>

          <Card className="border-border/50 bg-muted/30">
            <CardHeader>
              <CardTitle className="text-sm">Recomendaciones</CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground space-y-2">
              <p>• Usa un prompt claro y específico</p>
              <p>
                • Temperatura baja (0.3-0.5) para respuestas más consistentes
              </p>
              <p>• Incluye ejemplos de cómo debe responder</p>
              <p>• Define límites claros de conocimiento</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
