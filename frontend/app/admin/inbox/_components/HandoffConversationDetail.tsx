"use client";

import React, { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import { Skeleton } from "@/app/components/ui/skeleton";
import {
  ChatMessageBubble,
  Message as BubbleMessage,
} from "@/app/components/chat/ChatMessageBubble";
import { cn } from "@/lib/utils";
import { Bot, ChevronLeft, Copy, Loader2, Send } from "lucide-react";
import { API_URL } from "@/app/lib/config";
import { authenticatedJsonFetcher } from "@/app/lib/services/authService";
import * as inboxService from "@/app/lib/services/inboxService";
import {
  type HistoryItem,
  colorFromId,
  fmtConversationMeta,
  humanizeId,
} from "./utils";
import type { HandoffConversation } from "./HandoffConversationCard";

interface HandoffConversationDetailProps {
  conversation: HandoffConversation | null;
  agentId: string;
  lastReleased: string | null;
  onClearSelection: () => void;
}

function MessageBubble({ msg, idx }: { msg: HistoryItem; idx: number }) {
  const isUser = msg.role === "user";
  const stableKey = msg.timestamp
    ? `${msg.role}-${msg.timestamp}-${idx}`
    : `${msg.role}-${idx}-${(msg.content ?? "").slice(0, 16)}`;

  // "agent" role renders as assistant bubble (left-aligned)
  const bubbleRole = (msg.role === "agent" ? "assistant" : msg.role) as BubbleMessage["role"];

  const bubbleData: BubbleMessage = {
    id: stableKey,
    role: bubbleRole,
    content: msg.role === "agent" ? `[Agente] ${msg.content}` : msg.content,
    createdAt: msg.timestamp ? new Date(msg.timestamp) : undefined,
  };

  return (
    <div
      key={stableKey}
      className={cn("flex", isUser ? "justify-end" : "justify-start")}
    >
      <div
        className={cn(
          "max-w-[85%] md:max-w-[70%]",
          isUser ? "items-end" : "items-start",
        )}
      >
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

export function HandoffConversationDetail({
  conversation,
  agentId,
  lastReleased,
  onClearSelection,
}: HandoffConversationDetailProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  // SWR for messages — Fix 1: destructure mutate
  const {
    data: messages = [] as HistoryItem[],
    isLoading: loadingHistory,
    mutate: mutateMessages,
  } = useSWR<HistoryItem[]>(
    conversation
      ? `${API_URL}/chat/history/${conversation.conversation_id}`
      : null,
    authenticatedJsonFetcher,
    { refreshInterval: 5000, revalidateOnFocus: false },
  );

  useEffect(() => {
    if (scrollRef.current) {
      setTimeout(() => {
        const el = scrollRef.current!;
        el.scrollTop = el.scrollHeight;
      }, 100);
    }
  }, [messages, conversation?.conversation_id]);

  // Fix 1, 2: guard + mutate after send
  const handleSend = async () => {
    if (!agentId || !draft.trim() || sending) return;
    if (!conversation) return;
    setSending(true);
    try {
      await inboxService.sendAgentMessage(conversation.conversation_id, draft.trim());
      setDraft("");
      await mutateMessages();
      textareaRef.current?.focus();
    } catch {
      // send failure — keep draft so agent can retry
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  // Empty state: after release
  if (!conversation && lastReleased) {
    return (
      <div className="hidden md:flex flex-1 flex-col items-center justify-center px-6 text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-emerald-200 bg-emerald-50 text-emerald-600 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-400">
          <Bot className="h-5 w-5" />
        </div>
        <p className="text-[13px] font-medium text-foreground/80">
          Conversación devuelta al bot
        </p>
        <p className="mt-2 max-w-xs text-sm text-muted-foreground">
          El bot retomará la conversación con el contexto completo.
        </p>
      </div>
    );
  }

  // Empty state: generic
  if (!conversation) {
    return (
      <div className="hidden md:flex flex-1 flex-col items-center justify-center px-6 text-center text-muted-foreground/60">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-border/60 bg-muted/40">
          <Bot className="w-5 h-5" />
        </div>
        <p className="text-[13px] font-medium">Selecciona una conversación</p>
        <p className="mt-2 max-w-sm text-sm text-muted-foreground">
          Toma una conversación pendiente o selecciona una activa para responder.
        </p>
      </div>
    );
  }

  const isHuman = conversation.mode === "human";
  const isAssignedToMe = conversation.assigned_agent_id === agentId;
  const canReply = isHuman && isAssignedToMe;

  return (
    <>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/60 bg-card/95 px-5 py-4 supports-[backdrop-filter]:bg-card/85">
        <div className="flex min-w-0 items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden h-9 w-9 rounded-xl"
            onClick={onClearSelection}
            aria-label="Volver"
          >
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <div
            className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/60 text-sm font-semibold text-slate-700 shadow-sm"
            style={{ backgroundColor: colorFromId(conversation.conversation_id) }}
          >
            VT
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-foreground">
              {humanizeId(conversation.conversation_id)}
              <Badge
                variant="secondary"
                className="h-5 rounded-full px-2 text-[10px] font-medium"
              >
                {messages.length} mensajes
              </Badge>
              <span className="rounded-md bg-muted px-2 py-0.5 text-[10px] font-mono text-muted-foreground">
                {conversation.conversation_id.slice(0, 8)}…
              </span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                En vivo
              </span>
              {conversation.updated_at && (
                <span>Actualizado {fmtConversationMeta(conversation.updated_at)}</span>
              )}
            </div>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-9 rounded-xl border-border/60 px-3"
          onClick={() => navigator.clipboard.writeText(conversation.conversation_id)}
        >
          <Copy className="mr-2 h-4 w-4" />
          Copiar ID
        </Button>
      </div>

      {/* Messages */}
      <div
        className="flex-1 overflow-y-auto bg-surface px-4 py-5 md:px-6"
        ref={scrollRef}
      >
        {loadingHistory && messages.length === 0 ? (
          <div className="mx-auto max-w-4xl space-y-6 opacity-60">
            <div className="flex justify-end">
              <Skeleton className="h-12 w-[min(70%,420px)] rounded-2xl rounded-tr-none" />
            </div>
            <div className="flex justify-start">
              <Skeleton className="h-20 w-[min(78%,520px)] rounded-2xl rounded-tl-none" />
            </div>
            <div className="flex justify-end">
              <Skeleton className="h-10 w-[min(52%,320px)] rounded-2xl rounded-tr-none" />
            </div>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full min-h-[260px] flex-col items-center justify-center rounded-2xl border border-dashed border-border/70 bg-background px-6 text-center">
            Esta conversación no tiene mensajes visibles.
          </div>
        ) : (
          <div className="mx-auto max-w-4xl space-y-5">
            {/* Fix 6: stable keys */}
            {messages.map((msg, idx) => {
              const stableKey = msg.timestamp
                ? `${msg.role}-${msg.timestamp}-${idx}`
                : `${msg.role}-${idx}-${(msg.content ?? "").slice(0, 16)}`;
              return <MessageBubble key={stableKey} msg={msg} idx={idx} />;
            })}
          </div>
        )}
      </div>

      {/* Composer or read-only footer */}
      {canReply ? (
        <div className="border-t border-border/60 bg-card/90 px-5 py-3">
          <div className="flex items-end gap-2">
            <textarea
              ref={textareaRef}
              rows={2}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Escribe un mensaje… (Enter envía, Shift+Enter nueva línea)"
              className="flex-1 resize-none rounded-xl border border-border/60 bg-background px-3 py-2 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <Button
              size="icon"
              disabled={!draft.trim() || sending}
              onClick={() => void handleSend()}
              className="h-9 w-9 rounded-xl flex-none"
            >
              {sending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      ) : (
        <div className="border-t border-border/60 bg-card/90 px-5 py-3">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-muted/40 px-3 py-1.5 text-[11px] font-medium text-muted-foreground">
            {isHuman && !isAssignedToMe
              ? "Asignado a otro agente"
              : "Solo lectura — toma la conversación para responder"}
          </div>
        </div>
      )}
    </>
  );
}
