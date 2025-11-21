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
  const [baseUrl, setBaseUrl] = useState("");
  const [token, setToken] = useState("");
  const [phoneId, setPhoneId] = useState("");
  const webhookUrl = `${API_URL}/whatsapp/webhook`;
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const cfg: BotConfigDTO = await getBotConfig();
        if (!mounted) return;
        setBaseUrl(cfg.whatsapp_api_base_url ?? "");
        setToken(cfg.whatsapp_token ?? "");
        setPhoneId(cfg.whatsapp_phone_number_id ?? "");
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
        whatsapp_api_base_url: baseUrl || undefined,
        whatsapp_token: token || undefined,
        whatsapp_phone_number_id: phoneId || undefined,
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
            <Label htmlFor="wa_base_url">API Base URL</Label>
            <Input id="wa_base_url" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://graph.facebook.com/vXX.X" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="wa_token">Token</Label>
            <Input id="wa_token" type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="Bearer token" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="wa_phone_id">Phone Number ID</Label>
            <Input id="wa_phone_id" value={phoneId} onChange={(e) => setPhoneId(e.target.value)} placeholder="123456789" />
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