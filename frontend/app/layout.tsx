import "./globals.css";
import type { Metadata } from "next";
import { Inter, Space_Grotesk, DM_Mono, JetBrains_Mono } from "next/font/google";
import { RootLayoutClient } from "./components/RootLayoutClient";
import { SWRProvider } from "./components/SWRProvider";
import { AuthProvider } from "./contexts/AuthContext";
import { resolveServerSession } from "./lib/auth/serverSession";
import { Toaster } from "sonner";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-heading",
  display: "swap",
});

const dmMono = DM_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono-ui",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-telemetry-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Aleph — Panel de Control",
  description: "Plataforma RAG para asistentes inteligentes",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const initialSession = await resolveServerSession();

  return (
    <html lang="es" className="h-full">
      <body className={`${inter.variable} ${spaceGrotesk.variable} ${dmMono.variable} ${jetbrainsMono.variable} font-sans h-full`}>
        <SWRProvider>
          <AuthProvider initialSession={initialSession}>
            <RootLayoutClient>{children}</RootLayoutClient>
          </AuthProvider>
        </SWRProvider>
        <Toaster richColors position="bottom-right" />
      </body>
    </html>
  );
}
