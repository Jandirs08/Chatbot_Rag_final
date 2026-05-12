"use client";

import React, { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { useRouter, useSearchParams } from "next/navigation";
import { useRequireAdmin } from "@/app/hooks/useAuthGuard";
import { API_URL } from "@/app/lib/config";
import {
  authenticatedJsonFetcher,
  authenticatedHistoryFetcher,
  type HistoryFetchResult,
} from "@/app/lib/services/authService";
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
  type FilterConfig,
  type HistoryItem,
} from "../inbox/_components/utils";

type ConversationPage = {
  items: ConversationItem[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
  has_next: boolean;
};

function buildConversationsUrl(args: {
  limit: number;
  skip: number;
  search: string;
  startDate: string;
  endDate: string;
  hideTrivial: boolean;
}): string {
  const url = new URL(`${API_URL}/chat/conversations`);
  url.searchParams.set("limit", String(args.limit));
  url.searchParams.set("skip", String(args.skip));
  if (args.search.trim()) url.searchParams.set("search", args.search.trim());
  if (args.startDate) {
    const [y, m, d] = args.startDate.split("-");
    const iso = new Date(Number(y), Number(m) - 1, Number(d), 0, 0, 0, 0).toISOString();
    url.searchParams.set("start_date", iso);
  }
  if (args.endDate) {
    const [y, m, d] = args.endDate.split("-");
    const iso = new Date(Number(y), Number(m) - 1, Number(d), 23, 59, 59, 999).toISOString();
    url.searchParams.set("end_date", iso);
  }
  if (args.hideTrivial) url.searchParams.set("hide_trivial", "true");
  return url.toString();
}

function ConversationsContent() {
  const { isAuthorized } = useRequireAdmin();
  const router = useRouter();
  const searchParams = useSearchParams();

  const chatIdFromUrl = searchParams.get("chatId");
  const hasChat = Boolean(chatIdFromUrl);
  const [filterConfig, setFilterConfigState] = useState<FilterConfig>({
    search: "",
    startDate: "",
    endDate: "",
    hideTrivial: false,
  });

  const [page, setPage] = useState(1);
  const LIMIT = 50;
  const skip = (page - 1) * LIMIT;

  const setFilterConfig = useCallback(
    (
      next:
        | FilterConfig
        | ((prev: FilterConfig) => FilterConfig),
    ) => {
      setPage(1);
      setFilterConfigState(next);
    },
    [],
  );

  const {
    data: conversationData,
    isLoading: loadingList,
    mutate: refreshList,
  } = useSWR<ConversationPage>(
    isAuthorized
      ? buildConversationsUrl({
          limit: LIMIT,
          skip,
          search: filterConfig.search,
          startDate: filterConfig.startDate,
          endDate: filterConfig.endDate,
          hideTrivial: filterConfig.hideTrivial,
        })
      : null,
    authenticatedJsonFetcher,
    { refreshInterval: 10000, revalidateOnFocus: true },
  );

  const conversations = conversationData?.items ?? EMPTY_CONVERSATIONS;
  const totalConversations = conversationData?.total || 0;
  const totalPages = conversationData?.total_pages ?? 1;

  // Sync local page when server clamps (e.g., filter shrinks result set).
  useEffect(() => {
    if (conversationData && conversationData.page < page) {
      setPage(conversationData.page);
    }
  }, [conversationData, page]);

  const { data: historyData, isLoading: loadingHistory } = useSWR<HistoryFetchResult>(
    isAuthorized && chatIdFromUrl
      ? `${API_URL}/chat/history/${chatIdFromUrl}`
      : null,
    authenticatedHistoryFetcher,
    { refreshInterval: 5000, revalidateOnFocus: false },
  );
  const messages = (historyData?.items as HistoryItem[]) ?? EMPTY_HISTORY;
  const historyTruncated = historyData?.truncated ?? false;

  // Server already filters/sorts; consume items as-is.
  const filteredConversations = conversations;

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
            truncated={historyTruncated}
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
