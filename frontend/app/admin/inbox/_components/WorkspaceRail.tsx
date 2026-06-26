"use client";

import React from "react";
import { ScrollArea } from "@/app/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { getScoreStyle, formatRelativeAgo } from "./utils";
import { SummaryCard } from "./SummaryCard";

// ─── Score bar ────────────────────────────────────────────────────────────────

function ScoreBar({ score }: { score: number }) {
  const sc = getScoreStyle(score);
  const toneText =
    sc.tone === "success"
      ? "text-success"
      : sc.tone === "warning"
        ? "text-warning"
        : "text-error";
  const toneBg =
    sc.tone === "success"
      ? "bg-success"
      : sc.tone === "warning"
        ? "bg-warning"
        : "bg-error";
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="font-heading text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Lead Score
        </span>
        <div className="flex items-baseline gap-1">
          <span
            className={cn(
              "font-mono text-2xl font-bold tabular-nums",
              toneText,
            )}
          >
            {score}
          </span>
          <span className="text-[10px] text-muted-foreground">/100</span>
        </div>
      </div>
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-muted/30"
        role="progressbar"
        aria-valuenow={score}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Lead score"
      >
        <div
          className={cn(
            "h-full rounded-full transition-all duration-700 ease-out",
            toneBg,
          )}
          style={{ width: `${score}%` }}
        />
      </div>
      <p className={cn("text-[11px] font-semibold", toneText)}>{sc.label}</p>
    </div>
  );
}

// ─── Rail (lead details) ──────────────────────────────────────────────────────

export interface RailProps {
  hasLeadDetails: boolean;
  hasScore: boolean;
  leadScore: number | null;
  hasAction: boolean;
  recommendedAction: string | null;
  hasInterests: boolean;
  productInterests: string[];
  urgency: string | null;
  leadEmail: string | null;
  leadCapturedAt: string | null;
  purchaseIntent: number | null;
  hasSummary: boolean;
  aiSummary: string | null;
  summaryStaleness: string | null;
  isRefreshing: boolean;
  onRefresh: () => void;
}

export function WorkspaceRail({
  hasLeadDetails,
  hasScore,
  leadScore,
  hasAction,
  recommendedAction,
  hasInterests,
  productInterests,
  urgency,
  leadEmail,
  leadCapturedAt,
  purchaseIntent,
  hasSummary,
  aiSummary,
  summaryStaleness,
  isRefreshing,
  onRefresh,
}: RailProps) {
  const capturedAt = leadCapturedAt ? new Date(leadCapturedAt) : null;
  return (
    <ScrollArea className="h-full">
      <div className="space-y-3 p-4">
        <SummaryCard
          hasSummary={hasSummary}
          aiSummary={aiSummary}
          summaryStaleness={summaryStaleness}
          isRefreshing={isRefreshing}
          onRefresh={onRefresh}
          recommendedAction={recommendedAction}
          purchaseIntent={purchaseIntent}
        />

        {hasLeadDetails && (
          <div className="rounded-xl border border-border/60 bg-card p-3.5 shadow-sm">
            <h3 className="mb-3 font-heading text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Lead
            </h3>
            <div className="space-y-4">
              {hasScore && leadScore != null && <ScoreBar score={leadScore} />}

              {(hasAction || hasInterests || urgency) && (
                <div className="space-y-3 border-t border-border/40 pt-3">
                  {hasAction && recommendedAction && (
                    <div className="rounded-lg border border-primary/20 bg-primary/[0.06] px-3 py-2">
                      <span className="block font-heading text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                        Acción sugerida
                      </span>
                      <p className="mt-1 font-heading text-[12px] font-semibold text-primary">
                        {recommendedAction}
                      </p>
                    </div>
                  )}
                  {urgency && (
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "h-2 w-2 flex-none rounded-full",
                          urgency === "alta"
                            ? "bg-error"
                            : urgency === "media"
                              ? "bg-warning"
                              : "bg-success",
                        )}
                        aria-hidden="true"
                      />
                      <span className="text-[12px] font-medium text-muted-foreground">
                        Urgencia {urgency}
                      </span>
                    </div>
                  )}
                  {hasInterests && (
                    <div>
                      <span className="block font-heading text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                        Productos
                      </span>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {productInterests.map((interest) => (
                          <span
                            key={interest}
                            className="inline-flex items-center rounded-md bg-primary/[0.09] px-2 py-0.5 text-[11px] font-semibold text-primary"
                          >
                            {interest}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {(leadEmail || capturedAt) && (
                <div className="space-y-1 border-t border-border/40 pt-3">
                  <span className="font-heading text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                    Contacto
                  </span>
                  {leadEmail && (
                    <p className="truncate text-[12px] font-medium text-info">
                      {leadEmail}
                    </p>
                  )}
                  {capturedAt && (
                    <p className="font-mono text-[10px] text-muted-foreground/70">
                      Capturado {formatRelativeAgo(capturedAt)}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </ScrollArea>
  );
}
