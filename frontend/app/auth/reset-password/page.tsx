"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/app/components/ui/card";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import { Button } from "@/app/components/ui/button";
import { Alert, AlertDescription } from "@/app/components/ui/alert";
import { Loader2, CheckCircle2, Circle, CheckCircle } from "lucide-react";
import { authService } from "@/app/lib/services/authService";
import { useToast } from "@/app/components/ui/use-toast";

export default function ResetPasswordPage() {
  const router = useRouter();
  const params = useSearchParams();
  const { toast } = useToast();

  const token = useSearchParams().get("token");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const lenOk = password.length >= 8;
  const upperOk = /[A-Z]/.test(password);
  const specialOk = /[^A-Za-z0-9]/.test(password);
  const matchesOk = password.length > 0 && password === confirm;
  const canSubmit = lenOk && upperOk && specialOk && matchesOk && !loading;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!token) {
      setError("Token faltante en la URL");
      return;
    }
    if (!password || password.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres");
      return;
    }
    if (password !== confirm) {
      setError("Las contraseñas no coinciden");
      return;
    }
    setLoading(true);
    try {
      await authService.resetPassword(token, password);
      setSuccess(true);
      toast({ title: "Contraseña actualizada", description: "Ahora puedes iniciar sesión" });
      setTimeout(() => router.push("/auth/login"), 1500);
    } catch (err: any) {
      if (err?.status === 401) {
        setError("El enlace ha expirado");
      } else {
        setError(err instanceof Error ? err.message : "Error al actualizar contraseña");
      }
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center p-6">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Error</CardTitle>
            <CardDescription>No se encontró un token de recuperación en la URL</CardDescription>
          </CardHeader>
          <CardFooter className="flex flex-col space-y-3">
            <Button onClick={() => router.push("/")}>Ir al inicio</Button>
            <Button variant="link" onClick={() => router.push("/auth/forgot-password")}>Solicitar un nuevo enlace</Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Restablecer contraseña</CardTitle>
          <CardDescription>{success ? "Tu contraseña fue actualizada correctamente." : "Ingresa tu nueva contraseña"}</CardDescription>
        </CardHeader>
        {success ? (
          <>
            <CardContent className="text-center">
              <CheckCircle className="w-16 h-16 text-green-500 mb-4 mx-auto" />
              <div className="text-xl font-bold mb-2">¡Contraseña Actualizada!</div>
              <p className="text-sm text-muted-foreground">Redirigiendo al login...</p>
            </CardContent>
            <CardFooter className="flex flex-col space-y-3">
              <Button type="button" className="w-full" onClick={() => router.push("/auth/login")}>Ir a Iniciar Sesión</Button>
            </CardFooter>
          </>
        ) : (
          <form onSubmit={onSubmit}>
            <CardContent className="space-y-4">
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              <div className="space-y-2">
                <Label htmlFor="password">Nueva Contraseña</Label>
                <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mínimo 8 caracteres" disabled={loading} />
                <div className="mt-2 space-y-1 text-sm">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    {lenOk ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : <Circle className="w-4 h-4 text-gray-400" />}
                    <span>Mínimo 8 caracteres</span>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    {upperOk ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : <Circle className="w-4 h-4 text-gray-400" />}
                    <span>Al menos 1 mayúscula</span>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    {specialOk ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : <Circle className="w-4 h-4 text-gray-400" />}
                    <span>Al menos 1 carácter especial</span>
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm">Confirmar Contraseña</Label>
                <Input id="confirm" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} disabled={loading} />
              </div>
            </CardContent>
            <CardFooter className="flex flex-col space-y-3">
              <Button type="submit" className="w-full" disabled={!canSubmit}>
                {loading ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Actualizando...</>) : ("Actualizar contraseña")}
              </Button>
              <Button type="button" variant="link" className="w-full text-muted-foreground" onClick={() => router.push("/auth/login")} disabled={loading}>
                Volver al Login
              </Button>
            </CardFooter>
          </form>
        )}
      </Card>
    </div>
  );
}
