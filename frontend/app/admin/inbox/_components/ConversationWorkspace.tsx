"use client";

import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import useSWR from "swr";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/app/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { MessageSquare, Phone } from "lucide-react";
import { useToast } from "@/app/hooks/use-toast";
import {
  RateLimitError,
  inboxJsonFetcher,
  buildMessagesUrl,
  type MessagesPage,
} from "@/app/lib/services/inboxService";
import {
  colorFromId,
  displayLabel,
  formatRelativeAgo,
  getInitials,
  getScoreStyle,
  type HistoryItem,
} from "./utils";
import type { InboxConversation } from "./InboxConversationCard";
import { WorkspaceHeader } from "./WorkspaceHeader";
import { WorkspaceRail } from "./WorkspaceRail";
import { WorkspaceThread } from "./WorkspaceThread";
import { useWorkspaceActions } from "./hooks/useWorkspaceActions";

// ─── Props ────────────────────────────────────────────────────────────────────

interface ConversationWorkspaceProps {
  conversation: InboxConversation;
  agentId: string;
  onConversationUpdate?: (updated: InboxConversation) => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MODE_LABEL: Record<string, string> = {
  bot: "Bot",
  pending: "Pendiente",
  human: "Humano",
};

const CATEGORY_LABEL: Record<string, string> = {
  informacion: "Información",
  comercial: "Comercial",
  soporte: "Soporte",
  sin_valor: "Sin valor",
};

// ─── Component ────────────────────────────────────────────────────────────────

export function ConversationWorkspace({
  conversation,
  agentId,
  onConversationUpdate,
}: ConversationWorkspaceProps) {
  const { toast } = useToast();

  const scrollRootRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const stickToBottomRef = useRef<boolean>(true);
  const lastMsgCountRef = useRef<number>(0);

  const [, forceTick] = useState(0);

  const conversationId = conversation.conversation_id;

  const {
    data: messagesPage,
    isLoading: loadingHistory,
    mutate: mutateMessages,
  } = useSWR<MessagesPage>(
    buildMessagesUrl(conversationId, { limit: 100 }),
    inboxJsonFetcher,
    {
      refreshInterval: 5000,
      revalidateOnFocus: false,
      dedupingInterval: 3000,
      shouldRetryOnError: (err) => !(err instanceof RateLimitError),
      onError: (err) => {
        if (err instanceof RateLimitError) {
          toast({
            title: "Demasiadas solicitudes",
            description: `Esperando ${err.retryAfterSeconds}s antes de reintentar.`,
            variant: "destructive",
          });
        }
      },
    },
  );

  const messages: HistoryItem[] = React.useMemo(
    () => (messagesPage?.messages ?? []) as HistoryItem[],
    [messagesPage],
  );

  // Resolve Radix ScrollArea viewport lazily (it can remount).
  const getViewport = useCallback((): HTMLDivElement | null => {
    if (viewportRef.current && viewportRef.current.isConnected) {
      return viewportRef.current;
    }
    const root = scrollRootRef.current;
    if (!root) return null;
    const found = root.querySelector<HTMLDivElement>(
      "[data-radix-scroll-area-viewport]",
    );
    viewportRef.current = found;
    return found;
  }, []);

  useEffect(() => {
    const viewport = getViewport();
    if (!viewport) return;
    const onScroll = () => {
      const distance =
        viewport.scrollHeight - (viewport.scrollTop + viewport.clientHeight);
      stickToBottomRef.current = distance <= 50;
    };
    viewport.addEventListener("scroll", onScroll, { passive: true });
    return () => viewport.removeEventListener("scroll", onScroll);
  }, [conversationId, getViewport]);

  useEffect(() => {
    stickToBottomRef.current = true;
    lastMsgCountRef.current = 0;
    viewportRef.current = null;
  }, [conversationId]);

  useLayoutEffect(() => {
    if (messages.length === 0) return;
    const isFirstPaint = lastMsgCountRef.current === 0;
    const grew = messages.length > lastMsgCountRef.current;
    lastMsgCountRef.current = messages.length;

    if (!isFirstPaint && !grew) return;
    if (!isFirstPaint && !stickToBottomRef.current) return;

    let cancelled = false;
    const raf1 = requestAnimationFrame(() => {
      if (cancelled) return;
      requestAnimationFrame(() => {
        if (cancelled) return;
        const v = getViewport();
        if (!v) return;
        v.scrollTo({
          top: v.scrollHeight,
          behavior: isFirstPaint ? "auto" : "smooth",
        });
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf1);
    };
  }, [messages, getViewport]);

  useEffect(() => {
    const interval = window.setInterval(() => forceTick((n) => n + 1), 60_000);
    return () => window.clearInterval(interval);
  }, []);

  // ─── Derived conversation state ───────────────────────────────────────────

  const {
    external_id,
    mode,
    category,
    lead_name,
    lead_email,
    lead_captured_at,
    lead_score,
    product_interests,
    recommended_action,
    ai_summary,
    ai_summary_at,
    ai_summary_at_msg_count,
    message_count,
    urgency,
    channel,
    assigned_agent_id,
    minutes_waiting,
    stage,
    purchase_intent,
  } = conversation;

  const isCompleted = stage === "completed";
  const isHuman = mode === "human";
  const isPending = mode === "pending";
  const isAssignedToMe = assigned_agent_id === agentId;
  const canReply = isHuman && isAssignedToMe;
  const showTakeover = !isHuman;
  const showRelease = isHuman && isAssignedToMe;

  const summaryAtDate = ai_summary_at ? new Date(ai_summary_at) : null;
  const liveMessageCount = Math.max(message_count ?? 0, messages.length);
  const summaryStaleness = (() => {
    if (!summaryAtDate) return null;
    const ago = formatRelativeAgo(summaryAtDate);
    if (ai_summary_at_msg_count == null) return `Generado ${ago}`;
    const drift = liveMessageCount - ai_summary_at_msg_count;
    if (drift <= 0) {
      return `Generado ${ago} · al mensaje ${ai_summary_at_msg_count}`;
    }
    return `Generado ${ago} · al msg ${ai_summary_at_msg_count} de ${liveMessageCount}`;
  })();

  // ─── Actions hook ─────────────────────────────────────────────────────────

  const {
    draft,
    setDraft,
    sending,
    refreshing,
    stageMutating,
    takeoverMutating,
    confirmOpen,
    setConfirmOpen,
    handleSend,
    handleKeyDown,
    runRefresh,
    handleStageToggle,
    handleTakeover,
    handleRelease,
    handleRefreshClick,
  } = useWorkspaceActions({
    agentId,
    conversationId,
    conversation,
    isCompleted,
    summaryAtDate,
    mutateMessages,
    onConversationUpdate,
    toast,
    textareaRef,
  });

  // ─── Display helpers ──────────────────────────────────────────────────────

  const initials = getInitials(lead_name, conversationId);
  const avatarBg = colorFromId(conversationId);
  const displayName = displayLabel({
    name: lead_name,
    channel,
    externalId: external_id,
    conversationId,
  });
  const sc = lead_score != null ? getScoreStyle(lead_score) : null;

  const hasScore = lead_score != null;
  const hasInterests = (product_interests?.length ?? 0) > 0;
  const hasAction = Boolean(recommended_action);
  const hasSummary = Boolean(ai_summary);
  const hasLeadDetails = Boolean(
    hasScore || hasAction || hasInterests || urgency || lead_email,
  );

  const ChannelIcon =
    channel === "whatsapp" ? (
      <Phone className="h-3 w-3" aria-hidden="true" />
    ) : (
      <MessageSquare className="h-3 w-3" aria-hidden="true" />
    );

  const modeLabel = MODE_LABEL[mode] ?? mode;
  const categoryLabel = category
    ? (CATEGORY_LABEL[category] ?? category)
    : null;

  // ─── Shared rail ─────────────────────────────────────────────────────────

  const rail = (
    <WorkspaceRail
      hasLeadDetails={hasLeadDetails}
      hasScore={hasScore}
      leadScore={lead_score ?? null}
      hasAction={hasAction}
      recommendedAction={recommended_action ?? null}
      hasInterests={hasInterests}
      productInterests={product_interests ?? []}
      urgency={urgency ?? null}
      leadEmail={lead_email ?? null}
      leadCapturedAt={lead_captured_at ?? null}
      purchaseIntent={purchase_intent ?? null}
      hasSummary={hasSummary}
      aiSummary={ai_summary ?? null}
      summaryStaleness={summaryStaleness}
      isRefreshing={refreshing}
      onRefresh={handleRefreshClick}
    />
  );

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      {/* ── Header strip: identity + status + actions ── */}
      <WorkspaceHeader
        displayName={displayName}
        categoryLabel={categoryLabel}
        channel={channel ?? "web"}
        ChannelIcon={ChannelIcon}
        modeLabel={modeLabel}
        isHuman={isHuman}
        isPending={isPending}
        hasScore={hasScore}
        sc={sc}
        lead_score={lead_score ?? null}
        minutes_waiting={minutes_waiting ?? null}
        showTakeover={showTakeover}
        showRelease={showRelease}
        takeoverMutating={takeoverMutating}
        onTakeover={handleTakeover}
        onRelease={handleRelease}
        stageMutating={stageMutating}
        onStageToggle={handleStageToggle}
        isCompleted={isCompleted}
        initials={initials}
        avatarBg={avatarBg}
      />

      {/* ── Body: rail (left, summary) + thread (right) ── */}
      <div className="flex min-h-0 flex-1 overflow-hidden lg:flex-row flex-col">
        {/* Rail — inline on lg+ (left); accordion on narrow viewports */}
        <aside
          aria-label="Detalles del lead"
          className="hidden flex-none border-r border-border/60 bg-card/40 lg:block lg:w-[340px] xl:w-[400px]"
        >
          {rail}
        </aside>

        {/* Narrow-viewport collapsed details: native <details> avoids portal layering and keeps Esc/backdrop on the dialog */}
        <details className="group flex-none border-b border-border/60 bg-card/40 lg:hidden">
          <summary
            className={cn(
              "flex cursor-pointer items-center justify-between gap-2 px-4 py-2 font-heading text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground",
              "list-none [&::-webkit-details-marker]:hidden",
              "transition-colors hover:bg-muted/30",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
            )}
          >
            <span>Resumen y detalles</span>
            <span
              className="font-mono text-[10px] text-muted-foreground/70 transition-transform group-open:rotate-180"
              aria-hidden="true"
            >
              ▾
            </span>
          </summary>
          <div className="max-h-[40vh] overflow-hidden">{rail}</div>
        </details>

        {/* Thread */}
        <WorkspaceThread
          messages={messages}
          loadingHistory={loadingHistory}
          scrollRootRef={scrollRootRef}
          isCompleted={isCompleted}
          canReply={canReply}
          isHuman={isHuman}
          isAssignedToMe={isAssignedToMe}
          draft={draft}
          onDraftChange={setDraft}
          onKeyDown={handleKeyDown}
          onSend={() => void handleSend()}
          sending={sending}
          textareaRef={textareaRef}
        />
      </div>

      {/* Recent-summary confirmation */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Regenerar resumen?</AlertDialogTitle>
            <AlertDialogDescription>
              El último resumen es reciente
              {summaryAtDate ? ` (${formatRelativeAgo(summaryAtDate)})` : ""}.
              Volver a generarlo consume una llamada al modelo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmOpen(false);
                void runRefresh();
              }}
            >
              Regenerar igual
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
