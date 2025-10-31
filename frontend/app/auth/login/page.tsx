import { Metadata } from "next";
import { LoginForm } from "../../components/auth/LoginForm";

export const metadata: Metadata = {
  title: "Iniciar Sesión",
  description: "Inicia sesión en el panel de administración del chatbot",
};

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100 mb-2">
            Chatbot Admin
          </h1>
          <p className="text-slate-600 dark:text-slate-400">
            Panel de Administración
          </p>
        </div>
        
        <LoginForm />
      </div>
    </div>
  );
}