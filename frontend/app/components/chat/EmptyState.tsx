import Image from "next/image";
import { MessageCircle, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  onSubmit: (question: string) => any;
  variant?: "default" | "playground";
  botName?: string;
  starters: string[];
  logoUrl?: string;
}

export function EmptyState({
  onSubmit,
  variant = "default",
  botName,
  starters,
  logoUrl,
}: EmptyStateProps) {
  const isPlayground = variant === "playground";

  return (
    <div
      className={cn(
        "relative flex h-full flex-col overflow-hidden",
        isPlayground
          ? "items-stretch justify-start p-4 text-left"
          : "items-center justify-center p-6 text-center sm:p-8",
      )}
    >
      {!isPlayground && (
        <div className="relative z-10 mb-5 flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl bg-brand text-brand-foreground shadow-[0_8px_24px_-10px_hsl(var(--primary)/0.5)] ring-1 ring-black/5 animate-bubble-in">
          {logoUrl ? (
            <Image
              src={logoUrl}
              alt="logo"
              width={56}
              height={56}
              className="h-full w-full object-cover"
              unoptimized
            />
          ) : (
            <MessageCircle className="h-7 w-7" />
          )}
        </div>
      )}

      <div className="relative z-10 mb-6">
        <h2
          className={cn(
            "font-semibold tracking-tight text-foreground",
            isPlayground ? "text-xl" : "text-2xl sm:text-[26px]",
          )}
        >
          ¿En qué puedo ayudarte?
        </h2>
        {!isPlayground && botName && (
          <p className="mt-1.5 text-sm text-muted-foreground">{botName}</p>
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
            "relative z-10 grid w-full max-w-2xl grid-cols-1 gap-2",
            isPlayground ? "" : "sm:grid-cols-2",
          )}
        >
          {starters.map((text, index) => (
            <button
              key={`${text}-${index}`}
              onClick={() => onSubmit(text)}
              style={{ animationDelay: `${80 * index}ms` }}
              className={cn(
                "group flex items-start gap-2.5 rounded-xl border border-border bg-surface-elevated px-3.5 py-3 text-left text-[14px] leading-snug text-foreground transition-all duration-200 hover:-translate-y-0.5 hover:border-brand/40 hover:bg-muted hover:shadow-[0_8px_20px_-12px_hsl(var(--primary)/0.45)] active:translate-y-0 active:scale-[0.99] animate-bubble-in",
              )}
            >
              <Sparkles
                className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-brand"
                aria-hidden="true"
              />
              <span className="min-w-0">{text}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="text-sm text-muted-foreground">
          Escribe tu pregunta para empezar
        </div>
      )}
    </div>
  );
}
