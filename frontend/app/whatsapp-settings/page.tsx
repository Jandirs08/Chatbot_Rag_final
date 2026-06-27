"use client";
import { useEffect, useState } from "react";
import { useRequirePermission } from "@/app/hooks/useAuthGuard";
import { useBotConfig } from "@/app/hooks/useBotConfig";
import {
  Card,
  CardHeader,
  CardContent,
  CardFooter,
} from "@/app/components/ui/card";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import { Button } from "@/app/components/ui/button";
import { toast } from "sonner";
import { API_URL } from "@/app/lib/config";
import { updateBotConfig } from "@/app/lib/services/botConfigService";
import { whatsappService } from "@/app/lib/services/whatsappService";
import {
  CheckCircle,
  AlertTriangle,
  Circle,
  Lock,
  Unlock,
  Wifi,
  Copy,
  Check,
} from "lucide-react";
import { useUnsavedChanges } from "@/app/hooks/useUnsavedChanges";

export default function ConfiguracionWhatsAppPage() {
  const { isAuthorized, isChecking } =
    useRequirePermission("manage_bot_config");
  const {
    data: botConfig,
    error: botConfigError,
    mutate: mutateBotConfig,
  } = useBotConfig({
    enabled: isAuthorized,
    revalidateOnFocus: false,
  });
  const [twilioSid, setTwilioSid] = useState("");
  const [twilioToken, setTwilioToken] = useState("");
  const [twilioFrom, setTwilioFrom] = useState("");
  const [fieldsLocked, setFieldsLocked] = useState(true);
  const [baselineSid, setBaselineSid] = useState("");
  const [baselineToken, setBaselineToken] = useState("");
  const [baselineFrom, setBaselineFrom] = useState("");
  const [status, setStatus] = useState<"unknown" | "ok" | "error" | "dirty">(
    "unknown",
  );
  const webhookUrl = `${API_URL}/whatsapp/webhook`;
  const [loading, setLoading] = useState(false);
  const [testLoading, setTestLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const isDirty =
    twilioSid !== baselineSid ||
    twilioToken !== baselineToken ||
    twilioFrom !== baselineFrom;

  const isBusy = loading || testLoading;

  useUnsavedChanges(isDirty);

  useEffect(() => {
    if (!botConfig) return;

    setTwilioSid(botConfig.twilio_account_sid ?? "");
    setTwilioToken(botConfig.twilio_auth_token ?? "");
    setTwilioFrom(botConfig.twilio_whatsapp_from ?? "");
    setFieldsLocked(true);
    setBaselineSid(botConfig.twilio_account_sid ?? "");
    setBaselineToken(botConfig.twilio_auth_token ?? "");
    setBaselineFrom(botConfig.twilio_whatsapp_from ?? "");
    const hasData = Boolean(
      botConfig.twilio_account_sid ||
        botConfig.twilio_auth_token ||
        botConfig.twilio_whatsapp_from,
    );
    setStatus(hasData ? "dirty" : "unknown");
  }, [botConfig]);

  useEffect(() => {
    if (!botConfigError) return;
    toast.error(botConfigError.message || "Error al obtener configuración");
  }, [botConfigError]);

  if (isChecking || !isAuthorized) return null;

  const onSave = async () => {
    try {
      setLoading(true);
      const updatedConfig = await updateBotConfig({
        twilio_account_sid: twilioSid || undefined,
        twilio_auth_token: twilioToken || undefined,
        twilio_whatsapp_from: twilioFrom || undefined,
      });
      await mutateBotConfig(updatedConfig, { revalidate: false });
      toast.success("Configuración guardada");
      setFieldsLocked(true);
      setBaselineSid(twilioSid);
      setBaselineToken(twilioToken);
      setBaselineFrom(twilioFrom);
      setStatus("dirty");
    } catch (e: unknown) {
      toast.error(
        e instanceof Error ? e.message : "Error al guardar configuración",
      );
    } finally {
      setLoading(false);
    }
  };

  const onTest = async () => {
    try {
      setTestLoading(true);
      const res = await whatsappService.testConnection();
      if (res.status === "ok") {
        toast.success("Conectado");
        setStatus("ok");
      } else {
        toast.error(res.message || "Error de conexión");
        setStatus("error");
      }
    } catch {
      toast.error("Error al probar conexión");
      setStatus("error");
    } finally {
      setTestLoading(false);
    }
  };

  const onCopyWebhook = async () => {
    await navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6 p-6 max-w-2xl">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4 pb-4 border-b">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-semibold tracking-tight">
              Configuración de WhatsApp
            </h1>
            {status === "ok" && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-success/10 text-success border border-success/25 text-xs font-medium">
                <CheckCircle className="w-3 h-3" aria-hidden="true" /> Conectado
              </span>
            )}
            {status === "dirty" && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-warning/10 text-warning border border-warning/25 text-xs font-medium">
                <AlertTriangle className="w-3 h-3" aria-hidden="true" /> Sin
                probar
              </span>
            )}
            {status === "error" && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-error/10 text-error border border-error/25 text-xs font-medium">
                <AlertTriangle className="w-3 h-3" aria-hidden="true" /> Error
                de conexión
              </span>
            )}
            {status === "unknown" && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-muted text-muted-foreground border border-border text-xs font-medium">
                <Circle className="w-3 h-3" aria-hidden="true" /> Sin probar
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Credenciales Twilio para el canal de WhatsApp.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setFieldsLocked((v) => !v)}
          disabled={isBusy}
          aria-label={fieldsLocked ? "Editar credenciales" : "Bloquear edición"}
        >
          {fieldsLocked ? (
            <>
              <Lock className="w-3.5 h-3.5" aria-hidden="true" /> Editar
            </>
          ) : (
            <>
              <Unlock className="w-3.5 h-3.5" aria-hidden="true" /> Bloquear
            </>
          )}
        </Button>
      </div>

      {/* Credentials card */}
      <Card>
        <CardHeader className="pb-3">
          <h2 className="text-sm font-semibold text-foreground">
            Credenciales de Twilio
          </h2>
          <p className="text-xs text-muted-foreground">
            Obtén estos valores en tu consola de Twilio.
          </p>
        </CardHeader>
        <CardContent
          className={`space-y-4 transition-opacity${fieldsLocked ? " opacity-60" : ""}`}
        >
          <div className="space-y-1.5">
            <Label htmlFor="twilio_sid">Account SID</Label>
            <Input
              id="twilio_sid"
              className="font-mono text-sm bg-muted/50"
              value={twilioSid}
              onChange={(e) => {
                setTwilioSid(e.target.value);
                setStatus("dirty");
              }}
              placeholder="ACXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
              disabled={fieldsLocked}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="twilio_token">Auth Token</Label>
            <Input
              id="twilio_token"
              className="font-mono text-sm bg-muted/50"
              type="password"
              value={twilioToken}
              onChange={(e) => {
                setTwilioToken(e.target.value);
                setStatus("dirty");
              }}
              placeholder="Auth Token"
              disabled={fieldsLocked}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="twilio_from">Número de WhatsApp</Label>
            <Input
              id="twilio_from"
              className="font-mono text-sm bg-muted/50"
              value={twilioFrom}
              onChange={(e) => {
                setTwilioFrom(e.target.value);
                setStatus("dirty");
              }}
              placeholder="whatsapp:+123456789"
              disabled={fieldsLocked}
            />
          </div>
        </CardContent>
        <CardFooter className="flex gap-2 pt-4 border-t">
          <Button
            width="full"
            onClick={onSave}
            disabled={loading || fieldsLocked}
          >
            {loading ? "Guardando..." : "Guardar cambios"}
          </Button>
          <Button
            variant="outline"
            width="full"
            onClick={onTest}
            disabled={testLoading || loading}
          >
            <Wifi className="w-3.5 h-3.5" aria-hidden="true" />
            {testLoading ? "Probando..." : "Probar conexión"}
          </Button>
        </CardFooter>
      </Card>

      {/* Webhook card */}
      <Card>
        <CardHeader className="pb-3">
          <h2 className="text-sm font-semibold text-foreground">
            URL del Webhook
          </h2>
          <p className="text-xs text-muted-foreground">
            Configura esta URL en la consola de Twilio para recibir mensajes
            entrantes.
          </p>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              id="wa_webhook"
              className="font-mono text-sm bg-muted/50 flex-1"
              value={webhookUrl}
              readOnly
              aria-label="URL del webhook de WhatsApp"
            />
            <Button
              variant="outline"
              size="icon"
              onClick={onCopyWebhook}
              aria-label="Copiar URL del webhook"
            >
              {copied ? (
                <Check className="w-4 h-4 text-success" aria-hidden="true" />
              ) : (
                <Copy className="w-4 h-4" aria-hidden="true" />
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
