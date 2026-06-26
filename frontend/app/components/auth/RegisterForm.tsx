"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { logger } from "@/app/lib/logger";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import { Alert, AlertDescription } from "@/app/components/ui/alert";
import { Loader2, Eye, EyeOff, CheckCircle } from "lucide-react";
import { authService, type RegisterData } from "@/app/lib/services/authService";

interface RegisterFormProps {
  onSuccess?: () => void;
  redirectTo?: string;
}

interface RegisterFormData extends RegisterData {
  confirmPassword: string;
}

export function RegisterForm({
  onSuccess,
  redirectTo = "/auth/login",
}: RegisterFormProps) {
  const router = useRouter();
  const [formData, setFormData] = useState<RegisterFormData>({
    username: "",
    email: "",
    password: "",
    confirmPassword: "",
    full_name: "",
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [success, setSuccess] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
    if (fieldErrors[name]) {
      setFieldErrors((prev) => { const next = { ...prev }; delete next[name]; return next; });
    }
    if (error) setError(null);
    if (success) setSuccess(null);
  };

  const validateForm = (): Record<string, string> => {
    const errors: Record<string, string> = {};

    if (!formData.username.trim()) {
      errors.username = "El nombre de usuario es requerido";
    } else if (formData.username.length < 3) {
      errors.username = "El nombre de usuario debe tener al menos 3 caracteres";
    } else if (formData.username.length > 50) {
      errors.username = "El nombre de usuario no puede tener más de 50 caracteres";
    }

    if (!formData.email.trim()) {
      errors.email = "El email es requerido";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      errors.email = "Por favor ingresa un email válido";
    }

    if (!formData.password) {
      errors.password = "La contraseña es requerida";
    } else if (formData.password.length < 6) {
      errors.password = "La contraseña debe tener al menos 6 caracteres";
    }

    if (formData.password && formData.password !== formData.confirmPassword) {
      errors.confirmPassword = "Las contraseñas no coinciden";
    }

    return errors;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const validationErrors = validateForm();
    if (Object.keys(validationErrors).length > 0) {
      setFieldErrors(validationErrors);
      return;
    }
    setFieldErrors({});

    setIsLoading(true);
    setError(null);
    setSuccess(null);

    try {
      // Preparar datos para el registro (sin confirmPassword)
      const { confirmPassword, ...registerData } = formData;

      // Si full_name está vacío, no lo enviamos
      if (!registerData.full_name?.trim()) {
        delete registerData.full_name;
      }

      await authService.register(registerData);

      // Registro exitoso
      setSuccess("¡Cuenta creada exitosamente! Redirigiendo al login...");

      setTimeout(() => {
        if (onSuccess) {
          onSuccess();
        } else {
          router.push(redirectTo);
        }
      }, 2000);
    } catch (err) {
      logger.error("Error en registro:", err);
      setError(err instanceof Error ? err.message : "Error en el registro");
    } finally {
      setIsLoading(false);
    }
  };

  const togglePasswordVisibility = () => {
    setShowPassword(!showPassword);
  };

  const toggleConfirmPasswordVisibility = () => {
    setShowConfirmPassword(!showConfirmPassword);
  };

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl font-bold text-center">
          Crear Cuenta
        </CardTitle>
        <CardDescription className="text-center">
          Completa el formulario para crear tu cuenta de administrador
        </CardDescription>
      </CardHeader>

      <form method="post" onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          <div role="alert" aria-live="polite" aria-atomic="true">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>

          <div role="status" aria-live="polite" aria-atomic="true">
            {success && (
              <Alert>
                <CheckCircle className="h-4 w-4" />
                <AlertDescription>{success}</AlertDescription>
              </Alert>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="username">Nombre de Usuario *</Label>
            <Input
              id="username"
              name="username"
              type="text"
              placeholder="Elige un nombre de usuario"
              value={formData.username}
              onChange={handleInputChange}
              disabled={isLoading}
              required
              autoComplete="username"
              aria-invalid={!!fieldErrors.username}
              aria-describedby={fieldErrors.username ? "username-error" : undefined}
            />
            {fieldErrors.username && (
              <p id="username-error" className="text-sm text-destructive">{fieldErrors.username}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email *</Label>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="tu@email.com"
              value={formData.email}
              onChange={handleInputChange}
              disabled={isLoading}
              required
              autoComplete="email"
              aria-invalid={!!fieldErrors.email}
              aria-describedby={fieldErrors.email ? "email-error" : undefined}
            />
            {fieldErrors.email && (
              <p id="email-error" className="text-sm text-destructive">{fieldErrors.email}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="full_name">Nombre Completo (Opcional)</Label>
            <Input
              id="full_name"
              name="full_name"
              type="text"
              placeholder="Tu nombre completo"
              value={formData.full_name}
              onChange={handleInputChange}
              disabled={isLoading}
              autoComplete="name"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Contraseña *</Label>
            <div className="relative">
              <Input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                placeholder="Mínimo 6 caracteres"
                value={formData.password}
                onChange={handleInputChange}
                disabled={isLoading}
                required
                autoComplete="new-password"
                className="pr-10"
                aria-invalid={!!fieldErrors.password}
                aria-describedby={fieldErrors.password ? "password-error" : undefined}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                onClick={togglePasswordVisibility}
                disabled={isLoading}
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
            {fieldErrors.password && (
              <p id="password-error" className="text-sm text-destructive">{fieldErrors.password}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirmar Contraseña *</Label>
            <div className="relative">
              <Input
                id="confirmPassword"
                name="confirmPassword"
                type={showConfirmPassword ? "text" : "password"}
                placeholder="Repite tu contraseña"
                value={formData.confirmPassword}
                onChange={handleInputChange}
                disabled={isLoading}
                required
                autoComplete="new-password"
                className="pr-10"
                aria-invalid={!!fieldErrors.confirmPassword}
                aria-describedby={fieldErrors.confirmPassword ? "confirmPassword-error" : undefined}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                onClick={toggleConfirmPasswordVisibility}
                disabled={isLoading}
              >
                {showConfirmPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
                <span className="sr-only">
                  {showConfirmPassword
                    ? "Ocultar contraseña de confirmación"
                    : "Mostrar contraseña de confirmación"}
                </span>
              </Button>
            </div>
            {fieldErrors.confirmPassword && (
              <p id="confirmPassword-error" className="text-sm text-destructive">{fieldErrors.confirmPassword}</p>
            )}
          </div>
        </CardContent>

        <CardFooter className="flex flex-col space-y-4">
          <Button
            type="submit"
            className="w-full"
            disabled={isLoading || !!success}
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creando cuenta...
              </>
            ) : success ? (
              "¡Cuenta creada!"
            ) : (
              "Crear Cuenta"
            )}
          </Button>

          <div className="text-sm text-center text-muted-foreground">
            <p>
              ¿Ya tienes una cuenta?{" "}
              <Button
                type="button"
                variant="link"
                className="p-0 h-auto font-normal"
                onClick={() => router.push("/auth/login")}
                disabled={isLoading}
              >
                Inicia sesión aquí
              </Button>
            </p>
          </div>
        </CardFooter>
      </form>
    </Card>
  );
}
