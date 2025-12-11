"use client";
import { useEffect, useState } from "react";
import { useAuthGuard } from "@/app/hooks/useAuthGuard";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/app/components/ui/card";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import { Button } from "@/app/components/ui/button";
import { toast } from "sonner";
import { API_URL } from "@/app/lib/config";
import {
  getBotConfig,
  updateBotConfig,
  BotConfigDTO,
} from "@/app/lib/services/botConfigService";
import { whatsappService } from "@/app/lib/services/whatsappService";
import { CheckCircle, AlertTriangle, Circle } from "lucide-react";
import { useUnsavedChanges } from "@/app/hooks/useUnsavedChanges";

export default function ConfiguracionWhatsAppPage() {
  const { isAuthorized } = useAuthGuard({ requireAdmin: true });
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

  const isDirty =
    twilioSid !== baselineSid ||
    twilioToken !== baselineToken ||
    twilioFrom !== baselineFrom;

  useUnsavedChanges(isDirty);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const cfg: BotConfigDTO = await getBotConfig();
        if (!mounted) return;
        setTwilioSid(cfg.twilio_account_sid ?? "");
        setTwilioToken(cfg.twilio_auth_token ?? "");
        setTwilioFrom(cfg.twilio_whatsapp_from ?? "");
        setFieldsLocked(true);
        setBaselineSid(cfg.twilio_account_sid ?? "");
        setBaselineToken(cfg.twilio_auth_token ?? "");
        setBaselineFrom(cfg.twilio_whatsapp_from ?? "");
        const hasData = Boolean(
          cfg.twilio_account_sid ||
            cfg.twilio_auth_token ||
            cfg.twilio_whatsapp_from,
        );
        setStatus(hasData ? "dirty" : "unknown");
      } catch (e: any) {
        toast.error(e?.message || "Error al obtener configuración");
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  if (!isAuthorized) return null;

  const onSave = async () => {
    try {
      setLoading(true);
      await updateBotConfig({
        twilio_account_sid: twilioSid || undefined,
        twilio_auth_token: twilioToken || undefined,
        twilio_whatsapp_from: twilioFrom || undefined,
      });
      toast.success("Configuración guardada");
      setFieldsLocked(true);
      setBaselineSid(twilioSid);
      setBaselineToken(twilioToken);
      setBaselineFrom(twilioFrom);
      setStatus("dirty");
    } catch (e: any) {
      toast.error(e?.message || "Error al guardar configuración");
    } finally {
      setLoading(false);
    }
  };

  const onTest = async () => {
    try {
      const res = await whatsappService.testConnection();
      if (res.status === "ok") {
        toast.success("Conectado");
        setBaselineSid(twilioSid);
        setBaselineToken(twilioToken);
        setBaselineFrom(twilioFrom);
        setStatus("ok");
      } else {
        toast.error(res.message || "Error");
        setStatus("error");
      }
    } catch {
      toast.error("Error");
      setStatus("error");
    }
  };

  return (
    <div className="space-y-6 p-6">
      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              <CardTitle>Configuración de WhatsApp</CardTitle>
              {status === "ok" && (
                <span className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded bg-green-600 text-white">
                  <CheckCircle className="w-3 h-3" /> Conectado
                </span>
              )}
              {status === "dirty" && (
                <span className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded bg-amber-500 text-white">
                  <AlertTriangle className="w-3 h-3" /> Cambios sin probar
                </span>
              )}
              {status === "error" && (
                <span className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded bg-red-600 text-white">
                  <AlertTriangle className="w-3 h-3" /> Error de conexión
                </span>
              )}
              {status === "unknown" && (
                <span className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded bg-muted text-foreground">
                  <Circle className="w-3 h-3" /> Sin probar
                </span>
              )}
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button
                variant="outline"
                onClick={() => setFieldsLocked((v) => !v)}
              >
                {fieldsLocked ? "Editar" : "Bloquear"}
              </Button>
              <Button onClick={onTest}>Test Connection</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="twilio_sid">Twilio Account SID</Label>
            <Input
              id="twilio_sid"
              className="font-mono bg-gray-50"
              value={twilioSid}
              onChange={(e) => {
                setTwilioSid(e.target.value);
                setStatus("dirty");
              }}
              placeholder="ACXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
              disabled={fieldsLocked}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="twilio_token">Twilio Auth Token</Label>
            <Input
              id="twilio_token"
              className="font-mono bg-gray-50"
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
          <div className="space-y-2">
            <Label htmlFor="twilio_from">Twilio WhatsApp From</Label>
            <Input
              id="twilio_from"
              className="font-mono bg-gray-50"
              value={twilioFrom}
              onChange={(e) => {
                setTwilioFrom(e.target.value);
                setStatus("dirty");
              }}
              placeholder="whatsapp:+123456789"
              disabled={fieldsLocked}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="wa_webhook">Webhook URL</Label>
            <Input
              id="wa_webhook"
              className="font-mono bg-gray-50"
              value={webhookUrl}
              readOnly
            />
          </div>
          <div className="flex gap-3">
            <Button onClick={onSave} disabled={loading || fieldsLocked}>
              Guardar cambios
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
