import { Metadata } from "next";
import { RegisterForm } from "@/app/components/auth/RegisterForm";

export const metadata: Metadata = {
  title: "Crear Cuenta",
  description: "Crea una cuenta de administrador para el chatbot",
};

export default function RegisterPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">
            Chatbot Admin
          </h1>
          <p className="text-muted-foreground">
            Crear Cuenta de Administrador
          </p>
        </div>
        
        <RegisterForm />
      </div>
    </div>
  );
}