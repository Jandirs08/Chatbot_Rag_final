import "./globals.css";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { RootLayoutClient } from "./components/RootLayoutClient";
import { AuthProvider } from "./contexts/AuthContext";
import { resolveServerSession } from "./lib/auth/serverSession";
import { Toaster } from "sonner";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Panel de Control del Chatbot",
  description: "Panel de administración para el chatbot personalizado",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const initialSession = await resolveServerSession();

  return (
    <html lang="es" className="h-full">
      <body className={`${inter.className} h-full`}>
        <AuthProvider initialSession={initialSession}>
          <RootLayoutClient>{children}</RootLayoutClient>
        </AuthProvider>
        <Toaster richColors position="bottom-right" />
      </body>
    </html>
  );
}
