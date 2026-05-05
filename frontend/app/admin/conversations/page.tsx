"use client";

import React, { Suspense, useMemo, useState } from "react";
import useSWR from "swr";
import { useRouter, useSearchParams } from "next/navigation";
import { useRequireAdmin } from "@/app/hooks/useAuthGuard";
import { API_URL } from "@/app/lib/config";
import { authenticatedJsonFetcher } from "@/app/lib/services/authService";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import { cn } from "@/lib/utils";
import { RefreshCw } from "lucide-react";
import { ChatDetail } from "../inbox/_components/ChatDetail";
import { ConversationList } from "../inbox/_components/ConversationList";
import {
  EMPTY_CONVERSATIONS,
  EMPTY_HISTORY,
  type ConversationItem,
  type ConversationResponse,
  type FilterConfig,
  type HistoryItem,
} from "../inbox/_components/utils";

function ConversationsContent() {
  const { isAuthorized } = useRequireAdmin();
  const router = useRouter();
  const searchParams = useSearchParams();

  const chatIdFromUrl = searchParams.get("chatId");
  const hasChat = Boolean(chatIdFromUrl);
  const [filterConfig, setFilterConfig] = useState<FilterConfig>({
    search: "",
    startDate: "",
    endDate: "",
    hideTrivial: false,
  });

  const [page, setPage] = useState(1);
  const LIMIT = 50;
  const skip = (page - 1) * LIMIT;

  const {
    data: conversationData,
    isLoading: loadingList,
    mutate: refreshList,
  } = useSWR<ConversationResponse>(
    isAuthorized
      ? `${API_URL}/chat/conversations?limit=${LIMIT}&skip=${skip}`
      : null,
    authenticatedJsonFetcher,
    { refreshInterval: 10000, revalidateOnFocus: true },
  );

  const conversations = conversationData?.items ?? EMPTY_CONVERSATIONS;
  const totalConversations = conversationData?.total || 0;
  const totalPages = Math.max(1, Math.ceil(totalConversations / LIMIT));

  const { data: messages = EMPTY_HISTORY, isLoading: loadingHistory } = useSWR<
    HistoryItem[]
  >(
    isAuthorized && chatIdFromUrl
      ? `${API_URL}/chat/history/${chatIdFromUrl}`
      : null,
    authenticatedJsonFetcher,
    { refreshInterval: 5000, revalidateOnFocus: false },
  );

  const filteredConversations = useMemo(() => {
    const list = conversations || [];
    const text = filterConfig.search.trim().toLowerCase();
    const toStart = (s: string) => {
      const [y, m, d] = s.split("-");
      return new Date(Number(y), Number(m) - 1, Number(d), 0, 0, 0, 0);
    };
    const toEnd = (s: string) => {
      const [y, m, d] = s.split("-");
      return new Date(Number(y), Number(m) - 1, Number(d), 23, 59, 59, 999);
    };
    const start = filterConfig.startDate ? toStart(filterConfig.startDate) : null;
    const end = filterConfig.endDate ? toEnd(filterConfig.endDate) : null;

    return [...list]
      .sort(
        (left, right) =>
          new Date(right.updated_at).getTime() -
          new Date(left.updated_at).getTime(),
      )
      .filter((c) => {
        const updated = new Date(c.updated_at);
        if (start && updated < start) return false;
        if (end && updated > end) return false;
        if (filterConfig.hideTrivial && !(c.total_messages > 2)) return false;
        if (text) {
          const hay =
            `${c.conversation_id} ${c.last_message_preview}`.toLowerCase();
          if (!hay.includes(text)) return false;
        }
        return true;
      });
  }, [conversations, filterConfig]);

  const selectedConversation = useMemo(
    () =>
      conversations.find(
        (conversation: ConversationItem) =>
          conversation.conversation_id === chatIdFromUrl,
      ),
    [chatIdFromUrl, conversations],
  );

  const handleSelectChat = (id: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("chatId", id);
    router.replace(`?${params.toString()}`);
  };

  const clearSelectedChat = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("chatId");
    router.replace(`?${params.toString()}`);
  };

  if (!isAuthorized) {
    return null;
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] min-h-[640px] flex-col overflow-hidden rounded-[28px] border border-border/60 bg-card shadow-[0_1px_2px_rgba(15,23,42,0.04),0_18px_48px_rgba(15,23,42,0.08)]">
      <div className="border-b border-border/60 bg-card/95 px-6 py-4 supports-[backdrop-filter]:bg-card/85">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap items-center gap-2 [&_h1]:hidden [&_p]:hidden">
            <div className="flex items-center gap-2">
              <Badge
                variant="secondary"
                className="rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em]"
              >
                Buzón
              </Badge>
              <span className="text-sm font-medium text-foreground">
                {totalConversations} conversaciones
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-success/25 bg-success/10 px-3 py-1.5 text-xs font-medium text-success">
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
      </div>
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <div
          className={cn(
            hasChat ? "hidden md:flex" : "flex",
            "w-full md:w-[400px] flex-none border-r border-border/60 flex flex-col min-h-0 bg-surface",
          )}
        >
          <ConversationList
            conversations={conversations}
            filtered={filteredConversations}
            totalConversations={totalConversations}
            filterConfig={filterConfig}
            setFilterConfig={setFilterConfig}
            loading={loadingList}
            onRefresh={() => refreshList()}
            selectedId={chatIdFromUrl}
            onSelect={handleSelectChat}
            page={page}
            totalPages={totalPages}
            onPrevPage={() => setPage((p) => Math.max(1, p - 1))}
            onNextPage={() => setPage((p) => Math.min(totalPages, p + 1))}
          />
        </div>

        <div
          className={cn(
            hasChat ? "flex w-full" : "hidden md:flex",
            "flex-1 flex flex-col min-h-0 bg-card",
          )}
        >
          <ChatDetail
            chatId={chatIdFromUrl}
            selectedConversation={selectedConversation}
            messages={messages}
            loading={loadingHistory}
            onClearSelection={clearSelectedChat}
          />
        </div>
      </div>
    </div>
  );
}

export default function AdminConversationsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center">
          Cargando conversaciones...
        </div>
      }
    >
      <ConversationsContent />
    </Suspense>
  );
}
