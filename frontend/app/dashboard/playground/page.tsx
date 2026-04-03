"use client";

import React from "react";
import { ChatWindow } from "@/features/chat/components/ChatWindow";
import { DebugInspector } from "@/app/components/DebugInspector";
import type { Message as HookMessage } from "@/types/chat";
import { API_URL } from "@/app/lib/config";
import { Switch } from "@/app/components/ui/switch";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import {
  FlaskConical,
  MessageSquareText,
  Radar,
  RotateCcw,
} from "lucide-react";

const PLAYGROUND_STORAGE_KEY = "playground_conversation_id";

export default function PlaygroundPage() {
  const [conversationId, setConversationId] = React.useState<string | null>(null);
  const [initialMessages, setInitialMessages] = React.useState<
    HookMessage[] | null
  >(null);
  const [debugData, setDebugData] = React.useState<any | null>(null);
  const [enableVerification, setEnableVerification] = React.useState(false);

  React.useEffect(() => {
    try {
      const existing =
        typeof window !== "undefined"
          ? window.localStorage.getItem(PLAYGROUND_STORAGE_KEY)
          : null;
      if (existing && existing.trim()) {
        setConversationId(existing);
        return;
      }

      const newId = crypto?.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random()}`;

      if (typeof window !== "undefined") {
        window.localStorage.setItem(PLAYGROUND_STORAGE_KEY, newId);
      }

      setConversationId(newId);
    } catch {
      const newId = crypto?.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random()}`;
      setConversationId(newId);
    }
  }, []);

  React.useEffect(() => {
    const loadHistory = async () => {
      if (!conversationId) return;

      try {
        const response = await fetch(`${API_URL}/chat/history/${conversationId}`, {
          method: "GET",
          headers: { Accept: "application/json" },
          credentials: "include",
        });

        if (!response.ok) {
          setInitialMessages([]);
          return;
        }

        const data = await response.json();
        const normalized: HookMessage[] = Array.isArray(data)
          ? data.map((message: any, index: number) => ({
              id: `${conversationId}-${index}-${message.timestamp ?? Date.now()}`,
              content: String(message?.content ?? ""),
              role: (message?.role ?? "assistant") as HookMessage["role"],
              createdAt: message?.timestamp
                ? new Date(message.timestamp)
                : undefined,
            }))
          : [];

        setInitialMessages(normalized);
      } catch {
        setInitialMessages([]);
      }
    };

    loadHistory();
  }, [conversationId]);

  const resetConversation = React.useCallback(() => {
    const newId = crypto?.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random()}`;

    if (typeof window !== "undefined") {
      window.localStorage.setItem(PLAYGROUND_STORAGE_KEY, newId);
    }

    setConversationId(newId);
    setInitialMessages([]);
    setDebugData(null);
  }, []);

  return (
    <div className="flex h-[calc(100vh-4rem)] min-h-[680px] flex-col gap-3">
      <section className="rounded-[26px] border border-border/60 bg-card px-5 py-4 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_18px_48px_rgba(15,23,42,0.08)]">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant="secondary"
                className="rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em]"
              >
                Playground
              </Badge>
              <Badge
                variant="outline"
                className="rounded-full px-2.5 py-1 text-[10px] font-medium"
              >
                Mismo flujo que /chat
              </Badge>
            </div>
            <div>
              <h1 className="text-[1.65rem] font-semibold tracking-tight text-foreground">
                Debug Chat Playground
              </h1>
              <p className="m-0 max-w-2xl text-sm text-muted-foreground">
                Chat real a la izquierda. Inspección RAG útil a la derecha.
              </p>
            </div>
          </div>
          <div className="flex flex-col gap-2 md:flex-row md:items-center">
            <div className="flex items-center gap-3 rounded-2xl border border-border/60 bg-surface px-3.5 py-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Radar className="h-4.5 w-4.5" />
              </div>
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Auditoria
                </div>
                <div className="mt-0.5 text-sm font-medium text-foreground">
                  Verificación activa
                </div>
              </div>
              <Switch
                checked={enableVerification}
                onCheckedChange={(value) => setEnableVerification(Boolean(value))}
              />
            </div>
            <div className="flex items-center gap-2 rounded-2xl border border-border/60 bg-surface px-3 py-2.5">
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Sesion
              </span>
              <span className="font-mono text-[11px] text-foreground/70">
                {conversationId ? `${conversationId.slice(0, 8)}...` : "Generando"}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-xl text-muted-foreground"
                onClick={resetConversation}
                aria-label="Reiniciar sesion"
                title="Reiniciar sesion"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>
      </section>
      <div className="grid min-h-0 flex-1 gap-3 xl:grid-cols-[minmax(460px,1fr)_minmax(520px,0.98fr)]">
        <section className="min-h-0 rounded-[26px] border border-border/60 bg-card p-3 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_18px_48px_rgba(15,23,42,0.08)]">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3 px-1">
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <MessageSquareText className="h-4.5 w-4.5" />
              </div>
              <div>
                <div className="text-sm font-semibold text-foreground">
                  Chat de prueba
                </div>
                <div className="text-xs text-muted-foreground">
                  Misma experiencia base del canal `/chat`
                </div>
              </div>
            </div>
            <Badge
              variant="outline"
              className="rounded-full px-2.5 py-1 text-[10px] font-medium"
            >
              Debug live
            </Badge>
          </div>
          <div className="h-[calc(100%-4rem)] min-h-0">
            {conversationId && (
              <ChatWindow
                titleText="Playground"
                key={conversationId}
                conversationId={conversationId}
                initialMessages={initialMessages || undefined}
                forceDebug
                enableVerification={enableVerification}
                onDebugData={(data) => setDebugData(data)}
                onNewChat={resetConversation}
                variant="playground"
              />
            )}
          </div>
        </section>
        <section className="min-h-0 rounded-[26px] border border-border/60 bg-card p-3 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_18px_48px_rgba(15,23,42,0.08)]">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3 px-1">
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600">
                <FlaskConical className="h-4.5 w-4.5" />
              </div>
              <div>
                <div className="text-sm font-semibold text-foreground">
                  Monitor RAG
                </div>
                <div className="text-xs text-muted-foreground">
                  Latencia, fuentes, prompt y verificacion en el mismo contexto
                </div>
              </div>
            </div>
          </div>
          <div className="h-[calc(100%-4rem)] min-h-0 overflow-hidden rounded-[22px] border border-border/50 bg-surface/70">
            <DebugInspector data={debugData} />
          </div>
        </section>
      </div>
    </div>
  );
}
