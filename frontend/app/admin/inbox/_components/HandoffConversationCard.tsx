"use client";

import React from "react";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import { cn } from "@/lib/utils";
import { Loader2, MessageSquare, Phone, UserCircle2 } from "lucide-react";
import { colorFromId, fmtDate, humanizeId, previewClampClass } from "./utils";

export type HandoffMode = "bot" | "pending" | "human" | "paused";

export type HandoffConversation = {
  conversation_id: string;
  channel: string;
  external_id: string;
  mode: HandoffMode;
  category?: string | null;
  urgency?: string | null;
  ai_summary?: string | null;
  assigned_agent_id?: string | null;
  pending_since?: string | null;
  minutes_waiting?: number | null;
  updated_at?: string | null;
};

interface HandoffConversationCardProps {
  conversation: HandoffConversation;
  isActive: boolean;
  isMutating: boolean;
  agentId: string;
  onSelect: (id: string) => void;
  onTakeover: (id: string) => void;
  onRelease: (id: string) => void;
}

const modeBadge: Record<HandoffMode, { label: string; className: string }> = {
  bot: { label: "Bot", className: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-400" },
  pending: { label: "Pendiente", className: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-400" },
  human: { label: "Humano", className: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-400" },
  paused: { label: "Pausado", className: "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-400" },
};

const urgencyDot: Record<string, string> = {
  alta: "bg-red-500",
  media: "bg-amber-400",
  baja: "bg-emerald-400",
};

const categoryLabel: Record<string, string> = {
  oportunidad: "Oportunidad",
  interes: "Interés",
  requiere_atencion: "Requiere atención",
};

const ChannelIcon = ({ channel }: { channel: string }) =>
  channel === "whatsapp" ? (
    <Phone className="h-3 w-3" />
  ) : (
    <MessageSquare className="h-3 w-3" />
  );

export function HandoffConversationCard({
  conversation,
  isActive,
  isMutating,
  agentId,
  onSelect,
  onTakeover,
  onRelease,
}: HandoffConversationCardProps) {
  const badge = modeBadge[conversation.mode] ?? modeBadge.bot;
  const isAssignedToMe = conversation.assigned_agent_id === agentId;
  const isPending = conversation.mode === "pending";
  const isHuman = conversation.mode === "human";

  return (
    <button
      type="button"
      onClick={() => onSelect(conversation.conversation_id)}
      className={cn(
        "group relative w-full rounded-2xl border text-left transition-all duration-150",
        isMutating && "opacity-60 pointer-events-none",
        isActive
          ? "border-primary/20 bg-primary/10 shadow-sm"
          : "border-transparent bg-background hover:border-border/70 hover:bg-muted/60",
      )}
    >
      <div className="px-4 py-3">
        <div className="flex items-start gap-3">
          <div
            className="flex h-11 w-11 flex-none items-center justify-center rounded-2xl border border-white/50 text-slate-700 shadow-sm"
            style={{ backgroundColor: colorFromId(conversation.conversation_id) }}
          >
            <UserCircle2 className="h-5 w-5 opacity-80" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <span
                  className={cn(
                    "block truncate text-sm font-semibold",
                    isActive ? "text-primary" : "text-foreground",
                  )}
                >
                  {humanizeId(conversation.conversation_id)}
                </span>
                <span className="block truncate font-mono text-[11px] text-muted-foreground/70">
                  {conversation.conversation_id.slice(0, 10)}...
                </span>
              </div>
              <span className="ml-2 whitespace-nowrap text-[11px] font-medium text-muted-foreground">
                {fmtDate(conversation.updated_at ?? conversation.pending_since ?? undefined)}
              </span>
            </div>

            {conversation.ai_summary ? (
              <p className={cn("text-[13px] leading-5 text-muted-foreground", previewClampClass)}>
                {conversation.ai_summary}
              </p>
            ) : (
              <p className="text-[13px] italic text-muted-foreground/60">Sin clasificar</p>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                  badge.className,
                )}
              >
                {badge.label}
              </span>

              {conversation.urgency && (
                <span className="inline-flex items-center gap-1 rounded-full border border-border/50 bg-muted/60 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                  <span className={cn("h-1.5 w-1.5 rounded-full", urgencyDot[conversation.urgency] ?? "bg-slate-400")} />
                  {conversation.urgency}
                </span>
              )}

              {conversation.category && (
                <Badge variant="secondary" className="h-5 rounded-full px-2 text-[10px] font-medium">
                  {categoryLabel[conversation.category] ?? conversation.category}
                </Badge>
              )}

              {isPending && conversation.minutes_waiting != null && (
                <span className="text-[11px] text-amber-600 dark:text-amber-400 font-medium">
                  {conversation.minutes_waiting}min esperando
                </span>
              )}

              <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground/70">
                <ChannelIcon channel={conversation.channel} />
                {conversation.channel}
              </span>
            </div>

            <div className="mt-2 flex items-center gap-2">
              {isPending && (
                <Button
                  variant="default"
                  size="sm"
                  disabled={isMutating}
                  onClick={(e) => {
                    e.stopPropagation();
                    onTakeover(conversation.conversation_id);
                  }}
                  className="h-7 rounded-lg px-3 text-xs"
                >
                  {isMutating ? <Loader2 className="h-3 w-3 animate-spin" /> : "Tomar"}
                </Button>
              )}
              {isHuman && isAssignedToMe && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isMutating}
                  onClick={(e) => {
                    e.stopPropagation();
                    onRelease(conversation.conversation_id);
                  }}
                  className="h-7 rounded-lg px-3 text-xs"
                >
                  {isMutating ? <Loader2 className="h-3 w-3 animate-spin" /> : "Devolver al bot"}
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </button>
  );
}
