import { Metadata } from "next";
import { LoginForm } from "../../components/auth/LoginForm";
import { Bot } from "lucide-react";
import Image from "next/image";

export const metadata: Metadata = {
  title: "Iniciar Sesión",
  description: "Inicia sesión en el panel de administración del chatbot",
};

export default function LoginPage() {
  return (
    <div className="h-screen w-full flex overflow-hidden">
      <div className="relative w-full lg:w-1/2 flex items-center justify-center bg-white dark:bg-white p-6">
        <div className="w-full max-w-md">
          <div className="mb-8">
            <div className="mb-6 inline-flex items-center justify-center bg-orange-100 text-orange-600 rounded-lg p-2">
              <Bot className="w-12 h-12" />
            </div>
            <h1 className="text-4xl tracking-tight font-extrabold text-slate-900">Bienvenido<span className="text-orange-600">.</span></h1>
            <p className="mt-2 text-lg text-slate-500">Ingresa a tu cuenta para gestionar al agente.</p>
          </div>
          <LoginForm />
        </div>

        <div className="absolute bottom-4 left-0 right-0 text-center">
          <p className="text-[11px] text-slate-500 dark:text-slate-400">© 2025 Becas Grupo Romero. Todos los derechos reservados.</p>
        </div>
      </div>

      <div className="hidden lg:flex lg:w-1/2 relative">
        <Image
          src="https://images.unsplash.com/photo-1639322537228-f710d846310a?q=80&w=2632&auto=format&fit=crop"
          alt="Background"
          fill
          priority
          className="object-cover"
          sizes="(min-width: 1024px) 50vw, 100vw"
        />
        <div className="absolute inset-0 bg-slate-900/80" />
        <div className="relative z-10 flex items-center justify-center w-full p-12">
          <div className="max-w-xl text-center">
            <h2 className="text-white text-4xl md:text-5xl font-bold leading-tight">
              Potenciando la educación con Inteligencia Artificial.
            </h2>
          </div>
        </div>
      </div>
    </div>
  );
}