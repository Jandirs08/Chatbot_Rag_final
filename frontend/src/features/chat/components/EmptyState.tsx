import { useEffect, useState } from "react";
import useSWR from "swr";
import Image from "next/image";
import { getPublicBotConfig } from "@/app/lib/services/botConfigService";
import { API_URL } from "@/app/lib/config";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

export function EmptyState(props: {
  onSubmit: (question: string) => any;
  variant?: "default" | "playground";
}) {
  const [botName, setBotName] = useState<string | undefined>(undefined);
  const { data: cfg } = useSWR("empty-bot-config", getPublicBotConfig);
  const variant = props.variant ?? "default";
  const isPlayground = variant === "playground";

  useEffect(() => {
    if (cfg?.theme_color) {
      try {
        document.documentElement.style.setProperty(
          "--brand-color",
          cfg.theme_color,
        );
      } catch {}
      setBotName(cfg.bot_name || undefined);
    }
  }, [cfg]);

  const handleStarter = (text: string) => {
    props.onSubmit(text);
  };

  const starters: string[] = Array.isArray(cfg?.starters)
    ? (cfg!.starters as string[])
    : [];

  if (!cfg) return null;

  return (
    <div
      className={cn(
        "relative flex h-full flex-col overflow-hidden",
        isPlayground
          ? "items-stretch justify-start p-4 text-left"
          : "items-center justify-center p-8 text-center",
      )}
    >
      <div
        className={cn(
          "absolute inset-0",
          isPlayground
            ? "bg-gradient-to-br from-surface via-background to-surface opacity-70"
            : "bg-gradient-to-br from-gray-50 via-white to-gray-50 opacity-40",
        )}
      />
      <div
        className={cn(
          "relative z-10",
          isPlayground ? "mb-4 flex items-center gap-4" : "mb-12",
        )}
      >
        <div className={cn("relative", isPlayground ? "mb-0" : "mb-6")}>
          <div
            className={cn(
              "mx-auto flex items-center justify-center overflow-hidden bg-brand",
              isPlayground
                ? "h-14 w-14 rounded-[20px] ring-1 ring-white/70 shadow-sm"
                : "h-24 w-24 rounded-full ring-2 ring-white/80 shadow-md",
            )}
          >
            <Image
              src={`${API_URL}/assets/logo`}
              alt="logo"
              width={96}
              height={96}
              className="w-full h-full object-cover"
              onError={(e) => {
                e.currentTarget.style.display = "none";
                const parent = e.currentTarget.parentElement;
                if (parent)
                  parent.innerHTML = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='white' width='56' height='56'><path d='M21 15a4 4 0 10-8 0 4 4 0 008 0zm-8 6a6 6 0 016-6 6 6 0 00-6 6zM6 8a4 4 0 118 0 4 4 0 01-8 0zM2 20a6 6 0 1112 0H2z'/></svg>`;
              }}
              unoptimized
            />
          </div>
        </div>
        <div className={cn(isPlayground && "space-y-1")}>
        <h2
          className={cn(
            "font-bold text-brand",
            isPlayground ? "mb-1 text-xl" : "mb-3 text-3xl",
          )}
        >
          {botName ?? "Becas Grupo Romero"}
        </h2>
        {isPlayground && (
          <p className="max-w-lg text-sm text-muted-foreground">
            Escribe una consulta y revisa fuentes, latencia y verificación sin
            salir del hilo.
          </p>
        )}
        </div>
      </div>
      <div
        className={cn(
          "relative z-10 grid w-full max-w-3xl grid-cols-1",
          isPlayground ? "gap-3" : "gap-6 md:grid-cols-2",
        )}
      >
        {starters.map((text, index) => (
          <button
            key={`${text}-${index}`}
            onClick={() => handleStarter(text)}
            className={cn(
              "group relative text-left transition-colors duration-200",
              isPlayground
                ? "rounded-2xl border border-border/60 bg-card px-4 py-3.5 shadow-sm hover:border-border hover:bg-muted/40"
                : "rounded-xl border border-gray-200/60 bg-white p-5 shadow-sm hover:bg-gray-50",
            )}
          >
            <div className="flex items-start gap-4">
              <div
                className={cn(
                  "flex items-center justify-center bg-brand",
                  isPlayground
                    ? "h-10 w-10 rounded-2xl shadow-sm"
                    : "h-12 w-12 rounded-lg shadow-sm",
                )}
              >
                <Sparkles className="w-6 h-6 text-brand-foreground" />
              </div>
              <div className="flex-1">
                <span
                  className={cn(
                    "font-medium leading-relaxed",
                    isPlayground ? "text-foreground" : "text-gray-800",
                  )}
                >
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
      <div
        className={cn(
          "relative z-10 text-sm",
          isPlayground ? "mt-5 text-xs text-muted-foreground" : "mt-8 text-gray-500",
        )}
      >
        Haz clic en cualquier pregunta para comenzar
      </div>
    </div>
  );
}
