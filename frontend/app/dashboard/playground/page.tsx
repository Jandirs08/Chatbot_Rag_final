"use client";

import React from "react";
import { ChatWindow } from "@/features/chat/components/ChatWindow";
import { DebugInspector } from "@/app/components/DebugInspector";
import type { Message as HookMessage } from "@/types/chat";
import { API_URL } from "@/app/lib/config";
import { Switch } from "@/app/components/ui/switch";
import { Badge } from "@/app/components/ui/badge";

export default function PlaygroundPage() {
  const [conversationId, setConversationId] = React.useState<string | null>(null);
  const [initialMessages, setInitialMessages] = React.useState<HookMessage[] | null>(null);
  const [debugData, setDebugData] = React.useState<any | null>(null);
  const [enableVerification, setEnableVerification] = React.useState<boolean>(false);

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
        const resp = await fetch(`${API_URL}/chat/history/${conversationId}`, {
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
    <div className="flex flex-col lg:flex-row h-full w-full overflow-y-auto lg:overflow-hidden bg-slate-50">
      <div className="lg:h-full lg:basis-2/5 flex flex-col border-b lg:border-b-0 lg:border-r border-slate-200 bg-white">
        <div className="flex items-center justify-between bg-card border rounded-lg p-3 mb-4 shadow-sm">
          <div className="text-sm font-semibold">🛡️ Modo Auditoría IA</div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[10px]">Detecta alucinaciones</Badge>
            <Switch checked={enableVerification} onCheckedChange={(v)=> setEnableVerification(Boolean(v))} />
          </div>
        </div>
        {conversationId && (
          <ChatWindow
            titleText="Playground"
            key={conversationId}
            conversationId={conversationId}
            initialMessages={initialMessages || undefined}
            forceDebug
            enableVerification={enableVerification}
            onDebugData={(d) => setDebugData(d)}
            onNewChat={() => {
              const key = "playground_conversation_id";
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
      <div className="lg:h-full lg:basis-3/5 min-h-0 flex flex-col p-6 bg-background border-l border-border dark:bg-slate-900 dark:border-slate-800">
        <DebugInspector data={debugData} />
      </div>
    </div>
  );
}

