"use client";

import React, { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from "@/app/components/ui/sheet";
import { Button } from "@/app/components/ui/button";
import { Skeleton } from "@/app/components/ui/skeleton";
import { ScrollArea } from "@/app/components/ui/scroll-area";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/app/components/ui/accordion";
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
  Loader2,
  MessageSquare,
  Phone,
  RotateCcw,
  Send,
  Sparkles,
  X,
} from "lucide-react";
import { useToast } from "@/app/hooks/use-toast";
import { API_URL } from "@/app/lib/config";
import { authenticatedJsonFetcher } from "@/app/lib/services/authService";
import * as inboxService from "@/app/lib/services/inboxService";
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

interface LeadSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversation: InboxConversation | null;
  agentId: string;
  mutatingId: string | null;
  onTakeover: (id: string) => void;
  onRelease: (id: string) => void;
  onConversationUpdate?: (updated: InboxConversation) => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const RECENT_SUMMARY_MS = 10 * 60 * 1000; // 10 min

// ─── Sub-components ───────────────────────────────────────────────────────────

function ScoreBar({ score }: { score: number }) {
  const sc = getScoreStyle(score);
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="font-heading text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Lead Score
        </span>
        <div className="flex items-baseline gap-1">
          <span className="font-mono text-2xl font-bold" style={{ color: sc.color }}>
            {score}
          </span>
          <span className="text-[10px] text-muted-foreground">/100</span>
        </div>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/30">
        <div
          className="h-full rounded-full transition-all duration-700 ease-out"
          style={{ width: `${score}%`, backgroundColor: sc.color }}
        />
      </div>
      <p className="text-[11px] font-semibold" style={{ color: sc.color }}>
        {sc.label}
      </p>
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

/** "Analizando conversación" + animated dots */
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

// ─── Main component ───────────────────────────────────────────────────────────

export function LeadSheet({
  open,
  onOpenChange,
  conversation,
  agentId,
  mutatingId,
  onTakeover,
  onRelease,
  onConversationUpdate,
}: LeadSheetProps) {
  const scrollRootRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const stickToBottomRef = useRef<boolean>(true);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [stageMutating, setStageMutating] = useState(false);
  const [, forceTick] = useState(0);
  const { toast } = useToast();

  const {
    data: messages = [] as HistoryItem[],
    isLoading: loadingHistory,
    mutate: mutateMessages,
  } = useSWR<HistoryItem[]>(
    conversation && open
      ? `${API_URL}/chat/history/${conversation.conversation_id}`
      : null,
    authenticatedJsonFetcher,
    { refreshInterval: 5000, revalidateOnFocus: false },
  );

  const lastMsgCountRef = useRef<number>(0);

  // Resolve the Radix ScrollArea internal viewport once mounted/open.
  // Track whether the user is currently pinned to the bottom; if they scroll up
  // to read history, new-message arrivals MUST NOT yank them back down.
  useEffect(() => {
    if (!open) return;
    const root = scrollRootRef.current;
    if (!root) return;
    const viewport = root.querySelector<HTMLDivElement>(
      "[data-radix-scroll-area-viewport]",
    );
    viewportRef.current = viewport;
    if (!viewport) return;

    const onScroll = () => {
      const distance =
        viewport.scrollHeight - (viewport.scrollTop + viewport.clientHeight);
      stickToBottomRef.current = distance <= 50;
    };
    viewport.addEventListener("scroll", onScroll, { passive: true });
    return () => viewport.removeEventListener("scroll", onScroll);
  }, [open, conversation?.conversation_id]);

  // Reset stick-to-bottom + message-count tracker on conversation switch / sheet
  // close so the next paint counts as "first paint" (instant jump, no smooth).
  useEffect(() => {
    stickToBottomRef.current = true;
    lastMsgCountRef.current = 0;
  }, [conversation?.conversation_id, open]);

  // Instant scroll on open / conversation switch; smooth scroll on new message arrival
  useEffect(() => {
    if (!open) return;
    const viewport = viewportRef.current;
    if (!viewport) return;

    const isFirstPaint = lastMsgCountRef.current === 0 && messages.length > 0;
    const grew = messages.length > lastMsgCountRef.current;
    lastMsgCountRef.current = messages.length;

    if (!isFirstPaint && !grew) return;
    // If user scrolled up to read history, don't fight them
    if (!isFirstPaint && !stickToBottomRef.current) return;

    const id = window.setTimeout(() => {
      const v = viewportRef.current;
      if (!v) return;
      v.scrollTo({
        top: v.scrollHeight,
        behavior: isFirstPaint ? "auto" : "smooth",
      });
    }, 30);
    return () => window.clearTimeout(id);
  }, [messages, open]);

  // Tick once a minute so "hace X min" stays current while sheet is open
  useEffect(() => {
    if (!open) return;
    const interval = window.setInterval(() => forceTick((n) => n + 1), 60_000);
    return () => window.clearInterval(interval);
  }, [open]);

  const handleSend = async () => {
    if (!agentId || !draft.trim() || sending || !conversation) return;
    setSending(true);
    try {
      await inboxService.sendAgentMessage(
        conversation.conversation_id,
        draft.trim(),
      );
      setDraft("");
      await mutateMessages();
      textareaRef.current?.focus();
    } catch {
      /* keep draft for retry */
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  const runRefresh = async () => {
    if (!conversation) return;
    const id = conversation.conversation_id;
    setRefreshingId(id);
    try {
      const updated = await inboxService.refreshSummary(id);
      onConversationUpdate?.(updated);
    } catch {
      /* fail silently — keep previous summary */
    } finally {
      setRefreshingId(null);
    }
  };

  if (!conversation) return null;

  const {
    conversation_id,
    external_id,
    mode,
    lead_name,
    lead_email,
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
  } = conversation;
  const isCompleted = stage === "completed";

  const handleStageToggle = async () => {
    if (stageMutating) return;
    setStageMutating(true);
    try {
      const updated = isCompleted
        ? await inboxService.reopen(conversation_id)
        : await inboxService.complete(conversation_id);
      onConversationUpdate?.(updated);
      toast({
        title: isCompleted ? "Reabierta" : "Marcada como completada",
      });
    } catch {
      toast({
        title: "Error",
        description: isCompleted
          ? "No se pudo reabrir la conversación."
          : "No se pudo completar la conversación.",
        variant: "destructive",
      });
    } finally {
      setStageMutating(false);
    }
  };

  const initials = getInitials(lead_name, conversation_id);
  const avatarBg = colorFromId(conversation_id);
  const displayName = displayLabel({
    name: lead_name,
    channel,
    externalId: external_id,
    conversationId: conversation_id,
  });
  const sc = lead_score != null ? getScoreStyle(lead_score) : null;

  const hasScore = lead_score != null;
  const hasInterests = (product_interests?.length ?? 0) > 0;
  const hasAction = Boolean(recommended_action);
  const hasSummary = Boolean(ai_summary);
  const hasLeadDetails = hasScore || hasAction || hasInterests || urgency || lead_email;

  const isHuman = mode === "human";
  const isPending = mode === "pending";
  const isAssignedToMe = assigned_agent_id === agentId;
  const canReply = isHuman && isAssignedToMe;
  const isMutating = mutatingId === conversation_id;
  const isRefreshing = refreshingId === conversation_id;
  const showTakeover = isPending || (mode === "bot" && Boolean(lead_email));
  const showRelease = isHuman && isAssignedToMe;

  // Server-side staleness tracking. The card is the source of truth:
  //   ai_summary_at            — when the summary was last generated
  //   ai_summary_at_msg_count  — message count at that point
  //   message_count            — current message count from inbox endpoint
  // Live `messages.length` from chat history is used as a fallback when the
  // card hasn't refreshed yet (and as the more current value while sheet is open).
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
    if (!conversation) return;
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
      <Phone className="h-3 w-3" />
    ) : (
      <MessageSquare className="h-3 w-3" />
    );

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="right"
          className="flex w-[560px] max-w-[95vw] flex-col gap-0 p-0 [&>button:first-of-type]:hidden"
        >
          <SheetTitle className="sr-only">{displayName}</SheetTitle>

          {/* ── Compact header ── */}
          <header className="flex-none border-b border-border/60 bg-card px-5 py-3">
            <div className="flex items-center gap-3">
              {/* Avatar */}
              <div
                className="flex h-10 w-10 flex-none items-center justify-center rounded-xl font-heading text-sm font-bold shadow-sm"
                style={{ backgroundColor: avatarBg, color: "rgba(0,0,0,0.6)" }}
                aria-hidden="true"
              >
                {initials}
              </div>

              {/* Identity */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h2 className="truncate font-heading text-[15px] font-semibold leading-tight tracking-tight text-foreground">
                    {displayName}
                  </h2>
                  {isCompleted && (
                    <span
                      className="inline-flex flex-none items-center gap-1 rounded-full border border-violet-300/60 bg-violet-50 px-2 py-0.5 font-heading text-[10px] font-semibold uppercase tracking-wide text-violet-700 dark:border-violet-800/60 dark:bg-violet-950/40 dark:text-violet-300"
                      aria-label="Conversación completada"
                    >
                      <CheckCircle2 className="h-2.5 w-2.5" />
                      Completada
                    </span>
                  )}
                  {hasScore && (
                    <span
                      className="flex-none rounded-md px-1.5 py-0.5 font-mono text-[11px] font-bold tabular-nums"
                      style={{ backgroundColor: sc!.bg, color: sc!.color }}
                      aria-label={`Lead score ${lead_score} de 100`}
                    >
                      {lead_score}
                    </span>
                  )}
                </div>
                <div className="mt-0.5 flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 text-[11px] capitalize text-muted-foreground">
                    {ChannelIcon}
                    {channel}
                  </span>
                  {isPending && minutes_waiting != null && (
                    <>
                      <span className="text-muted-foreground/40">·</span>
                      <span className="font-mono text-[11px] font-semibold text-amber">
                        {minutes_waiting}m esperando
                      </span>
                    </>
                  )}
                </div>
              </div>

              {/* Primary CTA — collapses to icon on tight space */}
              {showTakeover && (
                <Button
                  size="sm"
                  disabled={isMutating}
                  onClick={() => onTakeover(conversation_id)}
                  className="h-8 flex-none rounded-lg px-3 font-heading text-[11px] font-semibold"
                >
                  {isMutating ? (
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
                  disabled={isMutating}
                  onClick={() => onRelease(conversation_id)}
                  className="h-8 flex-none rounded-lg px-3 font-heading text-[11px] font-semibold"
                >
                  {isMutating ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    "Devolver"
                  )}
                </Button>
              )}

              {/* Complete / Reopen */}
              <Button
                variant="outline"
                size="sm"
                disabled={stageMutating}
                onClick={handleStageToggle}
                className="h-8 flex-none gap-1.5 rounded-lg px-3 font-heading text-[11px] font-semibold"
              >
                {stageMutating ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : isCompleted ? (
                  <>
                    <RotateCcw className="h-3.5 w-3.5" />
                    Reabrir
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Completar
                  </>
                )}
              </Button>

              {/* Close */}
              <button
                onClick={() => onOpenChange(false)}
                className="flex-none rounded-lg p-1.5 text-muted-foreground transition-colors duration-150 ease-out hover:bg-muted/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-1 focus-visible:ring-offset-background"
                aria-label="Cerrar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </header>

          {/* ── Body: details accordion + summary + chat ── */}
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {/* Lead details — collapsible, default closed */}
            {hasLeadDetails && (
              <Accordion
                type="single"
                collapsible
                className="flex-none border-b border-border/60 bg-card/60"
              >
                <AccordionItem value="lead-details" className="border-b-0">
                  <AccordionTrigger className="px-5 py-2.5 font-heading text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground hover:no-underline hover:text-foreground">
                    Detalles del lead
                  </AccordionTrigger>
                  <AccordionContent className="px-5 pb-4 pt-1">
                    <div className="space-y-4">
                      {hasScore && <ScoreBar score={lead_score!} />}

                      {(hasAction || hasInterests || urgency) && (
                        <div className="space-y-3 border-t border-border/40 pt-3">
                          {hasAction && (
                            <div className="rounded-lg border border-primary/20 bg-primary/[0.06] px-3 py-2">
                              <p className="font-heading text-[12px] font-semibold text-primary">
                                → {recommended_action}
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
                            <div className="flex flex-wrap gap-1.5">
                              {product_interests!.map((interest) => (
                                <span
                                  key={interest}
                                  className="inline-flex items-center rounded-md bg-primary/[0.09] px-2 py-0.5 text-[11px] font-semibold text-primary"
                                >
                                  {interest}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {lead_email && (
                        <div className="border-t border-border/40 pt-3">
                          <span className="font-heading text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                            Contacto
                          </span>
                          <p className="mt-1 truncate text-[12px] font-medium text-info">
                            {lead_email}
                          </p>
                        </div>
                      )}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            )}

            {/* AI summary block */}
            <section
              className="flex-none border-b border-border/60 px-5 py-3"
              aria-label="Resumen de IA"
            >
              <div className="mb-2 flex items-center gap-2">
                <span className="font-heading text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  Resumen IA
                </span>
                {summaryStaleness && !isRefreshing && (
                  <span className="min-w-0 truncate font-mono text-[10px] text-muted-foreground/70">
                    {summaryStaleness}
                  </span>
                )}
                <button
                  onClick={handleRefreshClick}
                  disabled={isRefreshing}
                  className={cn(
                    "ml-auto inline-flex flex-none items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/[0.06] px-2.5 py-1 font-heading text-[10px] font-semibold text-primary",
                    "transition-[background-color,border-color,opacity] duration-200 ease-out",
                    "hover:bg-primary/[0.12] hover:border-primary/50",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-1 focus-visible:ring-offset-background",
                    "disabled:cursor-not-allowed disabled:opacity-60",
                  )}
                  aria-label={hasSummary ? "Regenerar resumen" : "Generar resumen"}
                >
                  {isRefreshing ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Sparkles className="h-3 w-3" />
                  )}
                  {hasSummary ? "Regenerar" : "Generar"}
                </button>
              </div>

              {isRefreshing ? (
                <AnalyzingPlaceholder />
              ) : hasSummary ? (
                <p
                  key={ai_summary /* re-mount to fade-in on refresh */}
                  className="animate-in fade-in slide-in-from-bottom-1 duration-300 text-[13px] leading-relaxed text-foreground/85"
                >
                  {ai_summary}
                </p>
              ) : (
                <div className="flex items-center gap-2.5 rounded-lg border border-dashed border-border/60 bg-muted/20 px-3 py-2.5">
                  <Bot className="h-4 w-4 flex-none text-muted-foreground/40" aria-hidden="true" />
                  <p className="text-[12px] text-muted-foreground/70">
                    Sin resumen aún. Genera uno para ver el contexto al instante.
                  </p>
                </div>
              )}
            </section>

            {/* Chat — protagonista */}
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="flex flex-none items-center justify-between px-5 pb-2 pt-3">
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
                <div className="px-5 pb-4">
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
                    <div className="flex min-h-[120px] items-center justify-center rounded-xl border border-dashed border-border/60 text-center">
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
            </div>

            {/* Composer — fixed bottom */}
            {isCompleted ? (
              <div className="flex-none border-t border-border/60 bg-violet-50/60 px-5 py-3 dark:bg-violet-950/30">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-300/60 bg-white px-3 py-1 text-[11px] font-medium text-violet-800 dark:border-violet-800/60 dark:bg-violet-950/60 dark:text-violet-200">
                  <CheckCircle2 className="h-3 w-3" />
                  Conversación completada · Reabre para responder
                </span>
              </div>
            ) : canReply ? (
              <div className="flex-none border-t border-border/60 bg-card/95 px-4 py-3">
                <div className="flex items-end gap-2 rounded-xl border border-border/60 bg-background px-3 py-2 transition-colors duration-150 focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/20">
                  <AutoResizeTextarea
                    ref={textareaRef}
                    minRows={1}
                    maxRows={4}
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
          </div>
        </SheetContent>
      </Sheet>

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
    </>
  );
}
