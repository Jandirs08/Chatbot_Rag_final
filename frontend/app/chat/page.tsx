"use client";

import React from "react";
import { ChatWindow } from "@/app/components/chat/ChatWindow";
import { API_URL } from "../lib/config";
import type { Message as HookMessage } from "@/types/chat";
import { logger } from "../lib/logger";
import { useConversationId } from "../hooks/useConversationId";

export default function ChatPage() {
  const [conversationId, resetConversationId] = useConversationId("conversation_id");
  const [initialMessages, setInitialMessages] = React.useState<
    HookMessage[] | null
  >(null);

  // Cargar historial inicial cuando tengamos conversationId
  React.useEffect(() => {
    const loadHistory = async () => {
      if (!conversationId) return;
      try {
        const resp = await fetch(
          `${API_URL}/chat/history/${conversationId}`,
          {
            method: "GET",
            headers: { Accept: "application/json" },
            credentials: "include",
          },
        );
        logger.log("history fetch status", { status: resp.status, conversation_id: conversationId });
        if (!resp.ok) {
          setInitialMessages([]);
          logger.warn("history fetch failed", { status: resp.status, conversation_id: conversationId });
          return;
        }
        const data = await resp.json();
        const normalized: HookMessage[] = Array.isArray(data)
          ? data.map((m: { message_id?: unknown; content?: unknown; role?: unknown; timestamp?: unknown }, idx: number) => ({
              id: typeof m?.message_id === "string"
                ? m.message_id
                : `${conversationId}-${idx}-${m.timestamp ?? Date.now()}`,
              content: String(m?.content ?? ""),
              role: (m?.role ?? "assistant") as HookMessage["role"],
              createdAt: m?.timestamp ? new Date(m.timestamp as string) : undefined,
            }))
          : [];
        logger.log("history length", { length: normalized.length, conversation_id: conversationId });
        setInitialMessages(normalized);
      } catch (_e) {
        setInitialMessages([]);
        logger.error("history fetch error", { conversation_id: conversationId });
      }
    };
    loadHistory();
  }, [conversationId]);

  return (
    <div className="h-screen w-full overflow-hidden">
      {conversationId && (
        <ChatWindow
          titleText="Chatbot"
          key={conversationId}
          conversationId={conversationId}
          initialMessages={initialMessages || undefined}
          onNewChat={() => {
            resetConversationId();
            setInitialMessages([]);
          }}
        />
      )}
    </div>
  );
}
