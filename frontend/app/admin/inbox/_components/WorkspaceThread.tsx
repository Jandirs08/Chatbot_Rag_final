"use client";

import React from "react";
import { Button } from "@/app/components/ui/button";
import { Skeleton } from "@/app/components/ui/skeleton";
import { ScrollArea } from "@/app/components/ui/scroll-area";
import { AutoResizeTextarea } from "@/app/components/ui/AutoResizeTextarea";
import { cn } from "@/lib/utils";
import { CheckCircle2, Loader2, Send } from "lucide-react";
import {
  ChatMessageBubble,
  Message as BubbleMessage,
} from "@/app/components/chat/ChatMessageBubble";
import type { HistoryItem } from "./utils";

// ─── Message bubble (local presentational component) ─────────────────────────

function MessageBubble({ msg, idx }: { msg: HistoryItem; idx: number }) {
  const isUser = msg.role === "user";
  const stableKey = msg.timestamp
    ? `${msg.role}-${msg.timestamp}-${idx}`
    : `${msg.role}-${idx}-${(msg.content ?? "").slice(0, 16)}`;
  const bubbleRole = (
    msg.role === "agent" ? "assistant" : msg.role
  ) as BubbleMessage["role"];
  const bubbleData: BubbleMessage = {
    id: stableKey,
    role: bubbleRole,
    content: msg.role === "agent" ? `[Agente] ${msg.content}` : msg.content,
    createdAt: msg.timestamp ? new Date(msg.timestamp) : undefined,
  };
  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div className={cn("max-w-[85%]", isUser ? "items-end" : "items-start")}>
        <ChatMessageBubble
          message={bubbleData}
          isMostRecent={false}
          messageCompleted={true}
          botName="Asistente IA"
        />
      </div>
    </div>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface WorkspaceThreadProps {
  messages: HistoryItem[];
  loadingHistory: boolean;
  scrollRootRef: React.RefObject<HTMLDivElement | null>;
  isCompleted: boolean;
  canReply: boolean;
  isHuman: boolean;
  isAssignedToMe: boolean;
  draft: string;
  onDraftChange: (v: string) => void;
  onKeyDown: React.KeyboardEventHandler<HTMLTextAreaElement>;
  onSend: () => void;
  sending: boolean;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function WorkspaceThread({
  messages,
  loadingHistory,
  scrollRootRef,
  isCompleted,
  canReply,
  isHuman,
  isAssignedToMe,
  draft,
  onDraftChange,
  onKeyDown,
  onSend,
  sending,
  textareaRef,
}: WorkspaceThreadProps) {
  return (
    <main
      aria-label="Conversación"
      className="flex min-h-0 flex-1 flex-col"
    >
      <div className="flex flex-none items-center justify-between border-b border-border/40 px-5 py-2">
        <span className="font-heading text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Conversación
        </span>
        {messages.length > 0 && (
          <span className="font-mono text-[10px] text-muted-foreground/70">
            {messages.length} mensaje{messages.length === 1 ? "" : "s"}
          </span>
        )}
      </div>

      <ScrollArea ref={scrollRootRef} className="flex-1">
        <div className="mx-auto max-w-[820px] px-5 py-4">
          {loadingHistory && messages.length === 0 ? (
            <div className="space-y-3 opacity-60">
              <div className="flex justify-end">
                <Skeleton className="h-10 w-48 rounded-2xl" />
              </div>
              <div className="flex justify-start">
                <Skeleton className="h-16 w-64 rounded-2xl" />
              </div>
              <div className="flex justify-end">
                <Skeleton className="h-8 w-36 rounded-2xl" />
              </div>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex min-h-[160px] items-center justify-center rounded-xl border border-dashed border-border/60 text-center">
              <p className="text-[12px] text-muted-foreground/60">
                Sin mensajes visibles
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {messages.map((msg, idx) => {
                const key = msg.timestamp
                  ? `${msg.role}-${msg.timestamp}-${idx}`
                  : `${msg.role}-${idx}-${(msg.content ?? "").slice(0, 16)}`;
                return <MessageBubble key={key} msg={msg} idx={idx} />;
              })}
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Composer */}
      {isCompleted ? (
        <div className="flex-none border-t border-border/60 bg-primary/[0.06] px-5 py-3">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-card px-3 py-1 text-[11px] font-medium text-primary">
            <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
            Conversación completada · Reabre para responder
          </span>
        </div>
      ) : canReply ? (
        <div className="flex-none border-t border-border/60 bg-card/95 px-4 py-3">
          <div className="mx-auto flex max-w-[820px] items-end gap-2 rounded-xl border border-border/60 bg-background px-3 py-2 transition-colors duration-150 focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/20">
            <AutoResizeTextarea
              ref={textareaRef}
              minRows={1}
              maxRows={5}
              value={draft}
              onChange={(e) => onDraftChange(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Escribe un mensaje… (Enter envía, Shift+Enter salto)"
              className="flex-1 text-[13px] leading-relaxed text-foreground placeholder:text-muted-foreground/50"
              aria-label="Mensaje al cliente"
            />
            <Button
              size="icon"
              disabled={!draft.trim() || sending}
              onClick={onSend}
              className="h-8 w-8 flex-none rounded-lg transition-transform duration-150 ease-out active:scale-95"
              aria-label="Enviar mensaje"
            >
              {sending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex-none border-t border-border/60 bg-card/95 px-5 py-3">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-muted/30 px-3 py-1 text-[11px] font-medium text-muted-foreground">
            {isHuman && !isAssignedToMe
              ? "Asignado a otro agente"
              : "Solo lectura — toma la conversación para responder"}
          </span>
        </div>
      )}
    </main>
  );
}
