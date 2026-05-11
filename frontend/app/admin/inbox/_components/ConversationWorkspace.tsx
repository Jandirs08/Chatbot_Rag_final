"use client";

import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import useSWR from "swr";
import { Button } from "@/app/components/ui/button";
import { Skeleton } from "@/app/components/ui/skeleton";
import { ScrollArea } from "@/app/components/ui/scroll-area";
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
import { AutoResizeTextarea } from "@/app/components/ui/AutoResizeTextarea";
import { cn } from "@/lib/utils";
import {
  Bot,
  CheckCircle2,
  Lightbulb,
  Loader2,
  MessageSquare,
  Phone,
  RefreshCw,
  RotateCcw,
  Send,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { useToast } from "@/app/hooks/use-toast";
import * as inboxService from "@/app/lib/services/inboxService";
import {
  RateLimitError,
  inboxJsonFetcher,
  buildMessagesUrl,
  type MessagesPage,
} from "@/app/lib/services/inboxService";
import {
  colorFromId,
  displayLabel,
  getInitials,
  getScoreStyle,
  type HistoryItem,
} from "./utils";
import type { InboxConversation } from "./InboxConversationCard";
import {
  ChatMessageBubble,
  Message as BubbleMessage,
} from "@/app/components/chat/ChatMessageBubble";

// ─── Props ────────────────────────────────────────────────────────────────────

interface ConversationWorkspaceProps {
  conversation: InboxConversation;
  agentId: string;
  onConversationUpdate?: (updated: InboxConversation) => void;
}

const RECENT_SUMMARY_MS = 10 * 60 * 1000; // 10 min

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatRelativeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 30) return "ahora mismo";
  if (seconds < 60) return `hace ${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours}h`;
  const days = Math.floor(hours / 24);
  return `hace ${days}d`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ScoreBar({ score }: { score: number }) {
  const sc = getScoreStyle(score);
  const toneText =
    sc.tone === "success"
      ? "text-success"
      : sc.tone === "warning"
        ? "text-warning"
        : "text-error";
  const toneBg =
    sc.tone === "success"
      ? "bg-success"
      : sc.tone === "warning"
        ? "bg-warning"
        : "bg-error";
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="font-heading text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Lead Score
        </span>
        <div className="flex items-baseline gap-1">
          <span className={cn("font-mono text-2xl font-bold tabular-nums", toneText)}>
            {score}
          </span>
          <span className="text-[10px] text-muted-foreground">/100</span>
        </div>
      </div>
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-muted/30"
        role="progressbar"
        aria-valuenow={score}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Lead score"
      >
        <div
          className={cn("h-full rounded-full transition-all duration-700 ease-out", toneBg)}
          style={{ width: `${score}%` }}
        />
      </div>
      <p className={cn("text-[11px] font-semibold", toneText)}>{sc.label}</p>
    </div>
  );
}

function MessageBubble({ msg, idx }: { msg: HistoryItem; idx: number }) {
  const isUser = msg.role === "user";
  const stableKey = msg.timestamp
    ? `${msg.role}-${msg.timestamp}-${idx}`
    : `${msg.role}-${idx}-${(msg.content ?? "").slice(0, 16)}`;
  const bubbleRole = (msg.role === "agent"
    ? "assistant"
    : msg.role) as BubbleMessage["role"];
  const bubbleData: BubbleMessage = {
    id: stableKey,
    role: bubbleRole,
    content: msg.role === "agent" ? `[Agente] ${msg.content}` : msg.content,
    createdAt: msg.timestamp ? new Date(msg.timestamp) : undefined,
  };
  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div className={cn("max-w-[85%]", isUser ? "items-end" : "items-start")}>
        <ChatMessageBubble
          message={bubbleData}
          isMostRecent={false}
          messageCompleted={true}
          botName="Asistente IA"
        />
      </div>
    </div>
  );
}

function AnalyzingPlaceholder() {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-[12px] font-medium text-primary/80">
        <Sparkles className="h-3.5 w-3.5 animate-pulse" />
        <span>Analizando conversación</span>
        <span className="inline-flex gap-0.5" aria-hidden="true">
          <span className="h-1 w-1 animate-pulse rounded-full bg-primary/60 [animation-delay:0ms]" />
          <span className="h-1 w-1 animate-pulse rounded-full bg-primary/60 [animation-delay:150ms]" />
          <span className="h-1 w-1 animate-pulse rounded-full bg-primary/60 [animation-delay:300ms]" />
        </span>
      </div>
      <div className="space-y-2">
        <div className="skeleton-shimmer h-2.5 w-full rounded-full" />
        <div className="skeleton-shimmer h-2.5 w-4/5 rounded-full" />
        <div className="skeleton-shimmer h-2.5 w-3/5 rounded-full" />
      </div>
    </div>
  );
}

// ─── AI Summary Card ──────────────────────────────────────────────────────────

interface SummaryCardProps {
  hasSummary: boolean;
  aiSummary: string | null;
  summaryStaleness: string | null;
  isRefreshing: boolean;
  onRefresh: () => void;
  recommendedAction: string | null;
  purchaseIntent: number | null;
}

function SummaryCard({
  hasSummary,
  aiSummary,
  summaryStaleness,
  isRefreshing,
  onRefresh,
  recommendedAction,
  purchaseIntent,
}: SummaryCardProps) {
  const hasAction = Boolean(recommendedAction);
  const hasIntent = purchaseIntent != null;
  const intentPct =
    purchaseIntent == null
      ? null
      : Math.round(purchaseIntent <= 1 ? purchaseIntent * 100 : purchaseIntent);

  return (
    <section
      aria-label="Resumen de IA"
      className="rounded-xl border border-border/60 bg-gradient-to-br from-primary/[0.06] to-info/[0.04] p-3.5 shadow-sm"
    >
      <div className="flex items-start gap-2">
        <div
          className="flex h-7 w-7 flex-none items-center justify-center rounded-lg bg-primary/15 text-primary"
          aria-hidden="true"
        >
          <Sparkles className="h-3.5 w-3.5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-heading text-[12px] font-semibold tracking-tight text-foreground">
              Resumen IA
            </h3>
            {summaryStaleness && !isRefreshing && (
              <span className="min-w-0 truncate font-mono text-[10px] text-muted-foreground/70">
                {summaryStaleness}
              </span>
            )}
          </div>
        </div>
        {hasSummary && (
          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            className={cn(
              "flex h-8 w-8 flex-none items-center justify-center rounded-lg border border-primary/30 bg-card text-primary",
              "transition-[background-color,border-color,opacity] duration-200 ease-out",
              "hover:bg-primary/10 hover:border-primary/50",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-1 focus-visible:ring-offset-background",
              "disabled:cursor-not-allowed disabled:opacity-60",
            )}
            aria-label="Regenerar resumen"
            title="Regenerar resumen"
          >
            {isRefreshing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
          </button>
        )}
      </div>

      <div className="mt-3">
        {isRefreshing ? (
          <AnalyzingPlaceholder />
        ) : hasSummary ? (
          <p
            key={aiSummary ?? ""}
            className="animate-in fade-in slide-in-from-bottom-1 duration-300 text-[13px] leading-relaxed text-foreground/85"
          >
            {aiSummary}
          </p>
        ) : (
          <div className="flex flex-col items-start gap-2.5 rounded-lg border border-dashed border-border/60 bg-card/60 px-3 py-3">
            <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
              <Bot className="h-3.5 w-3.5 flex-none" aria-hidden="true" />
              Aún no hay resumen
            </div>
            <Button
              size="sm"
              onClick={onRefresh}
              className="h-8 gap-1.5 rounded-lg px-3 font-heading text-[11px] font-semibold"
              aria-label="Generar resumen"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Genera uno
            </Button>
          </div>
        )}
      </div>

      {hasSummary && (hasAction || hasIntent) && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border/40 pt-3">
          {hasAction && (
            <span
              className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-primary/25 bg-primary/[0.08] px-2.5 py-1 font-heading text-[11px] font-semibold text-primary"
              aria-label="Acción sugerida"
            >
              <Lightbulb className="h-3 w-3 flex-none" aria-hidden="true" />
              <span className="truncate">{recommendedAction}</span>
            </span>
          )}
          {hasIntent && intentPct != null && (
            <span
              className="inline-flex flex-none items-center gap-1.5 rounded-full border border-info/25 bg-info/[0.08] px-2.5 py-1 font-mono text-[11px] font-semibold tabular-nums text-info"
              aria-label={`Intención de compra ${intentPct} por ciento`}
            >
              <TrendingUp className="h-3 w-3" aria-hidden="true" />
              Intención de compra: {intentPct}%
            </span>
          )}
        </div>
      )}
    </section>
  );
}

// ─── Rail (lead details) ──────────────────────────────────────────────────────

interface RailProps {
  hasLeadDetails: boolean;
  hasScore: boolean;
  leadScore: number | null;
  hasAction: boolean;
  recommendedAction: string | null;
  hasInterests: boolean;
  productInterests: string[];
  urgency: string | null;
  leadEmail: string | null;
  leadCapturedAt: string | null;
  purchaseIntent: number | null;
  hasSummary: boolean;
  aiSummary: string | null;
  summaryStaleness: string | null;
  isRefreshing: boolean;
  onRefresh: () => void;
}

function Rail({
  hasLeadDetails,
  hasScore,
  leadScore,
  hasAction,
  recommendedAction,
  hasInterests,
  productInterests,
  urgency,
  leadEmail,
  leadCapturedAt,
  purchaseIntent,
  hasSummary,
  aiSummary,
  summaryStaleness,
  isRefreshing,
  onRefresh,
}: RailProps) {
  const capturedAt = leadCapturedAt ? new Date(leadCapturedAt) : null;
  return (
    <ScrollArea className="h-full">
      <div className="space-y-3 p-4">
        <SummaryCard
          hasSummary={hasSummary}
          aiSummary={aiSummary}
          summaryStaleness={summaryStaleness}
          isRefreshing={isRefreshing}
          onRefresh={onRefresh}
          recommendedAction={recommendedAction}
          purchaseIntent={purchaseIntent}
        />

        {hasLeadDetails && (
          <div className="rounded-xl border border-border/60 bg-card p-3.5 shadow-sm">
            <h3 className="mb-3 font-heading text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Lead
            </h3>
            <div className="space-y-4">
              {hasScore && leadScore != null && <ScoreBar score={leadScore} />}

              {(hasAction || hasInterests || urgency) && (
                <div className="space-y-3 border-t border-border/40 pt-3">
                  {hasAction && recommendedAction && (
                    <div className="rounded-lg border border-primary/20 bg-primary/[0.06] px-3 py-2">
                      <span className="block font-heading text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                        Acción sugerida
                      </span>
                      <p className="mt-1 font-heading text-[12px] font-semibold text-primary">
                        {recommendedAction}
                      </p>
                    </div>
                  )}
                  {urgency && (
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "h-2 w-2 flex-none rounded-full",
                          urgency === "alta"
                            ? "bg-error"
                            : urgency === "media"
                              ? "bg-warning"
                              : "bg-success",
                        )}
                        aria-hidden="true"
                      />
                      <span className="text-[12px] font-medium text-muted-foreground">
                        Urgencia {urgency}
                      </span>
                    </div>
                  )}
                  {hasInterests && (
                    <div>
                      <span className="block font-heading text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                        Productos
                      </span>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {productInterests.map((interest) => (
                          <span
                            key={interest}
                            className="inline-flex items-center rounded-md bg-primary/[0.09] px-2 py-0.5 text-[11px] font-semibold text-primary"
                          >
                            {interest}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {(leadEmail || capturedAt) && (
                <div className="space-y-1 border-t border-border/40 pt-3">
                  <span className="font-heading text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                    Contacto
                  </span>
                  {leadEmail && (
                    <p className="truncate text-[12px] font-medium text-info">
                      {leadEmail}
                    </p>
                  )}
                  {capturedAt && (
                    <p className="font-mono text-[10px] text-muted-foreground/70">
                      Capturado {formatRelativeAgo(capturedAt)}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </ScrollArea>
  );
}

// ─── Main workspace (dialog body) ─────────────────────────────────────────────

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

  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [stageMutating, setStageMutating] = useState(false);
  const [takeoverMutating, setTakeoverMutating] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
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

  const handleSend = useCallback(async () => {
    if (!agentId || !draft.trim() || sending) return;
    setSending(true);
    try {
      await inboxService.sendAgentMessage(conversationId, draft.trim());
      setDraft("");
      await mutateMessages();
      textareaRef.current?.focus();
    } catch (err) {
      if (err instanceof RateLimitError) {
        toast({
          title: "Demasiadas solicitudes",
          description: `Espera ${err.retryAfterSeconds}s antes de reenviar.`,
          variant: "destructive",
        });
      } else {
        toast({
          title: "No se envió el mensaje",
          description: "Vuelve a intentarlo. El texto se mantuvo en el borrador.",
          variant: "destructive",
        });
      }
    } finally {
      setSending(false);
    }
  }, [agentId, conversationId, draft, mutateMessages, sending, toast]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        void handleSend();
      }
    },
    [handleSend],
  );

  const runRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const updated = await inboxService.refreshSummary(conversationId);
      onConversationUpdate?.(updated);
    } catch (err) {
      if (err instanceof RateLimitError) {
        toast({
          title: "Demasiadas solicitudes",
          description: `Espera ${err.retryAfterSeconds}s antes de regenerar.`,
          variant: "destructive",
        });
      } else {
        toast({
          title: "No se regeneró el resumen",
          description: "Intenta de nuevo en un momento.",
          variant: "destructive",
        });
      }
    } finally {
      setRefreshing(false);
    }
  }, [conversationId, onConversationUpdate, toast]);

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

  const handleStageToggle = useCallback(async () => {
    if (stageMutating) return;
    setStageMutating(true);
    try {
      const updated = isCompleted
        ? await inboxService.reopen(conversationId)
        : await inboxService.complete(conversationId);
      onConversationUpdate?.(updated);
      toast({
        title: isCompleted ? "Reabierta" : "Marcada como completada",
      });
    } catch (err) {
      if (err instanceof RateLimitError) {
        toast({
          title: "Demasiadas solicitudes",
          description: `Espera ${err.retryAfterSeconds}s e intenta de nuevo.`,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Error",
          description: isCompleted
            ? "No se pudo reabrir la conversación."
            : "No se pudo completar la conversación.",
          variant: "destructive",
        });
      }
    } finally {
      setStageMutating(false);
    }
  }, [conversationId, isCompleted, onConversationUpdate, stageMutating, toast]);

  const handleTakeover = useCallback(async () => {
    if (takeoverMutating) return;
    setTakeoverMutating(true);
    try {
      const patch = await inboxService.takeover(conversationId);
      // Optimistic propagation — the parent's SWR cache for this conversation
      // gets the new mode + assigned_agent_id immediately, so the "Tomar"
      // button vanishes and "Devolver" appears without waiting for the poll.
      onConversationUpdate?.({
        ...conversation,
        mode: patch.mode,
        assigned_agent_id: patch.assigned_agent_id,
      });
    } catch (err) {
      if (err instanceof RateLimitError) {
        toast({
          title: "Demasiadas solicitudes",
          description: `Espera ${err.retryAfterSeconds}s e intenta de nuevo.`,
          variant: "destructive",
        });
      } else {
        const isConflict =
          err instanceof Error && err.message === "ALREADY_TAKEN";
        toast({
          title: isConflict ? "Conversación no disponible" : "Error",
          description: isConflict
            ? "Otro agente ya tomó esta conversación."
            : "No se pudo tomar la conversación.",
          variant: "destructive",
        });
      }
    } finally {
      setTakeoverMutating(false);
    }
  }, [conversation, conversationId, onConversationUpdate, takeoverMutating, toast]);

  const handleRelease = useCallback(async () => {
    if (takeoverMutating) return;
    setTakeoverMutating(true);
    try {
      await inboxService.release(conversationId);
      onConversationUpdate?.({
        ...conversation,
        mode: "bot",
        assigned_agent_id: null,
      });
    } catch (err) {
      if (err instanceof RateLimitError) {
        toast({
          title: "Demasiadas solicitudes",
          description: `Espera ${err.retryAfterSeconds}s e intenta de nuevo.`,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Error",
          description: "No se pudo liberar la conversación.",
          variant: "destructive",
        });
      }
    } finally {
      setTakeoverMutating(false);
    }
  }, [conversation, conversationId, onConversationUpdate, takeoverMutating, toast]);

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

  const handleRefreshClick = () => {
    if (
      summaryAtDate &&
      Date.now() - summaryAtDate.getTime() < RECENT_SUMMARY_MS
    ) {
      setConfirmOpen(true);
      return;
    }
    void runRefresh();
  };

  const ChannelIcon =
    channel === "whatsapp" ? (
      <Phone className="h-3 w-3" aria-hidden="true" />
    ) : (
      <MessageSquare className="h-3 w-3" aria-hidden="true" />
    );

  const modeLabel = MODE_LABEL[mode] ?? mode;
  const categoryLabel = category ? CATEGORY_LABEL[category] ?? category : null;

  const rail = (
    <Rail
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

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      {/* ── Header strip: identity + status + actions ── */}
      <header className="flex flex-none items-center gap-3 border-b border-border/60 bg-card px-4 py-3 pr-12 sm:px-5 sm:pr-14">
        <div
          className="flex h-8 w-8 flex-none items-center justify-center rounded-lg font-heading text-[10px] font-bold text-foreground/70 shadow-sm"
          style={{ backgroundColor: avatarBg }}
          aria-hidden="true"
        >
          {initials}
        </div>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <h2
            id="conversation-dialog-title"
            className="truncate font-heading text-[14px] font-semibold leading-tight tracking-tight text-foreground"
          >
            {displayName}
          </h2>
          {categoryLabel && (
            <span
              className="hidden flex-none rounded-md border border-border/60 bg-muted/40 px-1.5 py-0.5 font-heading text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground sm:inline"
              aria-label={`Categoría ${categoryLabel}`}
            >
              {categoryLabel}
            </span>
          )}
        </div>

        <div className="hidden flex-none items-center gap-1.5 md:flex">
          <span className="inline-flex items-center gap-1 text-[11px] capitalize text-muted-foreground">
            {ChannelIcon}
            {channel}
          </span>
          <span className="text-muted-foreground/40" aria-hidden="true">
            ·
          </span>
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-heading text-[10px] font-semibold uppercase tracking-[0.1em]",
              isHuman
                ? "border-primary/30 bg-primary/10 text-primary"
                : isPending
                  ? "border-warning/30 bg-warning/10 text-warning"
                  : "border-border/60 bg-muted/40 text-muted-foreground",
            )}
          >
            {modeLabel}
          </span>
          {hasScore && sc && (
            <span
              className={cn(
                "rounded-md border px-1.5 py-0.5 font-mono text-[11px] font-bold tabular-nums",
                sc.tone === "success" &&
                  "border-success/25 bg-success/10 text-success",
                sc.tone === "warning" &&
                  "border-warning/25 bg-warning/10 text-warning",
                sc.tone === "error" &&
                  "border-error/25 bg-error/10 text-error",
              )}
              aria-label={`Lead score ${lead_score} de 100`}
              title={`Lead score ${lead_score} de 100`}
            >
              {lead_score}
            </span>
          )}
          {isPending && minutes_waiting != null && (
            <span className="font-mono text-[11px] font-semibold text-amber">
              {minutes_waiting}m esperando
            </span>
          )}
        </div>

        <div className="flex flex-none items-center gap-1.5">
          {showTakeover && (
            <Button
              size="sm"
              disabled={takeoverMutating}
              onClick={handleTakeover}
              className="h-8 flex-none rounded-lg px-3 font-heading text-[11px] font-semibold"
              aria-label="Tomar conversación"
            >
              {takeoverMutating ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                "Tomar"
              )}
            </Button>
          )}
          {showRelease && (
            <Button
              variant="outline"
              size="sm"
              disabled={takeoverMutating}
              onClick={handleRelease}
              className="h-8 flex-none rounded-lg px-3 font-heading text-[11px] font-semibold"
              aria-label="Devolver al bot"
            >
              {takeoverMutating ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                "Devolver"
              )}
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            disabled={stageMutating}
            onClick={handleStageToggle}
            className="h-8 flex-none gap-1.5 rounded-lg px-3 font-heading text-[11px] font-semibold"
            aria-label={isCompleted ? "Reabrir conversación" : "Completar conversación"}
          >
            {stageMutating ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : isCompleted ? (
              <>
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="hidden sm:inline">Reabrir</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="hidden sm:inline">Completar</span>
              </>
            )}
          </Button>
        </div>
      </header>

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
        <main
          aria-label="Conversación"
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="flex flex-none items-center justify-between border-b border-border/40 px-5 py-2">
            <span className="font-heading text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Conversación
            </span>
            {messages.length > 0 && (
              <span className="font-mono text-[10px] text-muted-foreground/70">
                {messages.length} mensaje{messages.length === 1 ? "" : "s"}
              </span>
            )}
          </div>

          <ScrollArea ref={scrollRootRef} className="flex-1">
            <div className="mx-auto max-w-[820px] px-5 py-4">
              {loadingHistory && messages.length === 0 ? (
                <div className="space-y-3 opacity-60">
                  <div className="flex justify-end">
                    <Skeleton className="h-10 w-48 rounded-2xl" />
                  </div>
                  <div className="flex justify-start">
                    <Skeleton className="h-16 w-64 rounded-2xl" />
                  </div>
                  <div className="flex justify-end">
                    <Skeleton className="h-8 w-36 rounded-2xl" />
                  </div>
                </div>
              ) : messages.length === 0 ? (
                <div className="flex min-h-[160px] items-center justify-center rounded-xl border border-dashed border-border/60 text-center">
                  <p className="text-[12px] text-muted-foreground/60">
                    Sin mensajes visibles
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {messages.map((msg, idx) => {
                    const key = msg.timestamp
                      ? `${msg.role}-${msg.timestamp}-${idx}`
                      : `${msg.role}-${idx}-${(msg.content ?? "").slice(0, 16)}`;
                    return <MessageBubble key={key} msg={msg} idx={idx} />;
                  })}
                </div>
              )}
            </div>
          </ScrollArea>

          {/* Composer */}
          {isCompleted ? (
            <div className="flex-none border-t border-border/60 bg-primary/[0.06] px-5 py-3">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-card px-3 py-1 text-[11px] font-medium text-primary">
                <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                Conversación completada · Reabre para responder
              </span>
            </div>
          ) : canReply ? (
            <div className="flex-none border-t border-border/60 bg-card/95 px-4 py-3">
              <div className="mx-auto flex max-w-[820px] items-end gap-2 rounded-xl border border-border/60 bg-background px-3 py-2 transition-colors duration-150 focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/20">
                <AutoResizeTextarea
                  ref={textareaRef}
                  minRows={1}
                  maxRows={5}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Escribe un mensaje… (Enter envía, Shift+Enter salto)"
                  className="flex-1 text-[13px] leading-relaxed text-foreground placeholder:text-muted-foreground/50"
                  aria-label="Mensaje al cliente"
                />
                <Button
                  size="icon"
                  disabled={!draft.trim() || sending}
                  onClick={() => void handleSend()}
                  className="h-8 w-8 flex-none rounded-lg transition-transform duration-150 ease-out active:scale-95"
                  aria-label="Enviar mensaje"
                >
                  {sending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Send className="h-3.5 w-3.5" />
                  )}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex-none border-t border-border/60 bg-card/95 px-5 py-3">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-muted/30 px-3 py-1 text-[11px] font-medium text-muted-foreground">
                {isHuman && !isAssignedToMe
                  ? "Asignado a otro agente"
                  : "Solo lectura — toma la conversación para responder"}
              </span>
            </div>
          )}
        </main>
      </div>

      {/* Recent-summary confirmation */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Regenerar resumen?</AlertDialogTitle>
            <AlertDialogDescription>
              El último resumen es reciente
              {summaryAtDate ? ` (${formatRelativeAgo(summaryAtDate)})` : ""}. Volver
              a generarlo consume una llamada al modelo.
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
