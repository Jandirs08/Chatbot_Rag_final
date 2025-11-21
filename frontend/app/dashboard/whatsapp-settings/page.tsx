"use client";
import { useEffect, useState } from "react";
import { useAuthGuard } from "@/app/hooks/useAuthGuard";
import { Card, CardHeader, CardTitle, CardContent } from "@/app/components/ui/card";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import { Button } from "@/app/components/ui/button";
import { toast } from "sonner";
import { API_URL } from "@/app/lib/config";
import { getBotConfig, updateBotConfig, BotConfigDTO } from "@/app/lib/services/botConfigService";
import { whatsappService } from "@/app/lib/services/whatsappService";

export default function WhatsAppSettingsPage() {
  const { isAuthorized } = useAuthGuard({ requireAdmin: true });
  const [twilioSid, setTwilioSid] = useState("");
  const [twilioToken, setTwilioToken] = useState("");
  const [twilioFrom, setTwilioFrom] = useState("");
  const webhookUrl = `${API_URL}/whatsapp/webhook`;
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const cfg: BotConfigDTO = await getBotConfig();
        if (!mounted) return;
        setTwilioSid(cfg.twilio_account_sid ?? "");
        setTwilioToken(cfg.twilio_auth_token ?? "");
        setTwilioFrom(cfg.twilio_whatsapp_from ?? "");
      } catch (e: any) {
        toast.error(e?.message || "Error al obtener configuración");
      }
    })();
    return () => { mounted = false; };
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
    } catch (e: any) {
      toast.error(e?.message || "Error al guardar configuración");
    } finally {
      setLoading(false);
    }
  };

  const onTest = async () => {
    try {
      const res = await whatsappService.testConnection();
      if (res.status === "ok") toast.success("OK");
      else toast.error(res.message || "Error");
    } catch {
      toast.error("Error");
    }
  };

  return (
    <div className="space-y-6 p-6">
      <Card>
        <CardHeader>
          <CardTitle>WhatsApp Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="twilio_sid">Twilio Account SID</Label>
            <Input id="twilio_sid" value={twilioSid} onChange={(e) => setTwilioSid(e.target.value)} placeholder="ACXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="twilio_token">Twilio Auth Token</Label>
            <Input id="twilio_token" type="password" value={twilioToken} onChange={(e) => setTwilioToken(e.target.value)} placeholder="Auth Token" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="twilio_from">Twilio WhatsApp From</Label>
            <Input id="twilio_from" value={twilioFrom} onChange={(e) => setTwilioFrom(e.target.value)} placeholder="whatsapp:+123456789" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="wa_webhook">Webhook URL</Label>
            <Input id="wa_webhook" value={webhookUrl} readOnly />
          </div>
          <div className="flex gap-3">
            <Button onClick={onSave} disabled={loading}>Guardar cambios</Button>
            <Button variant="outline" onClick={onTest}>Test Connection</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}