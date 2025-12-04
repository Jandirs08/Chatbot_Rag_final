import { MouseEvent, useEffect, useState } from "react";
import useSWR from "swr";
import { getBotConfig } from "../lib/services/botConfigService";
import { MessageCircle, Sparkles, BookOpen, Calendar } from "lucide-react";

export function EmptyState(props: { onSubmit: (question: string) => any }) {
  const [botName, setBotName] = useState<string | undefined>(undefined);
  const [themeColor, setThemeColor] = useState<string>("#F97316");
  const { data: cfg } = useSWR("empty-bot-config", getBotConfig);

  useEffect(() => {
    if (cfg) {
      setBotName(cfg.bot_name || undefined);
      const col = cfg.theme_color || "#F97316";
      setThemeColor(col);
      try {
        document.documentElement.style.setProperty("--brand-color", col);
      } catch {}
    }
  }, [cfg]);
  const handleClick = (e: MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.textContent) {
      props.onSubmit(target.textContent);
    }
  };

  const starters: string[] = Array.isArray(cfg?.starters) ? (cfg!.starters as string[]) : [];

  return (
    <div className="flex flex-col items-center justify-center h-full p-8 text-center relative overflow-hidden">
      {/* Fondo decorativo */}
      <div className="absolute inset-0 bg-gradient-to-br from-orange-50 via-white to-red-50 opacity-60"></div>
      <div className="absolute top-10 left-10 w-32 h-32 rounded-full blur-xl" style={{ background: "var(--brand-color)", opacity: 0.1 }}></div>
      <div className="absolute bottom-10 right-10 w-40 h-40 rounded-full blur-xl" style={{ background: "var(--brand-color)", opacity: 0.1 }}></div>
      
      <div className="relative z-10 mb-12">
        {/* Logo/Icono principal */}
        <div className="mb-6 relative">
          <div className="w-20 h-20 mx-auto rounded-2xl flex items-center justify-center shadow-lg transform rotate-3" style={{ backgroundColor: "var(--brand-color)" }}>
            <MessageCircle className="w-10 h-10 text-white" />
          </div>
          <div className="absolute -top-2 -right-2 w-6 h-6 bg-gradient-to-br from-yellow-400 to-orange-400 rounded-full flex items-center justify-center">
            <Sparkles className="w-3 h-3 text-white" />
          </div>
        </div>
        
        <h2 className="text-3xl font-bold mb-3" style={{ color: "var(--brand-color)" }}>
          {botName ?? "Becas Grupo Romero"}
        </h2>

      </div>
      
      <div className="relative z-10 grid grid-cols-1 md:grid-cols-2 gap-4 max-w-3xl w-full">
        {starters.map((text, index) => (
          <button
            key={`${text}-${index}`}
            onClick={handleClick}
            className="group relative p-6 text-left bg-white/80 backdrop-blur-sm border border-gray-200/50 rounded-xl hover:bg-white transition-all duration-300 shadow-sm hover:shadow-lg hover:-translate-y-1"
          >
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-lg flex items-center justify-center shadow-md group-hover:scale-110 transition-transform duration-300" style={{ backgroundColor: "var(--brand-color)" }}>
                <Sparkles className="w-6 h-6 text-white" />
              </div>
              <div className="flex-1">
                <span className="text-gray-800 font-medium leading-relaxed" style={{ color: undefined }}>
                  {text}
                </span>
              </div>
            </div>
          </button>
        ))}
        {starters.length === 0 && (
          <div className="text-sm text-gray-500">Sin atajos configurados</div>
        )}
      </div>
      
      {/* Texto de ayuda */}
      <div className="relative z-10 mt-8 text-sm text-gray-500">
        💡 Haz clic en cualquier pregunta para comenzar
      </div>
    </div>
  );
}
