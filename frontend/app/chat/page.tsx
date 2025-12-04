"use client";

import React from "react";
import { ChatWindow } from "@/features/chat/components/ChatWindow";
import { API_URL } from "../lib/config";
import type { Message as HookMessage } from "@/types/chat";
import { logger } from "../lib/logger";

export default function ChatPage() {
  const [conversationId, setConversationId] = React.useState<string | null>(
    null,
  );
  const [initialMessages, setInitialMessages] = React.useState<
    HookMessage[] | null
  >(null);

  React.useEffect(() => {
    try {
      const key = "conversation_id";
      const existing =
        typeof window !== "undefined" ? window.localStorage.getItem(key) : null;
      if (existing && existing.trim()) {
        setConversationId(existing);
        logger.log("conversation_id recovered", { conversation_id: existing });
        return;
      }
      const newId = crypto?.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random()}`;
      if (typeof window !== "undefined") {
        window.localStorage.setItem(key, newId);
      }
      setConversationId(newId);
      logger.log("conversation_id generated", { conversation_id: newId });
    } catch (_e) {
      // Fallback silencioso si localStorage no está disponible
      const newId = crypto?.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random()}`;
      setConversationId(newId);
      logger.log("conversation_id fallback", { conversation_id: newId });
    }
  }, []);

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
          ? data.map((m: any, idx: number) => ({
              id: `${conversationId}-${idx}-${m.timestamp ?? Date.now()}`,
              content: String(m?.content ?? ""),
              role: (m?.role ?? "assistant") as HookMessage["role"],
              createdAt: m?.timestamp ? new Date(m.timestamp) : undefined,
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
    <div className="h-screen w-screen">
      {conversationId && (
        <ChatWindow
          titleText="Chatbot"
          key={conversationId}
          conversationId={conversationId}
          initialMessages={initialMessages || undefined}
          onNewChat={() => {
            const key = "conversation_id";
            const newId = crypto?.randomUUID
              ? crypto.randomUUID()
              : `${Date.now()}-${Math.random()}`;
            if (typeof window !== "undefined") {
              window.localStorage.setItem(key, newId);
            }
            setConversationId(newId);
            setInitialMessages([]);
          }}
        />
      )}
    </div>
  );
}
