"use client";

import React from "react";
import dynamic from "next/dynamic";
import { PlaygroundChatWindow } from "@/app/components/chat/PlaygroundChatWindow";
import { Switch } from "@/app/components/ui/switch";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import { Skeleton } from "@/app/components/ui/skeleton";
import { useConversationId } from "@/app/hooks/useConversationId";
import { useRequirePermission } from "@/app/hooks/useAuthGuard";
import type { DebugData } from "@/app/components/debug/utils";
import { cn } from "@/app/lib/utils";
import {
  Activity,
  FlaskConical,
  MessageSquareText,
  RotateCcw,
  ShieldCheck,
  ShieldOff,
} from "lucide-react";

const DebugInspector = dynamic(
  () =>
    import("@/app/components/DebugInspector").then((mod) => ({
      default: mod.DebugInspector,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center p-6">
        <Skeleton className="w-full h-full rounded-xl" />
      </div>
    ),
  },
);

const PLAYGROUND_STORAGE_KEY = "playground_conversation_id";

export default function PlaygroundPage() {
  const { isAuthorized, isChecking } = useRequirePermission("view_debug");
  const [conversationId, resetConversationId] = useConversationId(PLAYGROUND_STORAGE_KEY);
  const [debugData, setDebugData] = React.useState<DebugData | null>(null);
  const [enableVerification, setEnableVerification] = React.useState(false);
  const [isStreaming, setIsStreaming] = React.useState(false);

  const resetConversation = React.useCallback(() => {
    resetConversationId();
    setDebugData(null);
  }, [resetConversationId]);

  if (isChecking || !isAuthorized) return null;

  const sessionLabel = conversationId
    ? conversationId.slice(0, 8) + "…"
    : "iniciando";

  const verificationBadgeClass = enableVerification
    ? "bg-primary/10 text-primary border-primary/25"
    : "bg-muted text-muted-foreground border-border";

  return (
    <div className="flex h-[calc(100vh-4rem)] min-h-[680px] flex-col">

      {/* ── Status strip ─────────────────────────────────────────────────── */}
      <div className="flex flex-none items-center gap-0 border-b border-border/60 bg-card/90 px-5 py-2.5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
            <FlaskConical className="h-3.5 w-3.5 text-primary" />
          </div>
          <span className="font-heading text-sm font-semibold tracking-tight text-foreground">
            Playground
          </span>
          <span className="text-label text-muted-foreground hidden sm:inline">
            · Admin only
          </span>
        </div>

        <div className="mx-4 h-4 w-px bg-border/60" />

        <div className="flex items-center gap-2">
          <div
            className={cn(
              "h-1.5 w-1.5 rounded-full transition-colors duration-300",
              isStreaming
                ? "bg-amber motion-safe:animate-status-pulse-fast"
                : "bg-success motion-safe:animate-status-pulse",
            )}
          />
          <span className="text-label text-muted-foreground">Sesión</span>
          <span className="font-data text-xs text-foreground/70">{sessionLabel}</span>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 rounded-md text-muted-foreground hover:text-foreground"
            onClick={resetConversation}
            aria-label="Nueva sesión"
            title="Nueva sesión"
          >
            <RotateCcw className="h-3 w-3" />
          </Button>
        </div>

        <div className="ml-auto flex items-center gap-4">
          <div className="flex items-center gap-2">
            {enableVerification ? (
              <ShieldCheck className="h-3.5 w-3.5 text-primary" />
            ) : (
              <ShieldOff className="h-3.5 w-3.5 text-muted-foreground" />
            )}
            <span className="text-label text-muted-foreground hidden md:inline">
              Verificación RAG
            </span>
            <Switch
              checked={enableVerification}
              onCheckedChange={(v) => setEnableVerification(Boolean(v))}
              aria-label="Activar verificación RAG"
            />
          </div>
        </div>
      </div>

      {/* ── Main grid ────────────────────────────────────────────────────── */}
      <div className="grid min-h-0 flex-1 gap-2 p-2 xl:grid-cols-[38fr_62fr]">

        {/* Chat panel */}
        <section className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-border/60 bg-card">
          <div className="flex flex-none items-center justify-between border-b border-border/40 px-4 py-2">
            <div className="flex items-center gap-2.5">
              <div className="relative flex-shrink-0">
                <MessageSquareText className="h-4 w-4 text-muted-foreground" />
                <span
                  className={cn(
                    "absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full border border-card transition-colors duration-300",
                    isStreaming ? "bg-amber" : "bg-success",
                  )}
                />
              </div>
              <span className="font-heading text-sm font-semibold tracking-tight text-foreground">
                Chat de prueba
              </span>
            </div>
            <Badge
              className="rounded-full px-2 py-0.5 text-[10px] font-medium bg-success/10 text-success border border-success/25"
            >
              <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-success motion-safe:animate-status-pulse" />
              EN VIVO
            </Badge>
          </div>

          <div className="min-h-0 flex-1">
            {conversationId && (
              <PlaygroundChatWindow
                key={conversationId}
                conversationId={conversationId}
                titleText="Playground"
                enableVerification={enableVerification}
                onDebugData={(data) => setDebugData(data ?? null)}
                onLoadingChange={setIsStreaming}
                onNewChat={resetConversation}
              />
            )}
          </div>
        </section>

        {/* RAG Monitor panel */}
        <section className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-border/60 bg-card">
          <div className="flex flex-none items-center justify-between border-b border-border/40 px-4 py-2">
            <div className="flex items-center gap-2.5">
              <div
                className={cn(
                  "flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md transition-colors duration-300",
                  debugData ? "bg-success/10" : isStreaming ? "bg-primary/10" : "bg-muted/60",
                )}
              >
                {isStreaming && !debugData ? (
                  <Activity
                    className="h-3.5 w-3.5 text-primary motion-safe:animate-status-pulse"
                  />
                ) : (
                  <FlaskConical
                    className={cn(
                      "h-3.5 w-3.5 transition-colors duration-300",
                      debugData ? "text-success" : "text-muted-foreground",
                    )}
                  />
                )}
              </div>
              <span className="font-heading text-sm font-semibold tracking-tight text-foreground">
                Monitor RAG
              </span>
              <span className="text-[11px] text-muted-foreground">
                ·{" "}
                {isStreaming && !debugData
                  ? "Procesando señal…"
                  : debugData
                    ? "Latencia · fuentes · diagnóstico"
                    : "Esperando señal"}
              </span>
            </div>

            {enableVerification && (
              <Badge
                className={cn(
                  "rounded-full px-2 py-0.5 text-[10px] font-medium border",
                  verificationBadgeClass,
                )}
              >
                Verificación activa
              </Badge>
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-hidden">
            <DebugInspector data={debugData} isLoading={isStreaming} />
          </div>
        </section>
      </div>
    </div>
  );
}
