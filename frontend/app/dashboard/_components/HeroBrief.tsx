"use client";

import { FadeIn } from "@/app/_components/motion/FadeIn";
import { TickNumber } from "@/app/_components/motion/TickNumber";

interface HeroBriefProps {
  messages: number;
  conversations: number;
  leads: number;
  docs: number;
  vsYesterday?: number;
}

export function HeroBrief({
  messages,
  conversations,
  leads,
  docs,
  vsYesterday,
}: HeroBriefProps) {
  const hasVs = vsYesterday != null;
  const trendUp = hasVs && vsYesterday >= 0;
  const trendPct = hasVs ? Math.abs(vsYesterday) : 0;

  return (
    <FadeIn delay={0}>
      <div>
        {/* Eyebrow */}
        <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-2">
          Intelligence Brief · Hoy
        </div>

        {/* Main metrics row */}
        <div className="flex flex-wrap items-end gap-0">
          {/* Messages */}
          <div className="flex flex-col">
            <span className="text-4xl font-heading font-bold tabular-nums leading-none text-violet-400">
              <TickNumber value={messages} />
            </span>
            <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground mt-1">
              Mensajes
            </span>
          </div>

          <span className="mx-3 text-2xl self-end pb-1 text-border">·</span>

          {/* Conversations */}
          <div className="flex flex-col">
            <span className="text-4xl font-heading font-bold tabular-nums leading-none text-cyan-400">
              <TickNumber value={conversations} />
            </span>
            <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground mt-1">
              Conversaciones
            </span>
          </div>

          <span className="mx-3 text-2xl self-end pb-1 text-border">·</span>

          {/* Leads */}
          <div className="flex flex-col">
            <span className="text-4xl font-heading font-bold tabular-nums leading-none text-emerald-400">
              <TickNumber value={leads} />
            </span>
            <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground mt-1">
              Leads
            </span>
          </div>

          <span className="mx-3 text-2xl self-end pb-1 text-border">·</span>

          {/* Docs */}
          <div className="flex flex-col">
            <span className="text-4xl font-heading font-bold tabular-nums leading-none text-muted-foreground">
              <TickNumber value={docs} />
            </span>
            <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground mt-1">
              Documentos
            </span>
          </div>
        </div>

        {/* Sub row */}
        <div className="flex flex-wrap items-center gap-3 mt-3">
          {hasVs && (
            <span
              className={`text-[11px] font-mono px-2 py-0.5 rounded-full border tabular-nums ${
                trendUp
                  ? "text-emerald-400 bg-emerald-400/10 border-emerald-400/25"
                  : "text-rose-400 bg-rose-400/10 border-rose-400/25"
              }`}
            >
              {trendUp ? "↑" : "↓"} {trendPct}% vs ayer
            </span>
          )}
          <span className="text-[11px] font-mono text-muted-foreground">
            Datos en tiempo real · auto-refresh 60s
          </span>
        </div>
      </div>
    </FadeIn>
  );
}
