"use client";

import React, {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import useSWR from "swr";
import { useRouter, useSearchParams } from "next/navigation";
import { useRequireAdmin } from "@/app/hooks/useAuthGuard";
import { API_URL } from "@/app/lib/config";
import {
  authenticatedJsonFetcher,
  authenticatedHistoryFetcher,
  type HistoryFetchResult,
} from "@/app/lib/services/authService";
import { Button } from "@/app/components/ui/button";
import { Skeleton } from "@/app/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { RefreshCw, MessagesSquare, Inbox } from "lucide-react";
import { PulseDot, TickNumber } from "@/app/_components/motion";
import { AdminPageShell } from "../_components/AdminPageShell";
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
    const iso = new Date(
      Number(y),
      Number(m) - 1,
      Number(d),
      0,
      0,
      0,
      0,
    ).toISOString();
    url.searchParams.set("start_date", iso);
  }
  if (args.endDate) {
    const [y, m, d] = args.endDate.split("-");
    const iso = new Date(
      Number(y),
      Number(m) - 1,
      Number(d),
      23,
      59,
      59,
      999,
    ).toISOString();
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
    (next: FilterConfig | ((prev: FilterConfig) => FilterConfig)) => {
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
    { refreshInterval: 10000, revalidateOnFocus: false },
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

  const { data: historyData, isLoading: loadingHistory } =
    useSWR<HistoryFetchResult>(
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
    <AdminPageShell>
      {/* ── Compact hero strip ───────────────────────────────────── */}
      <header className="relative flex-none overflow-hidden rounded-2xl border border-border/60 bg-card px-5 py-3 md:px-7 md:py-3 mb-4">
        <div
          aria-hidden="true"
          className="absolute -top-16 -right-12 w-64 h-64 opacity-30 animate-orb-float pointer-events-none"
        >
          <img
            src="/assets/decor/glow-orb-teal.svg"
            alt=""
            className="w-full h-full"
          />
        </div>
        <div
          aria-hidden="true"
          className="absolute -bottom-20 right-32 w-48 h-48 opacity-22 animate-orb-float pointer-events-none"
          style={{ animationDelay: "-9s" }}
        >
          <img
            src="/assets/decor/glow-orb-violet.svg"
            alt=""
            className="w-full h-full"
            loading="lazy"
          />
        </div>
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-grid opacity-25 pointer-events-none"
        />

        <div className="relative flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-2.5 mb-2.5">
              <span className="h-px w-6 bg-primary/40" />
              <span className="text-[10px] uppercase tracking-[0.18em] font-heading text-muted-foreground">
                Buzón unificado · humano + bot
              </span>
            </div>

            <div className="flex items-center gap-2.5">
              <MessagesSquare className="h-6 w-6 text-primary" />
              <h1 className="text-2xl md:text-3xl font-heading font-bold tracking-tighter leading-none">
                <span className="gradient-hero-display">Conversaciones</span>
              </h1>
            </div>

            <div className="flex flex-wrap items-center gap-3 mt-3 text-xs">
              <span className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-success/10 border border-success/25">
                <PulseDot color="success" size={6} />
                <span className="font-mono uppercase tracking-wider text-success text-[10px]">
                  en vivo
                </span>
              </span>
              <span className="inline-flex items-center gap-1.5 font-mono text-muted-foreground tabular-nums">
                <Inbox className="h-3 w-3 text-amber" />
                <TickNumber value={totalConversations} />
                <span className="text-muted-foreground/70">conversaciones</span>
              </span>
              <span className="font-mono text-muted-foreground/70 text-[11px]">
                auto-refresh · 10s
              </span>
            </div>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => refreshList()}
            className="h-9 self-start rounded-lg border-border/60 hover:border-primary/40 hover:bg-primary/[0.04] transition-all duration-200 ease-out-expo"
          >
            <RefreshCw
              className={cn(
                "mr-2 h-3.5 w-3.5",
                loadingList && "animate-spin text-primary",
              )}
            />
            <span className="font-mono text-xs">actualizar</span>
          </Button>
        </div>
      </header>

      {/* ── Split view ───────────────────────────────────────────── */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border/60 bg-card">
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
    </AdminPageShell>
  );
}

function ConversationsLoading() {
  return (
    <AdminPageShell header={<Skeleton className="h-20 w-full rounded-2xl" />}>
      <div className="flex min-h-0 flex-1 gap-0 overflow-hidden rounded-2xl border border-border/60">
        <Skeleton className="h-full w-[400px] flex-none rounded-none border-r border-border/60" />
        <Skeleton className="h-full flex-1 rounded-none" />
      </div>
    </AdminPageShell>
  );
}

export default function AdminConversationsPage() {
  return (
    <Suspense fallback={<ConversationsLoading />}>
      <ConversationsContent />
    </Suspense>
  );
}
