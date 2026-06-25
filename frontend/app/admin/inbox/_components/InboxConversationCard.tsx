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
  getScoreTone,
} from "./utils";

export type InboxMode = "bot" | "pending" | "human";

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
  purchase_intent?: number | null;
  product_interests?: string[] | null;
  recommended_action?: string | null;
  confidence?: number | null;
  stage?: InboxStage | null;
  completed_at?: string | null;
  viewed_at?: string | null;
  last_user_message?: string | null;
  last_user_message_at?: string | null;
};

interface InboxConversationCardProps {
  conversation: InboxConversation;
  isActive: boolean;
  isMutating: boolean;
  agentId: string;
  onSelect: (id: string) => void;
  onTakeover: (id: string) => void;
  onRelease: (id: string) => void;
  onMarkViewed?: (id: string) => void;
}

const MODE_DOT: Record<InboxMode, string> = {
  bot: "bg-muted-foreground/60",
  pending: "bg-warning",
  human: "bg-primary",
};

const URGENCY_DOT: Record<string, string> = {
  alta: "bg-error",
  media: "bg-warning",
  baja: "bg-success",
};

const MODE_LABEL: Record<InboxMode, string> = {
  bot: "Bot",
  pending: "Pendiente",
  human: "Agente",
};

function InboxConversationCardImpl({
  conversation,
  isActive,
  isMutating,
  agentId,
  onSelect,
  onTakeover,
  onRelease,
  onMarkViewed,
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
    viewed_at,
    last_user_message,
    last_user_message_at,
    ai_summary,
  } = conversation;

  // Card is considered "seen" when viewed_at >= last_user_message_at
  // (no new user message arrived after the agent marked it viewed).
  const isSeen = (() => {
    if (!viewed_at) return false;
    if (!last_user_message_at) return true;
    try {
      return new Date(viewed_at).getTime() >= new Date(last_user_message_at).getTime();
    } catch {
      return false;
    }
  })();

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
  const scoreTone = hasScore ? getScoreTone(lead_score!) : null;
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
      role="listitem"
      className={cn(
        "group/card relative",
        isDragging && "opacity-40",
      )}
    >
      <button
        type="button"
        onClick={() => onSelect(conversation_id)}
        aria-current={isActive ? "true" : undefined}
        aria-label={`${name}${isSeen ? "" : " — mensaje nuevo"}`}
        aria-busy={isMutating}
        className={cn(
          "group relative w-full overflow-hidden rounded-xl border text-left",
          "transition-[transform,box-shadow,border-color,background-color,opacity] duration-150 ease-out",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-1 focus-visible:ring-offset-background",
          isMutating && "pointer-events-none opacity-60",
          isSeen && !isActive && "opacity-70 hover:opacity-100",
          isActive
            ? "border-primary/40 bg-primary/[0.05] shadow-[0_0_0_2px_hsl(var(--primary)/0.18)]"
            : isCompleted
              ? "border-border/40 bg-card/70 opacity-80 hover:opacity-100 hover:border-primary/30"
              : "border-border/60 bg-card hover:-translate-y-px hover:border-primary/30 hover:shadow-hover",
        )}
      >
      {/* Alta urgency: full top bar (not a side stripe) */}
      {urgency === "alta" && (
        <div className="absolute inset-x-0 top-0 h-0.5 bg-error" />
      )}

      <div className="p-3 pt-3.5">
        {/* Row 1: avatar + name + score */}
        <div className="flex items-center gap-2">
          <div
            aria-hidden="true"
            className="flex h-8 w-8 flex-none items-center justify-center rounded-lg font-heading text-[11px] font-bold leading-none text-foreground/70 shadow-sm"
            style={{ backgroundColor: avatarBg }}
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

          {/* Score badge — semantic token, not hardcoded hex */}
          {hasScore && scoreTone && (
            <div
              className={cn(
                "flex-none rounded-md border px-1.5 py-0.5",
                scoreTone === "success" &&
                  "border-success/25 bg-success/10 text-success",
                scoreTone === "warning" &&
                  "border-warning/25 bg-warning/10 text-warning",
                scoreTone === "error" &&
                  "border-error/25 bg-error/10 text-error",
              )}
              title={
                isScoreSnapshot
                  ? "Score congelado al completar la conversación"
                  : `Lead score ${lead_score} de 100`
              }
              aria-label={`Lead score ${lead_score} de 100`}
            >
              <span className="font-mono text-[12px] font-bold tabular-nums">
                {lead_score}
              </span>
            </div>
          )}
        </div>

        {/* Score bar */}
        {hasScore && scoreTone && (
          <div
            className="mt-2 h-1 w-full overflow-hidden rounded-full bg-muted/30"
            role="progressbar"
            aria-valuenow={lead_score!}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Lead score"
          >
            <div
              className={cn(
                "h-full rounded-full transition-[width] duration-300 ease-out",
                scoreTone === "success" && "bg-success",
                scoreTone === "warning" && "bg-warning",
                scoreTone === "error" && "bg-error",
              )}
              style={{ width: `${lead_score}%` }}
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
                  URGENCY_DOT[urgency] ?? "bg-muted-foreground/60",
                )}
              />
            </>
          )}
          {isScoreSnapshot && (
            <>
              <span className="text-muted-foreground/40">·</span>
              <span
                className="rounded-sm border border-border bg-muted px-1 font-heading text-[9px] font-semibold uppercase tracking-wide text-muted-foreground"
                title="Score congelado al completar la conversación"
              >
                snapshot
              </span>
            </>
          )}
          {isPending && minutes_waiting != null && (
            <span className="ml-auto font-mono text-[10px] font-semibold text-amber">
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

        {/* Last user message — scannable context */}
        {last_user_message && (
          <div className="mt-2 flex min-w-0 items-start gap-1.5">
            {!isSeen && (
              <span
                className="mt-1 h-1.5 w-1.5 flex-none rounded-full bg-amber"
                aria-label="Mensaje nuevo sin ver"
                title="No visto"
              />
            )}
            <p className="line-clamp-2 min-w-0 flex-1 break-words text-[11px] leading-snug text-foreground/80">
              {last_user_message}
            </p>
          </div>
        )}

        {/* AI summary — first line only as preview */}
        {ai_summary && (
          <p className="mt-1.5 line-clamp-1 break-words text-[10px] italic text-muted-foreground">
            {ai_summary}
          </p>
        )}

        {/* Action button — h-7 = 28px, large enough on touch without dominating the card */}
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
                className="h-7 flex-1 rounded-lg px-2 font-heading text-[11px] font-semibold"
              >
                {isMutating ? (
                  <Loader2 className="h-3 w-3 animate-spin" aria-label="Procesando" />
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
                className="h-7 flex-1 rounded-lg px-2 font-heading text-[11px] font-semibold"
              >
                {isMutating ? (
                  <Loader2 className="h-3 w-3 animate-spin" aria-label="Procesando" />
                ) : (
                  "Devolver"
                )}
              </Button>
            )}
          </div>
        )}
      </div>
      </button>
      {/* Drag handle — 24x24 hit target (WCAG 2.2 AA), opacity transition keeps it discreet */}
      <button
        type="button"
        {...listeners}
        {...attributes}
        aria-label="Arrastrar conversación entre columnas"
        style={{ touchAction: "none" }}
        className={cn(
          "absolute right-1 top-1 z-10 flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground/50",
          "cursor-grab active:cursor-grabbing",
          "opacity-0 transition-[opacity,background-color,color] duration-150 ease-out",
          "hover:bg-muted/60 hover:text-foreground",
          "focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
          "group-hover/card:opacity-100",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// Memoized: with a 5s SWR poll and many cards in view, unchanged cards must skip re-render.
// Equality fast-paths on the shallow conversation reference and primitives.
export const InboxConversationCard = React.memo(
  InboxConversationCardImpl,
  (prev, next) =>
    prev.conversation === next.conversation &&
    prev.isActive === next.isActive &&
    prev.isMutating === next.isMutating &&
    prev.agentId === next.agentId &&
    prev.onSelect === next.onSelect &&
    prev.onTakeover === next.onTakeover &&
    prev.onRelease === next.onRelease &&
    prev.onMarkViewed === next.onMarkViewed,
);
