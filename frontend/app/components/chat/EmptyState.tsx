import { cn } from "@/lib/utils";

interface EmptyStateProps {
  onSubmit: (question: string) => any;
  variant?: "default" | "playground";
  botName?: string;
  starters: string[];
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
      <div className="relative z-10 mb-8">
        <h2
          className={cn(
            "font-semibold tracking-tight text-foreground",
            isPlayground ? "text-xl" : "text-3xl",
          )}
        >
          ¿En qué puedo ayudarte?
        </h2>
        {!isPlayground && botName && (
          <p className="mt-2 text-sm text-slate-500">
            {botName}
          </p>
        )}
        {isPlayground && (
          <p className="mt-2 max-w-lg text-sm text-muted-foreground">
            Escribe una consulta y revisa fuentes, latencia y verificación sin
            salir del hilo.
          </p>
        )}
      </div>

      {starters.length > 0 ? (
        <div
          className={cn(
            "relative z-10 grid w-full max-w-2xl grid-cols-1",
            isPlayground ? "gap-2" : "gap-2 md:grid-cols-2",
          )}
        >
          {starters.map((text, index) => (
            <button
              key={`${text}-${index}`}
              onClick={() => onSubmit(text)}
              className={cn(
                "group text-left text-sm leading-relaxed transition-colors",
                isPlayground
                  ? "rounded-xl border border-border/60 bg-card px-4 py-3 hover:border-border hover:bg-muted/40 text-foreground"
                  : "rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-700 hover:border-slate-300 hover:bg-slate-50",
              )}
            >
              {text}
            </button>
          ))}
        </div>
      ) : (
        <div className="text-sm text-slate-400">
          Escribe tu pregunta para empezar
        </div>
      )}
    </div>
  );
}
