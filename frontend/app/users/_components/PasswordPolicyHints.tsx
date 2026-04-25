import type { PasswordHints } from "./passwordHints";

export function PasswordPolicyHints({ hints }: { hints: PasswordHints }) {
  return (
    <div className="text-xs text-muted-foreground space-y-1 mt-1">
      <p>Requisitos de contraseña:</p>
      <p className={hints.len ? "text-green-600" : ""}>
        • 8 caracteres mínimo
      </p>
      <p className={hints.upper ? "text-green-600" : ""}>
        • Al menos una mayúscula
      </p>
      <p className={hints.special ? "text-green-600" : ""}>
        • Al menos un carácter especial
      </p>
    </div>
  );
}
