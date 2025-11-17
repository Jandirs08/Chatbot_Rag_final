"use client";

import React from "react";
import { ChatWindow } from "../components/ChatWindow";
import { apiBaseUrl } from "../utils/constants";
import type { Message as HookMessage } from "../hooks/useChatStream";

export default function ChatPage() {
  const [conversationId, setConversationId] = React.useState<string | null>(null);
  const [initialMessages, setInitialMessages] = React.useState<HookMessage[] | null>(null);

  React.useEffect(() => {
    try {
      const key = "conversation_id";
      const existing = typeof window !== "undefined" ? window.localStorage.getItem(key) : null;
      if (existing && existing.trim()) {
        setConversationId(existing);
        return;
      }
      const newId = (crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(key, newId);
      }
      setConversationId(newId);
    } catch (_e) {
      // Fallback silencioso si localStorage no está disponible
      const newId = (crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);
      setConversationId(newId);
    }
  }, []);

  // Cargar historial inicial cuando tengamos conversationId
  React.useEffect(() => {
    const loadHistory = async () => {
      if (!conversationId) return;
      try {
        const resp = await fetch(`${apiBaseUrl}/chat/history/${conversationId}`, {
          method: "GET",
          headers: { Accept: "application/json" },
          credentials: "include",
        });
        if (!resp.ok) {
          setInitialMessages([]);
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
        setInitialMessages(normalized);
      } catch (_e) {
        setInitialMessages([]);
      }
    };
    loadHistory();
  }, [conversationId]);
  
  return (
    <div className="h-screen w-screen">
      {conversationId && initialMessages && (
        <ChatWindow titleText="Chatbot" conversationId={conversationId} initialMessages={initialMessages} />
      )}
    </div>
  );
}
