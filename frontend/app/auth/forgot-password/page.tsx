"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/app/components/ui/card";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import { Button } from "@/app/components/ui/button";
import { Loader2 } from "lucide-react";
import { authService } from "@/app/lib/services/authService";
import { useToast } from "@/app/components/ui/use-toast";
import { MailCheck } from "lucide-react";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    try {
      await authService.requestPasswordReset(email.trim());
      setSuccess(true);
      toast({ title: "Solicitud enviada", description: "Revisa tu bandeja de entrada." });
    } catch (err) {
      setSuccess(true);
      toast({ title: "Solicitud enviada", description: "Revisa tu bandeja de entrada." });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Recuperar contraseña</CardTitle>
          <CardDescription>
            {success ? "Correo enviado. Revisa tu bandeja de entrada y sigue el enlace." : "Ingresa tu correo y te enviaremos instrucciones"}
          </CardDescription>
        </CardHeader>
        {success ? (
          <>
            <CardContent className="text-center">
              <MailCheck className="w-16 h-16 text-orange-500 mb-4 mx-auto" />
              <div className="text-xl font-bold mb-2">¡Correo enviado!</div>
              <p className="text-sm text-muted-foreground">
                Hemos enviado las instrucciones a tu bandeja de entrada. Revisa también la carpeta de Spam.
              </p>
            </CardContent>
            <CardFooter className="flex flex-col space-y-3">
              <Button type="button" className="w-full" onClick={() => router.push("/auth/login")}>Volver al Login</Button>
            </CardFooter>
          </>
        ) : (
          <form onSubmit={onSubmit}>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Correo electrónico</Label>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@correo.com" disabled={loading} />
              </div>
            </CardContent>
            <CardFooter className="flex flex-col space-y-3">
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Enviando...</>) : ("Enviar instrucciones")}
              </Button>
              <Button type="button" variant="link" className="w-full" onClick={() => router.push("/auth/login")} disabled={loading}>
                Volver al Login
              </Button>
            </CardFooter>
          </form>
        )}
      </Card>
    </div>
  );
}
