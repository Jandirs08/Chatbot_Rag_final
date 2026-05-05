"use client";

import React, { useEffect, useRef } from "react";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import { Skeleton } from "@/app/components/ui/skeleton";
import {
  ChatMessageBubble,
  Message as BubbleMessage,
} from "@/app/components/chat/ChatMessageBubble";
import { cn } from "@/lib/utils";
import { ChevronLeft, Copy, MessageSquare } from "lucide-react";
import {
  type ConversationItem,
  type HistoryItem,
  colorFromId,
  fmtConversationMeta,
  getMessageKey,
  humanizeId,
} from "./utils";

interface ChatDetailProps {
  chatId: string | null;
  selectedConversation?: ConversationItem;
  messages: HistoryItem[];
  loading: boolean;
  onClearSelection: () => void;
}

export function ChatDetail({
  chatId,
  selectedConversation,
  messages,
  loading,
  onClearSelection,
}: ChatDetailProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (scrollRef.current) {
      setTimeout(() => {
        const el = scrollRef.current!;
        el.scrollTop = el.scrollHeight;
      }, 100);
    }
  }, [messages, chatId]);

  if (!chatId) {
    return (
      <div className="hidden md:flex flex-1 flex-col items-center justify-center px-6 text-center text-muted-foreground/60">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-border/60 bg-muted/40">
          <MessageSquare className="w-5 h-5" />
        </div>
        <p className="text-[13px] font-medium">Selecciona una conversación</p>
        <p className="mt-2 max-w-sm text-sm text-muted-foreground">
          La lista mantiene contexto y estados; el detalle aparece aquí sin
          competir con el resto de la interfaz.
        </p>
      </div>
    );
  }

  return (
    <>
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
            className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/60 text-sm font-semibold text-foreground shadow-sm"
            style={{ backgroundColor: colorFromId(chatId) }}
          >
            VT
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-foreground">
              {humanizeId(chatId)}
              <Badge
                variant="secondary"
                className="h-5 rounded-full px-2 text-[10px] font-medium"
              >
                {selectedConversation?.total_messages ?? messages.length} mensajes
              </Badge>
              <span className="rounded-md bg-muted px-2 py-0.5 text-[10px] font-mono text-muted-foreground">
                {chatId.slice(0, 8)}...
              </span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-success animate-pulse" />
                En vivo
              </span>
              {selectedConversation?.updated_at && (
                <span>
                  Actualizado {fmtConversationMeta(selectedConversation.updated_at)}
                </span>
              )}
            </div>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-9 rounded-xl border-border/60 px-3"
          onClick={() => navigator.clipboard.writeText(chatId)}
        >
          <Copy className="mr-2 h-4 w-4" />
          Copiar ID
        </Button>
      </div>

      <div
        className="flex-1 overflow-y-auto bg-surface px-4 py-5 md:px-6"
        ref={scrollRef}
      >
        {loading && messages.length === 0 ? (
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
            {messages.map((m, idx) => {
              const isUser = m.role === "user";
              const stableKey = getMessageKey(m, idx);
              const bubbleRole = (m.role === "agent" ? "assistant" : m.role) as BubbleMessage["role"];
              const bubbleData: BubbleMessage = {
                id: stableKey,
                role: bubbleRole,
                content: m.role === "agent" ? `[Agente] ${m.content}` : m.content,
                createdAt: m.timestamp ? new Date(m.timestamp) : undefined,
              };

              return (
                <div
                  key={stableKey}
                  className={cn(
                    "flex",
                    isUser ? "justify-end" : "justify-start",
                  )}
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
            })}
          </div>
        )}
      </div>

      <div className="border-t border-border/60 bg-card/90 px-5 py-3">
        <div className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-muted/40 px-3 py-1.5 text-[11px] font-medium text-muted-foreground">
          Solo lectura
        </div>
      </div>
    </>
  );
}
