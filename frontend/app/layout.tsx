import "./globals.css";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { RootLayoutClient } from "./components/RootLayoutClient";
import { AuthProvider } from "./contexts/AuthContext";
import { Toaster } from "sonner";
import { cookies } from "next/headers";
import { API_URL } from "@/app/lib/config";

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
  let brandColor: string | undefined = undefined;
  try {
    const token = cookies().get("auth_token")?.value;
    const headers: HeadersInit = token
      ? { Authorization: `Bearer ${token}` }
      : {};
    const res = await fetch(`${API_URL}/bot/config`, {
      method: "GET",
      headers,
      cache: "no-store",
    });
    if (res.ok) {
      const cfg = await res.json();
      const col = String(cfg?.theme_color || "").trim();
      if (col) brandColor = col;
    }
  } catch {}

  const htmlStyle = brandColor ? { ["--brand-color" as any]: brandColor } : {};

  return (
    <html lang="es" className="h-full" style={htmlStyle}>
      <body className={`${inter.className} h-full`}>
        <AuthProvider>
          <RootLayoutClient>{children}</RootLayoutClient>
        </AuthProvider>
        <Toaster richColors position="bottom-right" />
      </body>
    </html>
  );
}
