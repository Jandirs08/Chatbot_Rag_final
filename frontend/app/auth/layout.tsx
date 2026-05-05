import { Metadata } from "next";

export const metadata: Metadata = {
  title: {
    template: "%s - Chatbot Admin",
    default: "Autenticación - Chatbot Admin",
  },
  description: "Sistema de autenticación para el panel de administración del chatbot",
};

interface AuthLayoutProps {
  children: React.ReactNode;
}

export default function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <div className="min-h-screen bg-background">
      {children}
    </div>
  );
}