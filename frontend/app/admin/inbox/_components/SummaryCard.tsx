"use client";

import React from "react";
import { Button } from "@/app/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Bot,
  Lightbulb,
  Loader2,
  RefreshCw,
  Sparkles,
  TrendingUp,
} from "lucide-react";

// ─── Analyzing placeholder ────────────────────────────────────────────────────

export function AnalyzingPlaceholder() {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-[12px] font-medium text-primary/80">
        <Sparkles className="h-3.5 w-3.5 animate-pulse motion-reduce:animate-none" />
        <span>Analizando conversación</span>
        <span className="inline-flex gap-0.5" aria-hidden="true">
          <span className="h-1 w-1 animate-pulse motion-reduce:animate-none rounded-full bg-primary/60 [animation-delay:0ms]" />
          <span className="h-1 w-1 animate-pulse motion-reduce:animate-none rounded-full bg-primary/60 [animation-delay:150ms]" />
          <span className="h-1 w-1 animate-pulse motion-reduce:animate-none rounded-full bg-primary/60 [animation-delay:300ms]" />
        </span>
      </div>
      <div className="space-y-2">
        <div className="skeleton-shimmer h-2.5 w-full rounded-full" />
        <div className="skeleton-shimmer h-2.5 w-4/5 rounded-full" />
        <div className="skeleton-shimmer h-2.5 w-3/5 rounded-full" />
      </div>
    </div>
  );
}

// ─── AI Summary Card ──────────────────────────────────────────────────────────

export interface SummaryCardProps {
  hasSummary: boolean;
  aiSummary: string | null;
  summaryStaleness: string | null;
  isRefreshing: boolean;
  onRefresh: () => void;
  recommendedAction: string | null;
  purchaseIntent: number | null;
}

export function SummaryCard({
  hasSummary,
  aiSummary,
  summaryStaleness,
  isRefreshing,
  onRefresh,
  recommendedAction,
  purchaseIntent,
}: SummaryCardProps) {
  const hasAction = Boolean(recommendedAction);
  const hasIntent = purchaseIntent != null;
  const intentPct =
    purchaseIntent == null
      ? null
      : Math.round(purchaseIntent <= 1 ? purchaseIntent * 100 : purchaseIntent);

  return (
    <section
      aria-label="Resumen de IA"
      className="rounded-xl border border-border/60 bg-gradient-to-br from-primary/[0.06] to-info/[0.04] p-3.5 shadow-sm"
    >
      <div className="flex items-start gap-2">
        <div
          className="flex h-7 w-7 flex-none items-center justify-center rounded-lg bg-primary/15 text-primary"
          aria-hidden="true"
        >
          <Sparkles className="h-3.5 w-3.5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-heading text-[12px] font-semibold tracking-tight text-foreground">
              Resumen IA
            </h3>
            {summaryStaleness && !isRefreshing && (
              <span className="min-w-0 truncate font-mono text-[10px] text-muted-foreground/70">
                {summaryStaleness}
              </span>
            )}
          </div>
        </div>
        {hasSummary && (
          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            className={cn(
              "flex h-8 w-8 flex-none items-center justify-center rounded-lg border border-primary/30 bg-card text-primary",
              "transition-[background-color,border-color,opacity] duration-200 ease-out",
              "hover:bg-primary/10 hover:border-primary/50",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-1 focus-visible:ring-offset-background",
              "disabled:cursor-not-allowed disabled:opacity-60",
            )}
            aria-label="Regenerar resumen"
            title="Regenerar resumen"
          >
            {isRefreshing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
          </button>
        )}
      </div>

      <div className="mt-3">
        {isRefreshing ? (
          <AnalyzingPlaceholder />
        ) : hasSummary ? (
          <p
            key={aiSummary ?? ""}
            className="animate-in fade-in slide-in-from-bottom-1 duration-300 text-[13px] leading-relaxed text-foreground/85"
          >
            {aiSummary}
          </p>
        ) : (
          <div className="flex flex-col items-start gap-2.5 rounded-lg border border-dashed border-border/60 bg-card/60 px-3 py-3">
            <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
              <Bot className="h-3.5 w-3.5 flex-none" aria-hidden="true" />
              Aún no hay resumen
            </div>
            <Button
              size="sm"
              onClick={onRefresh}
              className="h-8 gap-1.5 rounded-lg px-3 font-heading text-[11px] font-semibold"
              aria-label="Generar resumen"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Genera uno
            </Button>
          </div>
        )}
      </div>

      {hasSummary && (hasAction || hasIntent) && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border/40 pt-3">
          {hasAction && (
            <span
              className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-primary/25 bg-primary/[0.08] px-2.5 py-1 font-heading text-[11px] font-semibold text-primary"
              aria-label="Acción sugerida"
            >
              <Lightbulb className="h-3 w-3 flex-none" aria-hidden="true" />
              <span className="truncate">{recommendedAction}</span>
            </span>
          )}
          {hasIntent && intentPct != null && (
            <span
              className="inline-flex flex-none items-center gap-1.5 rounded-full border border-info/25 bg-info/[0.08] px-2.5 py-1 font-mono text-[11px] font-semibold tabular-nums text-info"
              aria-label={`Intención de compra ${intentPct} por ciento`}
            >
              <TrendingUp className="h-3 w-3" aria-hidden="true" />
              Intención de compra: {intentPct}%
            </span>
          )}
        </div>
      )}
    </section>
  );
}
