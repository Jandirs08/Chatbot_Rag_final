"use client";

import React from "react";
import { Button } from "@/app/components/ui/button";
import { cn } from "@/lib/utils";
import {
  CheckCircle2,
  Loader2,
  RotateCcw,
} from "lucide-react";
import type { ScoreStyle } from "./utils";

// ─── Props ────────────────────────────────────────────────────────────────────

export interface WorkspaceHeaderProps {
  displayName: string;
  categoryLabel: string | null;
  channel: string;
  ChannelIcon: React.ReactNode;
  modeLabel: string;
  isHuman: boolean;
  isPending: boolean;
  hasScore: boolean;
  sc: ScoreStyle | null;
  lead_score: number | null;
  minutes_waiting: number | null;
  showTakeover: boolean;
  showRelease: boolean;
  takeoverMutating: boolean;
  onTakeover: () => void;
  onRelease: () => void;
  stageMutating: boolean;
  onStageToggle: () => void;
  isCompleted: boolean;
  initials: string;
  avatarBg: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function WorkspaceHeader({
  displayName,
  categoryLabel,
  channel,
  ChannelIcon,
  modeLabel,
  isHuman,
  isPending,
  hasScore,
  sc,
  lead_score,
  minutes_waiting,
  showTakeover,
  showRelease,
  takeoverMutating,
  onTakeover,
  onRelease,
  stageMutating,
  onStageToggle,
  isCompleted,
  initials,
  avatarBg,
}: WorkspaceHeaderProps) {
  return (
    <header className="flex flex-none items-center gap-3 border-b border-border/60 bg-card px-4 py-3 pr-12 sm:px-5 sm:pr-14">
      <div
        className="flex h-8 w-8 flex-none items-center justify-center rounded-lg font-heading text-[10px] font-bold text-foreground/70 shadow-sm"
        style={{ backgroundColor: avatarBg }}
        aria-hidden="true"
      >
        {initials}
      </div>
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <h2
          id="conversation-dialog-title"
          className="truncate font-heading text-[14px] font-semibold leading-tight tracking-tight text-foreground"
        >
          {displayName}
        </h2>
        {categoryLabel && (
          <span
            className="hidden flex-none rounded-md border border-border/60 bg-muted/40 px-1.5 py-0.5 font-heading text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground sm:inline"
            aria-label={`Categoría ${categoryLabel}`}
          >
            {categoryLabel}
          </span>
        )}
      </div>

      <div className="hidden flex-none items-center gap-1.5 md:flex">
        <span className="inline-flex items-center gap-1 text-[11px] capitalize text-muted-foreground">
          {ChannelIcon}
          {channel}
        </span>
        <span className="text-muted-foreground/40" aria-hidden="true">
          ·
        </span>
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-heading text-[10px] font-semibold uppercase tracking-[0.1em]",
            isHuman
              ? "border-primary/30 bg-primary/10 text-primary"
              : isPending
                ? "border-warning/30 bg-warning/10 text-warning"
                : "border-border/60 bg-muted/40 text-muted-foreground",
          )}
        >
          {modeLabel}
        </span>
        {hasScore && sc && (
          <span
            className={cn(
              "rounded-md border px-1.5 py-0.5 font-mono text-[11px] font-bold tabular-nums",
              sc.tone === "success" &&
                "border-success/25 bg-success/10 text-success",
              sc.tone === "warning" &&
                "border-warning/25 bg-warning/10 text-warning",
              sc.tone === "error" && "border-error/25 bg-error/10 text-error",
            )}
            aria-label={`Lead score ${lead_score} de 100`}
            title={`Lead score ${lead_score} de 100`}
          >
            {lead_score}
          </span>
        )}
        {isPending && minutes_waiting != null && (
          <span className="font-mono text-[11px] font-semibold text-amber">
            {minutes_waiting}m esperando
          </span>
        )}
      </div>

      <div className="flex flex-none items-center gap-1.5">
        {showTakeover && (
          <Button
            size="sm"
            disabled={takeoverMutating}
            onClick={onTakeover}
            className="h-8 flex-none rounded-lg px-3 font-heading text-[11px] font-semibold"
            aria-label="Tomar conversación"
          >
            {takeoverMutating ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
            ) : (
              "Tomar"
            )}
          </Button>
        )}
        {showRelease && (
          <Button
            variant="outline"
            size="sm"
            disabled={takeoverMutating}
            onClick={onRelease}
            className="h-8 flex-none rounded-lg px-3 font-heading text-[11px] font-semibold"
            aria-label="Devolver al bot"
          >
            {takeoverMutating ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
            ) : (
              "Devolver"
            )}
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          disabled={stageMutating}
          onClick={onStageToggle}
          className="h-8 flex-none gap-1.5 rounded-lg px-3 font-heading text-[11px] font-semibold"
          aria-label={
            isCompleted ? "Reabrir conversación" : "Completar conversación"
          }
        >
          {stageMutating ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
          ) : isCompleted ? (
            <>
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">Reabrir</span>
            </>
          ) : (
            <>
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">Completar</span>
            </>
          )}
        </Button>
      </div>
    </header>
  );
}
