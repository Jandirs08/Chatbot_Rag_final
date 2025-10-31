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
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      {/* Background pattern */}
      <div className="absolute inset-0 bg-grid-slate-100 [mask-image:linear-gradient(0deg,white,rgba(255,255,255,0.6))] dark:bg-grid-slate-700/25 dark:[mask-image:linear-gradient(0deg,rgba(255,255,255,0.1),rgba(255,255,255,0.5))]" />
      
      {/* Content */}
      <div className="relative">
        {children}
      </div>
    </div>
  );
}