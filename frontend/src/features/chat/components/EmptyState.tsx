import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  onSubmit: (question: string) => any;
  variant?: "default" | "playground";
  botName?: string;
  starters: string[];
}

// Icono de bot SVG inline — sin depender del backend para el estado inicial
function BotIcon({ size = 48 }: { size?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="white"
      width={size}
      height={size}
    >
      <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7H3a7 7 0 0 1 7-7h1V5.73A2 2 0 0 1 12 2zM7.5 14a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm9 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm-9 5a5 5 0 0 0 9 0H7.5z" />
    </svg>
  );
}

export function EmptyState({
  onSubmit,
  variant = "default",
  botName,
  starters,
}: EmptyStateProps) {
  const isPlayground = variant === "playground";

  return (
    <div
      className={cn(
        "relative flex h-full flex-col overflow-hidden",
        isPlayground
          ? "items-stretch justify-start p-4 text-left"
          : "items-center justify-center p-8 text-center",
      )}
    >
      {/* Fondo sutil */}
      <div
        className={cn(
          "absolute inset-0 pointer-events-none",
          isPlayground
            ? "bg-gradient-to-br from-surface via-background to-surface opacity-70"
            : "bg-[radial-gradient(ellipse_at_top,_#eff6ff_0%,_#f7f8fa_60%)]",
        )}
      />

      {/* Logo area */}
      <div
        className={cn(
          "relative z-10",
          isPlayground ? "mb-4 flex items-center gap-4" : "mb-10",
        )}
      >
        {/* Contenedor del ícono — con anillo y sombra de color */}
        <div
          className={cn(
            "mx-auto flex items-center justify-center overflow-hidden bg-brand",
            isPlayground
              ? "h-14 w-14 rounded-[20px] ring-1 ring-white/70 shadow-sm"
              : "h-24 w-24 rounded-full shadow-lg shadow-blue-500/20 ring-4 ring-white",
          )}
        >
          <BotIcon size={isPlayground ? 28 : 48} />
        </div>

        <div className={cn(isPlayground && "space-y-1")}>
          <h2
            className={cn(
              "font-bold text-brand",
              isPlayground ? "mb-1 text-xl" : "mb-2 mt-5 text-3xl",
            )}
          >
            {botName ?? "Asistente"}
          </h2>
          {!isPlayground && (
            <p className="text-sm text-slate-500 max-w-xs mx-auto">
              Hola 👋 ¿En qué puedo ayudarte hoy?
            </p>
          )}
          {isPlayground && (
            <p className="max-w-lg text-sm text-muted-foreground">
              Escribe una consulta y revisa fuentes, latencia y verificación sin
              salir del hilo.
            </p>
          )}
        </div>
      </div>

      {/* Starters / preguntas rápidas */}
      <div
        className={cn(
          "relative z-10 grid w-full max-w-3xl grid-cols-1",
          isPlayground ? "gap-3" : "gap-4 md:grid-cols-2",
        )}
      >
        {starters.map((text, index) => (
          <button
            key={`${text}-${index}`}
            onClick={() => onSubmit(text)}
            className={cn(
              "group relative text-left transition-all duration-200",
              isPlayground
                ? "rounded-2xl border border-border/60 bg-card px-4 py-3.5 shadow-sm hover:border-border hover:bg-muted/40"
                : "rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm hover:shadow-md hover:border-blue-200 hover:-translate-y-0.5",
            )}
          >
            <div className="flex items-start gap-4">
              <div
                className={cn(
                  "flex shrink-0 items-center justify-center bg-brand",
                  isPlayground
                    ? "h-10 w-10 rounded-2xl shadow-sm"
                    : "h-10 w-10 rounded-xl shadow-sm",
                )}
              >
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1">
                <span
                  className={cn(
                    "font-medium leading-relaxed text-sm",
                    isPlayground ? "text-foreground" : "text-slate-700",
                  )}
                >
                  {text}
                </span>
              </div>
            </div>
          </button>
        ))}
        {starters.length === 0 && (
          <div className="text-sm text-slate-400 text-center py-4">
            Sin atajos configurados
          </div>
        )}
      </div>

      <div
        className={cn(
          "relative z-10 text-xs",
          isPlayground
            ? "mt-5 text-muted-foreground"
            : "mt-8 text-slate-400",
        )}
      >
        Haz clic en cualquier pregunta para comenzar
      </div>
    </div>
  );
}
