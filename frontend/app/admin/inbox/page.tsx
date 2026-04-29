"use client";

import React, { Suspense, useMemo, useState } from "react";
import useSWR from "swr";
import { useRouter, useSearchParams } from "next/navigation";
import { useRequireAdmin } from "@/app/hooks/useAuthGuard";
import { useAuth } from "@/app/hooks/useAuth";
import { useToast } from "@/app/hooks/use-toast";
import { API_URL } from "@/app/lib/config";
import { authenticatedFetch } from "@/app/lib/services/authService";
import * as inboxService from "@/app/lib/services/inboxService";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import { cn } from "@/lib/utils";
import { RefreshCw } from "lucide-react";
import { HandoffConversationCard } from "./_components/HandoffConversationCard";
import { HandoffConversationDetail } from "./_components/HandoffConversationDetail";
import { HandoffStatsCard } from "./_components/HandoffStatsCard";
import type { HandoffConversation } from "./_components/HandoffConversationCard";

type HandoffListResponse = {
  items: HandoffConversation[];
  total: number;
};


const EMPTY_LIST: HandoffConversation[] = [];

const fetcher = async (url: string) => {
  const res = await authenticatedFetch(url, { method: "GET" });
  if (!res.ok) throw new Error("Error fetching data");
  return res.json();
};

function HandoffInboxContent() {
  const { isAuthorized } = useRequireAdmin();
  const { user } = useAuth();
  const { toast } = useToast();
  const agentId = user?.id ?? "";
  const router = useRouter();
  const searchParams = useSearchParams();

  const conversationIdFromUrl = searchParams.get("conversationId");
  const hasConversation = Boolean(conversationIdFromUrl);

  // Fix 3: track last released conversation
  const [lastReleased, setLastReleased] = useState<string | null>(null);
  // Track which conversation is mutating for loading state (Fix 4)
  const [mutatingId, setMutatingId] = useState<string | null>(null);

  const {
    data: listData,
    isLoading: loadingList,
    mutate: refreshList,
  } = useSWR<HandoffListResponse>(
    isAuthorized ? `${API_URL}/conversations/inbox` : null,
    fetcher,
    { refreshInterval: 5000, revalidateOnFocus: true },
  );

  const conversations = listData?.items ?? EMPTY_LIST;
  const totalConversations = listData?.total ?? 0;

  const selectedConversation = useMemo(
    () =>
      conversations.find(
        (c) => c.conversation_id === conversationIdFromUrl,
      ) ?? null,
    [conversations, conversationIdFromUrl],
  );

  const handleSelect = (id: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("conversationId", id);
    router.replace(`?${params.toString()}`);
  };

  const clearSelection = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("conversationId");
    router.replace(`?${params.toString()}`);
  };

  // Fix 2: agentId guard
  const handleTakeover = async (conversationId: string) => {
    if (!agentId) return;
    setMutatingId(conversationId);
    try {
      await inboxService.takeover(conversationId);
      await refreshList();
      handleSelect(conversationId);
    } catch {
      toast({ title: "Error", description: "No se pudo tomar la conversación.", variant: "destructive" });
    } finally {
      setMutatingId(null);
    }
  };

  // Fix 2: agentId guard; Fix 3: lastReleased state
  const handleRelease = async (conversationId: string) => {
    if (!agentId) return;
    setMutatingId(conversationId);
    try {
      await inboxService.release(conversationId);
      setLastReleased(conversationId);
      setTimeout(() => setLastReleased(null), 4000);
      await refreshList();
      clearSelection();
    } catch {
      toast({ title: "Error", description: "No se pudo liberar la conversación.", variant: "destructive" });
    } finally {
      setMutatingId(null);
    }
  };

  if (!isAuthorized) {
    return null;
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] min-h-[640px] flex-col overflow-hidden rounded-[28px] border border-border/60 bg-card shadow-[0_1px_2px_rgba(15,23,42,0.04),0_18px_48px_rgba(15,23,42,0.08)]">
      {/* Top bar */}
      <div className="border-b border-border/60 bg-card/95 px-6 py-4 supports-[backdrop-filter]:bg-card/85">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant="secondary"
              className="rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em]"
            >
              HandOff
            </Badge>
            <span className="text-sm font-medium text-foreground">
              {totalConversations} conversaciones
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-400">
              <span className="h-2 w-2 rounded-full bg-current animate-pulse" />
              En vivo
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refreshList()}
              className="h-9 rounded-xl border-border/60 px-3"
            >
              <RefreshCw
                className={cn("mr-2 h-4 w-4", loadingList && "animate-spin")}
              />
              Actualizar
            </Button>
          </div>
        </div>
        <div className="mt-3">
          <HandoffStatsCard enabled={isAuthorized} days={30} />
        </div>
      </div>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Left: conversation list */}
        <div
          className={cn(
            hasConversation ? "hidden md:flex" : "flex",
            "w-full md:w-[400px] flex-none border-r border-border/60 flex flex-col min-h-0 bg-surface",
          )}
        >
          <div className="space-y-1 border-b border-border/60 bg-card/80 px-4 py-3.5">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-semibold text-foreground">
                Inbox
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 rounded-xl text-muted-foreground hover:text-foreground"
                onClick={() => refreshList()}
                title="Actualizar"
              >
                <RefreshCw
                  className={cn("h-4 w-4", loadingList && "animate-spin")}
                />
              </Button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
            {loadingList && conversations.length === 0 ? (
              Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="h-24 rounded-2xl border border-border/50 bg-background animate-pulse"
                />
              ))
            ) : conversations.length === 0 ? (
              <div className="flex h-40 flex-col items-center justify-center rounded-2xl border border-dashed border-border/70 bg-background px-6 text-center">
                <p className="text-sm font-medium text-foreground">
                  No hay conversaciones activas
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Las conversaciones en modo pendiente o humano aparecerán aquí.
                </p>
              </div>
            ) : (
              conversations.map((c) => (
                <HandoffConversationCard
                  key={c.conversation_id}
                  conversation={c}
                  isActive={conversationIdFromUrl === c.conversation_id}
                  isMutating={mutatingId === c.conversation_id}
                  agentId={agentId}
                  onSelect={handleSelect}
                  onTakeover={handleTakeover}
                  onRelease={handleRelease}
                />
              ))
            )}
          </div>
        </div>

        {/* Right: detail */}
        <div
          className={cn(
            hasConversation ? "flex w-full" : "hidden md:flex",
            "flex-1 flex flex-col min-h-0 bg-card",
          )}
        >
          <HandoffConversationDetail
            conversation={selectedConversation}
            agentId={agentId}
            lastReleased={lastReleased}
            onClearSelection={clearSelection}
          />
        </div>
      </div>
    </div>
  );
}

export default function AdminHandoffInboxPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center">
          Cargando inbox…
        </div>
      }
    >
      <HandoffInboxContent />
    </Suspense>
  );
}
