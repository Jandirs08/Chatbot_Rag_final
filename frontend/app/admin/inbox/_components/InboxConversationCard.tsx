"use client";

import React from "react";
import { useDraggable } from "@dnd-kit/core";
import { Button } from "@/app/components/ui/button";
import { cn } from "@/lib/utils";
import { GripVertical, Loader2 } from "lucide-react";
import {
  colorFromId,
  displayLabel,
  fmtDate,
  getInitials,
  getScoreColor,
} from "./utils";

export type InboxMode = "bot" | "pending" | "human" | "paused";

export type InboxStage = "active" | "completed";

export type InboxConversation = {
  conversation_id: string;
  channel: string;
  external_id: string;
  mode: InboxMode;
  category?: string | null;
  urgency?: string | null;
  ai_summary?: string | null;
  ai_summary_at?: string | null;
  ai_summary_at_msg_count?: number | null;
  message_count?: number | null;
  assigned_agent_id?: string | null;
  pending_since?: string | null;
  minutes_waiting?: number | null;
  updated_at?: string | null;
  lead_name?: string | null;
  lead_email?: string | null;
  lead_captured_at?: string | null;
  lead_score?: number | null;
  product_interests?: string[] | null;
  recommended_action?: string | null;
  confidence?: number | null;
  stage?: InboxStage | null;
  completed_at?: string | null;
};

interface InboxConversationCardProps {
  conversation: InboxConversation;
  isActive: boolean;
  isMutating: boolean;
  agentId: string;
  onSelect: (id: string) => void;
  onTakeover: (id: string) => void;
  onRelease: (id: string) => void;
}

const MODE_DOT: Record<InboxMode, string> = {
  bot: "bg-slate-400",
  pending: "bg-amber-500",
  human: "bg-violet-500",
  paused: "bg-slate-300",
};

const URGENCY_DOT: Record<string, string> = {
  alta: "bg-red-500",
  media: "bg-amber-400",
  baja: "bg-emerald-500",
};

const MODE_LABEL: Record<InboxMode, string> = {
  bot: "Bot",
  pending: "Pendiente",
  human: "Agente",
  paused: "Pausa",
};

export function InboxConversationCard({
  conversation,
  isActive,
  isMutating,
  agentId,
  onSelect,
  onTakeover,
  onRelease,
}: InboxConversationCardProps) {
  const {
    conversation_id,
    mode,
    lead_name,
    lead_email,
    lead_score,
    product_interests,
    urgency,
    channel,
    external_id,
    updated_at,
    pending_since,
    minutes_waiting,
    assigned_agent_id,
  } = conversation;

  const initials = getInitials(lead_name, conversation_id);
  const avatarBg = colorFromId(conversation_id);
  const name = displayLabel({
    name: lead_name,
    channel,
    externalId: external_id,
    conversationId: conversation_id,
  });

  const isCompleted = conversation.stage === "completed";

  const hasScore = lead_score != null;
  const sc = hasScore ? getScoreColor(lead_score!) : null;
  const hasInterests = (product_interests?.length ?? 0) > 0;

  // Score is "frozen" if the conversation was completed >7d ago — show snapshot tooltip
  const completedAt = conversation.completed_at
    ? new Date(conversation.completed_at)
    : null;
  const isScoreSnapshot =
    isCompleted &&
    completedAt != null &&
    Date.now() - completedAt.getTime() > 7 * 24 * 60 * 60 * 1000;

  const isPending = mode === "pending";
  const isHuman = mode === "human";
  const isAssignedToMe = assigned_agent_id === agentId;
  const showTakeover = isPending || mode === "bot";
  const showRelease = isHuman && isAssignedToMe;

  const timestamp = fmtDate(updated_at ?? pending_since ?? undefined);

  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
    isDragging,
  } = useDraggable({
    id: `card-${conversation_id}`,
    data: { conversation },
  });

  return (
    <div
      ref={setDragRef}
      className={cn(
        "group/card relative",
        isDragging && "opacity-40",
      )}
    >
      <button
        type="button"
        onClick={() => onSelect(conversation_id)}
        className={cn(
          "group relative w-full overflow-hidden rounded-xl border text-left",
          "transition-[transform,box-shadow,border-color,background-color,opacity] duration-150 ease-out",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-1 focus-visible:ring-offset-background",
          isMutating && "pointer-events-none opacity-60",
          isActive
            ? "border-primary/40 bg-primary/[0.05] shadow-[0_0_0_2px_hsl(var(--primary)/0.18)]"
            : isCompleted
              ? "border-border/40 bg-white/70 opacity-80 hover:opacity-100 hover:border-violet-300/60 dark:bg-card/70"
              : "border-border/60 bg-white hover:-translate-y-px hover:border-primary/30 hover:shadow-[0_4px_20px_rgb(79_53_204/0.1)] dark:bg-card",
        )}
      >
      {/* Alta urgency: full top bar (not a side stripe) */}
      {urgency === "alta" && (
        <div className="absolute inset-x-0 top-0 h-0.5 bg-red-500" />
      )}

      <div className="p-3 pt-3.5">
        {/* Row 1: avatar + name + score */}
        <div className="flex items-center gap-2">
          <div
            className="flex h-8 w-8 flex-none items-center justify-center rounded-lg font-heading text-[11px] font-bold leading-none shadow-sm"
            style={{ backgroundColor: avatarBg, color: "rgba(0,0,0,0.55)" }}
          >
            {initials}
          </div>

          <div className="min-w-0 flex-1">
            <span
              className={cn(
                "block truncate font-heading text-[12.5px] font-semibold leading-tight tracking-tight",
                isActive
                  ? "text-primary"
                  : "text-foreground group-hover:text-primary/90",
              )}
            >
              {name}
            </span>
            {lead_email ? (
              <span className="block truncate text-[10px] text-info">
                {lead_email}
              </span>
            ) : (
              <span className="block font-mono text-[9px] text-muted-foreground/50">
                {conversation_id.slice(0, 10)}…
              </span>
            )}
          </div>

          {/* Score badge */}
          {hasScore && (
            <div
              className="flex-none rounded-md px-1.5 py-0.5"
              style={{ backgroundColor: sc!.bg }}
              title={
                isScoreSnapshot
                  ? "Score congelado al completar la conversación"
                  : undefined
              }
            >
              <span
                className="font-mono text-[12px] font-bold tabular-nums"
                style={{ color: sc!.color }}
              >
                {lead_score}
              </span>
            </div>
          )}
        </div>

        {/* Score bar */}
        {hasScore && (
          <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-muted/30">
            <div
              className="h-full rounded-full transition-[width] duration-300 ease-out"
              style={{ width: `${lead_score}%`, backgroundColor: sc!.color }}
            />
          </div>
        )}

        {/* Row 2: mode dot + urgency + timestamp */}
        <div className="mt-2 flex items-center gap-1.5">
          <span
            className={cn(
              "h-1.5 w-1.5 flex-none rounded-full",
              MODE_DOT[mode],
            )}
            title={MODE_LABEL[mode]}
          />
          <span className="font-heading text-[10px] font-medium text-muted-foreground">
            {MODE_LABEL[mode]}
          </span>
          {urgency && (
            <>
              <span className="text-muted-foreground/40">·</span>
              <span
                className={cn(
                  "h-1.5 w-1.5 flex-none rounded-full",
                  URGENCY_DOT[urgency] ?? "bg-slate-400",
                )}
              />
            </>
          )}
          {isScoreSnapshot && (
            <>
              <span className="text-muted-foreground/40">·</span>
              <span
                className="rounded-sm bg-violet-100/80 px-1 font-heading text-[9px] font-semibold uppercase tracking-wide text-violet-700 dark:bg-violet-950/60 dark:text-violet-300"
                title="Score congelado al completar la conversación"
              >
                snapshot
              </span>
            </>
          )}
          {isPending && minutes_waiting != null && (
            <span className="ml-auto font-mono text-[10px] font-semibold text-amber-600">
              {minutes_waiting}m
            </span>
          )}
          {timestamp && !isPending && (
            <span className="ml-auto font-mono text-[9px] text-muted-foreground/50">
              {timestamp}
            </span>
          )}
        </div>

        {/* Interests — first one only */}
        {hasInterests && (
          <div className="mt-2">
            <span className="inline-flex items-center rounded-md bg-primary/[0.08] px-1.5 py-0.5 text-[10px] font-semibold text-primary">
              {product_interests![0]}
            </span>
            {product_interests!.length > 1 && (
              <span className="ml-1 font-mono text-[9px] text-muted-foreground">
                +{product_interests!.length - 1}
              </span>
            )}
          </div>
        )}

        {/* Action button */}
        {(showTakeover || showRelease) && (
          <div className="mt-2.5 flex gap-1.5">
            {showTakeover && (
              <Button
                variant="default"
                size="sm"
                disabled={isMutating}
                onClick={(e) => {
                  e.stopPropagation();
                  onTakeover(conversation_id);
                }}
                className="h-6 flex-1 rounded-lg px-2 font-heading text-[10px] font-semibold"
              >
                {isMutating ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  "Tomar"
                )}
              </Button>
            )}
            {showRelease && (
              <Button
                variant="outline"
                size="sm"
                disabled={isMutating}
                onClick={(e) => {
                  e.stopPropagation();
                  onRelease(conversation_id);
                }}
                className="h-6 flex-1 rounded-lg px-2 font-heading text-[10px] font-semibold"
              >
                {isMutating ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  "Al bot"
                )}
              </Button>
            )}
          </div>
        )}
      </div>
      </button>
      {/* Drag handle — hover-only, doesn't intercept card click */}
      <button
        type="button"
        {...listeners}
        {...attributes}
        aria-label="Arrastrar conversación"
        className={cn(
          "absolute right-1.5 top-1.5 z-10 hidden h-5 w-5 items-center justify-center rounded-md text-muted-foreground/60",
          "cursor-grab active:cursor-grabbing",
          "transition-colors duration-150 ease-out hover:bg-muted/60 hover:text-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
          "group-hover/card:flex",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
