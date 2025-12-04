import { MouseEvent, useEffect, useState } from "react";
import useSWR from "swr";
import { getPublicBotConfig } from "@/app/lib/services/botConfigService";
import { API_URL } from "@/app/lib/config";
import { Sparkles } from "lucide-react";

export function EmptyState(props: { onSubmit: (question: string) => any }) {
  const [botName, setBotName] = useState<string | undefined>(undefined);
  const { data: cfg } = useSWR("empty-bot-config", getPublicBotConfig);

  useEffect(() => {
    if (cfg?.theme_color) {
      try {
        document.documentElement.style.setProperty("--brand-color", cfg.theme_color);
      } catch {}
      setBotName(cfg.bot_name || undefined);
    }
  }, [cfg]);

  const handleClick = (e: MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.textContent) {
      props.onSubmit(target.textContent);
    }
  };

  const starters: string[] = Array.isArray(cfg?.starters) ? (cfg!.starters as string[]) : [];

  if (!cfg) return null;

  return (
    <div className="flex flex-col items-center justify-center h-full p-8 text-center relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-gray-50 via-white to-gray-50 opacity-40"></div>
      <div className="relative z-10 mb-12">
        <div className="mb-6 relative">
          <div className="w-24 h-24 mx-auto rounded-full ring-2 ring-white/80 shadow-md overflow-hidden flex items-center justify-center bg-brand">
            <img
              src={`${API_URL}/assets/logo`}
              alt="logo"
              className="w-full h-full object-cover"
              onError={(e) => {
                e.currentTarget.style.display = "none";
                const parent = e.currentTarget.parentElement;
                if (parent) parent.innerHTML = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='white' width='56' height='56'><path d='M21 15a4 4 0 10-8 0 4 4 0 008 0zm-8 6a6 6 0 016-6 6 6 0 00-6 6zM6 8a4 4 0 118 0 4 4 0 01-8 0zM2 20a6 6 0 1112 0H2z'/></svg>`;
              }}
            />
          </div>
        </div>
        <h2 className="text-3xl font-bold mb-3 text-brand">
          {botName ?? "Becas Grupo Romero"}
        </h2>
      </div>
      <div className="relative z-10 grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl w-full">
        {starters.map((text, index) => (
          <button
            key={`${text}-${index}`}
            onClick={handleClick}
            className="group relative p-5 text-left bg-white border border-gray-200/60 rounded-xl hover:bg-gray-50 transition-colors duration-200 shadow-sm"
          >
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-lg flex items-center justify-center shadow-sm bg-brand">
                <Sparkles className="w-6 h-6 text-brand-foreground" />
              </div>
              <div className="flex-1">
                <span className="text-gray-800 font-medium leading-relaxed">
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
      <div className="relative z-10 mt-8 text-sm text-gray-500">
        💡 Haz clic en cualquier pregunta para comenzar
      </div>
    </div>
  );
}
