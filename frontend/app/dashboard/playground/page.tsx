"use client";

import React from "react";
import { ChatWindow } from "@/app/components/ChatWindow";
import { DebugInspector } from "@/app/components/DebugInspector";
import type { Message as HookMessage } from "@/app/hooks/useChatStream";
import { apiBaseUrl } from "@/app/utils/constants";

export default function PlaygroundPage() {
  const [conversationId, setConversationId] = React.useState<string | null>(null);
  const [initialMessages, setInitialMessages] = React.useState<HookMessage[] | null>(null);
  const [debugData, setDebugData] = React.useState<any | null>(null);

  React.useEffect(() => {
    try {
      const key = "playground_conversation_id";
      const existing = typeof window !== "undefined" ? window.localStorage.getItem(key) : null;
      if (existing && existing.trim()) {
        setConversationId(existing);
        return;
      }
      const newId = crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
      if (typeof window !== "undefined") {
        window.localStorage.setItem(key, newId);
      }
      setConversationId(newId);
    } catch {
      const newId = crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
      setConversationId(newId);
    }
  }, []);

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
      } catch {
        setInitialMessages([]);
      }
    };
    loadHistory();
  }, [conversationId]);

  return (
    <div className="h-screen w-screen grid grid-cols-[2fr_3fr]">
      <div className="border-r border-slate-200 dark:border-slate-800">
        {conversationId && (
          <ChatWindow
            titleText="Playground"
            conversationId={conversationId}
            initialMessages={initialMessages || undefined}
            forceDebug
            onDebugData={(d) => setDebugData(d)}
          />
        )}
      </div>
      <div>
        <DebugInspector data={debugData} />
      </div>
    </div>
  );
}

