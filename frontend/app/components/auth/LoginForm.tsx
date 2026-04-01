"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { logger } from "@/app/lib/logger";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Card, CardContent, CardFooter } from "../ui/card";
import { Alert, AlertDescription } from "../ui/alert";
import { Loader2, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../../hooks/useAuth";

interface LoginFormProps {
  onSuccess?: () => void;
  redirectTo?: string;
}

interface LoginFormData {
  email: string;
  password: string;
}

export function LoginForm({ onSuccess, redirectTo = "/" }: LoginFormProps) {
  const router = useRouter();
  const { login, isLoading, error, clearError } = useAuth();

  const [formData, setFormData] = useState<LoginFormData>({
    email: "",
    password: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRedirecting, setIsRedirecting] = useState(false);

  const isBusy = isLoading || isSubmitting || isRedirecting;

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));

    if (error) {
      clearError();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isBusy) {
      return;
    }

    if (!formData.email.trim()) {
      return;
    }

    if (!formData.password) {
      return;
    }

    const toastId = toast.loading("Iniciando sesión...");

    try {
      setIsSubmitting(true);
      await login(formData.email, formData.password);
      setIsSubmitting(false);
      toast.dismiss(toastId);

      if (onSuccess) {
        onSuccess();
        return;
      }

      setIsRedirecting(true);
      router.replace(redirectTo);
      router.refresh();
    } catch (err) {
      toast.dismiss(toastId);
      setIsSubmitting(false);
      setIsRedirecting(false);
      logger.error("Error en login:", err);
    }
  };

  const togglePasswordVisibility = () => {
    setShowPassword((current) => !current);
  };

  return (
    <Card className="mx-auto w-full max-w-md">
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="email">Correo Electrónico</Label>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="Ingresa tu email"
              value={formData.email}
              onChange={handleInputChange}
              disabled={isBusy}
              required
              autoComplete="email"
              className="h-12 rounded-lg"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Contraseña</Label>
            <div className="relative">
              <Input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                placeholder="Ingresa tu contraseña"
                value={formData.password}
                onChange={handleInputChange}
                disabled={isBusy}
                required
                autoComplete="current-password"
                className="h-12 rounded-lg pr-10"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                onClick={togglePasswordVisibility}
                disabled={isBusy}
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
                <span className="sr-only">
                  {showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                </span>
              </Button>
            </div>
          </div>
        </CardContent>

        <CardFooter className="flex flex-col space-y-4">
          <div className="flex justify-end">
            <a
              href="/auth/forgot-password"
              className="text-sm font-medium text-orange-600 hover:text-orange-700"
            >
              ¿Olvidaste tu contraseña?
            </a>
          </div>
          <Button
            type="submit"
            className="w-full bg-orange-600 font-semibold text-white shadow-md hover:bg-orange-700"
            disabled={isBusy}
            aria-busy={isBusy}
          >
            {isBusy ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {isRedirecting ? "Redirigiendo..." : "Iniciando sesión..."}
              </>
            ) : (
              "Iniciar Sesión"
            )}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
