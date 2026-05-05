import { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm } from "../../components/auth/LoginForm";
import { Bot } from "lucide-react";
import Image from "next/image";
import { resolveServerSession } from "@/app/lib/auth/serverSession";

export const metadata: Metadata = {
  title: "Iniciar sesión",
  description: "Accede al panel de administración del chatbot",
};

function safeRedirectPath(from: string | undefined): string {
  if (!from) return "/";
  if (!from.startsWith("/") || from.startsWith("//")) return "/";
  return from;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: { from?: string };
}) {
  const session = await resolveServerSession();
  const redirectTo = safeRedirectPath(searchParams.from);

  if (session) {
    redirect(redirectTo);
  }

  return (
    <div className="h-screen w-full flex overflow-hidden">
      <div className="relative w-full lg:w-1/2 flex items-center justify-center bg-card p-6">
        <div className="w-full max-w-md">
          <div className="mb-8">
            <div className="mb-6 inline-flex items-center justify-center bg-primary/10 text-primary rounded-lg p-2">
              <Bot className="w-12 h-12" />
            </div>
            <h1 className="text-4xl tracking-tight font-extrabold text-foreground">
              Ingresa al panel<span className="text-primary">.</span>
            </h1>
            <p className="mt-2 text-lg text-muted-foreground">
              Administra tu chatbot, revisa su configuración y continúa donde lo dejaste.
            </p>
          </div>
          <LoginForm redirectTo={redirectTo} />
        </div>

        <div className="absolute bottom-4 left-0 right-0 text-center">
          <p className="text-[11px] text-muted-foreground">
            © 2026 Aleph. Todos los derechos reservados.
          </p>
        </div>
      </div>

      <div className="hidden lg:flex lg:w-1/2 relative">
        <Image
          src="https://images.unsplash.com/photo-1639322537228-f710d846310a?q=80&w=2632&auto=format&fit=crop"
          alt="Panel de chatbot con automatización"
          fill
          priority
          className="object-cover"
          sizes="(min-width: 1024px) 50vw, 100vw"
        />
        <div className="absolute inset-0 bg-foreground/80" />
        <div className="relative z-10 flex items-center justify-center w-full p-12">
          <div className="max-w-xl text-center">
            <h2 className="text-white text-4xl md:text-5xl font-bold leading-tight">
              Gestiona conversaciones con contexto, herramientas y control operativo.
            </h2>
          </div>
        </div>
      </div>
    </div>
  );
}
