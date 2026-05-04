"use client";

import React, { useRef, useEffect } from "react";
import Image from "next/image";
import { EmptyState } from "./EmptyState";
import { ChatMessageBubble, TypingIndicator } from "./ChatMessageBubble";
import { AutoResizeTextarea } from "@/app/components/ui/AutoResizeTextarea";
import { Button } from "@/app/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/app/components/ui/alert-dialog";
import { ArrowDown, ArrowUp, MessageCircle, Trash } from "lucide-react";
import { useChatStream, type UseChatStreamReturn } from "@/app/hooks/useChatStream";
import { usePublicBotConfig } from "@/app/hooks/usePublicBotConfig";
import { botService } from "@/app/lib/services/botService";
import { TokenManager } from "@/app/lib/services/authService";
import { API_URL } from "@/app/lib/config";
import { cn } from "@/lib/utils";

const TIMESTAMP_GROUP_MS = 5 * 60 * 1000;

function isGroupedWith(a?: { role?: string; createdAt?: Date }, b?: { role?: string; createdAt?: Date }) {
  if (!a || !b) return false;
  if (a.role !== b.role) return false;
  // Sin timestamps reales no agrupamos — evita esconder avatar/timestamp por
  // datos faltantes en historial migrado.
  if (!a.createdAt || !b.createdAt) return false;
  const ta = new Date(a.createdAt).getTime();
  const tb = new Date(b.createdAt).getTime();
  return Math.abs(tb - ta) < TIMESTAMP_GROUP_MS;
}

export function ChatWindow(props: {
  placeholder?: string;
  titleText?: string;
  conversationId: string;
  initialMessages?: import("@/types/chat").Message[];
  /** Inject an external hook result (e.g. useDebugStream) instead of the internal useChatStream. */
  chatHook?: UseChatStreamReturn;
  onNewChat?: () => void;
  variant?: "default" | "playground";
  isLoadingHistory?: boolean;
}) {
  const messageContainerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const leadNameRef = useRef<HTMLInputElement | null>(null);
  const prevShowLeadFormRef = useRef(false);
  const [input, setInput] = React.useState("");
  const [confirmClearOpen, setConfirmClearOpen] = React.useState(false);
  const [leadName, setLeadName] = React.useState("");
  const [leadEmail, setLeadEmail] = React.useState("");
  const [leadSubmitting, setLeadSubmitting] = React.useState(false);
  const [leadError, setLeadError] = React.useState<string | null>(null);

  const EMAIL_REGEX = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
  const isLeadEmailValid = EMAIL_REGEX.test(leadEmail.trim());
  const isLeadFormValid = leadName.trim().length > 0 && isLeadEmailValid;

  const {
    placeholder,
    titleText = "An LLM",
    conversationId,
    initialMessages,
    chatHook,
    onNewChat,
    variant = "default",
    isLoadingHistory = false,
  } = props;
  const { botName, isThemeLight, inputPlaceholder, starters, cfg } = usePublicBotConfig();
  const [isBotActive, setIsBotActive] = React.useState(true);
  const [logoUrl, setLogoUrl] = React.useState<string | undefined>(undefined);
  const isPlayground = variant === "playground";

  const internalHook = useChatStream(conversationId, initialMessages);
  const { messages, isLoading, sendMessage, clearMessages, cancelStream, convMode, showLeadForm, submitLead } =
    chatHook ?? internalHook;

  // Tracks the count of messages already present on first paint (history)
  // so we can skip the slide-up animation for those — only NEW messages
  // and streaming responses should animate in.
  const initialCountRef = React.useRef<number>(messages.length);
  React.useEffect(() => {
    initialCountRef.current = messages.length;
    // Run only once on mount; intentionally no deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Smart auto-scroll ---
  const isNearBottomRef = React.useRef(true);
  const [showJumpToBottom, setShowJumpToBottom] = React.useState(false);

  const scrollToBottom = React.useCallback((instant = false) => {
    if (messageContainerRef.current) {
      messageContainerRef.current.scrollTo({
        top: messageContainerRef.current.scrollHeight,
        behavior: instant ? "instant" : "smooth",
      });
    }
  }, []);

  const handleContainerScroll = React.useCallback(() => {
    if (!messageContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = messageContainerRef.current;
    const near = scrollHeight - scrollTop - clientHeight < 120;
    isNearBottomRef.current = near;
    setShowJumpToBottom(!near);
  }, []);

  useEffect(() => {
    if (isNearBottomRef.current) {
      scrollToBottom(isLoading);
    }
  }, [messages, isLoading, scrollToBottom]);

  useEffect(() => {
    if (!isLoading && inputRef.current && !showLeadForm) {
      inputRef.current.focus();
    }
  }, [isLoading, showLeadForm]);

  useEffect(() => {
    const wasOpen = prevShowLeadFormRef.current;
    if (showLeadForm && !wasOpen) {
      leadNameRef.current?.focus();
    } else if (!showLeadForm && wasOpen) {
      inputRef.current?.focus();
    }
    prevShowLeadFormRef.current = showLeadForm;
  }, [showLeadForm]);

  useEffect(() => {
    if (cfg) {
      setLogoUrl(`${API_URL}/assets/logo`);
    }
  }, [cfg]);

  useEffect(() => {
    (async () => {
      try {
        if (TokenManager.isTokenValid()) {
          const state = await botService.getState();
          setIsBotActive(state.is_active);
        }
      } catch (_e) { }
    })();
  }, []);

  const handleLeadSubmit = async () => {
    if (!leadName.trim()) return;
    if (!EMAIL_REGEX.test(leadEmail.trim())) {
      setLeadError("Correo inválido");
      return;
    }
    setLeadError(null);
    setLeadSubmitting(true);
    await submitLead(leadName.trim(), leadEmail.trim());
    setLeadSubmitting(false);
  };

  const handleSendMessage = async (message?: string) => {
    const messageValue = message ?? input;
    if (messageValue.trim() === "") return;
    // No limpiar el input si hay un stream en curso — sendMessage lo descarta
    // y el usuario perdería su texto silenciosamente.
    if (isLoading) return;
    setInput("");
    if (inputRef.current) {
      inputRef.current.focus();
    }
    await sendMessage(messageValue);
  };

  const handleClearConfirmed = () => {
    clearMessages();
    if (typeof onNewChat === "function") {
      onNewChat();
    }
    setConfirmClearOpen(false);
  };

  return (
    <div
      className={cn(
        "flex h-full w-full flex-col overflow-hidden",
        isPlayground
          ? "rounded-[22px] border border-border/60 bg-card shadow-none"
          : "animate-slide-in rounded-2xl bg-surface shadow-2xl",
      )}
    >
      <div className={cn(isPlayground ? "border-b border-border/60 bg-brand" : "shadow-md bg-brand relative overflow-hidden border-b border-black/[0.06]")}>
        {!isPlayground && (
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.08]"
            style={{
              background:
                "radial-gradient(circle at top right, rgba(255,255,255,0.6) 0%, transparent 55%)",
            }}
            aria-hidden="true"
          />
        )}
        <div className={cn("relative z-10 mx-auto w-full max-w-3xl px-6 py-4", isPlayground && "px-4 py-3")}>
          <div className="flex items-center gap-3">
            <div
              className={cn(
                "relative flex items-center justify-center overflow-hidden rounded-xl bg-white/15",
                isPlayground ? "h-10 w-10 rounded-2xl" : "h-10 w-10",
              )}
            >
              {logoUrl ? (
                <Image
                  src={logoUrl}
                  alt="logo"
                  width={40}
                  height={40}
                  className="w-full h-full object-cover"
                  onError={() => setLogoUrl(undefined)}
                  unoptimized
                />
              ) : (
                <MessageCircle className="w-6 h-6 text-white" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/70">
                {titleText}
              </div>
              <div className="flex items-center gap-2">
                <h1 className={cn("text-white truncate", isPlayground ? "text-base font-semibold" : "text-xl font-semibold tracking-tight")}>
                  {botName ?? "Asistente"}
                </h1>
                {isBotActive && (
                  <span
                    className="relative flex h-2 w-2 shrink-0"
                    aria-label="En línea"
                    title="En línea"
                  >
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400 ring-2 ring-emerald-400/30" />
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {!isBotActive && (
                <div
                  className={cn(
                    "px-2.5 py-1 rounded-full flex items-center gap-2",
                    isThemeLight
                      ? "bg-slate-900/90 text-white"
                      : "bg-white/90 text-slate-800",
                  )}
                >
                  <div className="w-2 h-2 rounded-full bg-amber-400" />
                  <div className="text-xs font-semibold">En pausa</div>
                </div>
              )}
              <AlertDialog open={confirmClearOpen} onOpenChange={setConfirmClearOpen}>
                <AlertDialogTrigger asChild>
                  <button
                    aria-label="Limpiar chat"
                    title="Limpiar chat"
                    className={cn(
                      "ml-1 p-2 text-white transition-colors",
                      isPlayground
                        ? "rounded-xl bg-white/15 hover:bg-white/25"
                        : "rounded-lg bg-white/15 hover:bg-white/25",
                    )}
                  >
                    <Trash className="w-4 h-4" />
                  </button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>¿Limpiar conversación?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Se borrarán todos los mensajes de este hilo. Esta acción no se puede deshacer.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleClearConfirmed}
                      className="bg-red-600 hover:bg-red-700 text-white"
                    >
                      Limpiar
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        </div>
      </div>

      <div
        className={cn(
          "flex flex-1 flex-col overflow-y-auto overflow-x-hidden overscroll-contain",
          isPlayground ? "bg-surface/80 px-3 py-3" : "bg-surface px-4 pt-5 pb-3 sm:px-5",
        )}
        ref={messageContainerRef}
        onScroll={handleContainerScroll}
        aria-live="polite"
        aria-relevant="additions text"
      >
        <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col">
        {messages.length === 0 && isLoadingHistory ? (
          <div className="flex h-full flex-col gap-4 px-1 py-2" aria-hidden="true">
            <div className="flex items-end gap-2">
              <div className="h-7 w-7 shrink-0 rounded-full skeleton-shimmer" />
              <div className="h-10 w-2/3 rounded-2xl rounded-bl-md skeleton-shimmer" />
            </div>
            <div className="flex justify-end">
              <div className="h-10 w-1/2 rounded-2xl rounded-br-md skeleton-shimmer" />
            </div>
            <div className="flex items-end gap-2">
              <div className="h-7 w-7 shrink-0 rounded-full skeleton-shimmer" />
              <div className="h-16 w-3/4 rounded-2xl rounded-bl-md skeleton-shimmer" />
            </div>
          </div>
        ) : messages.length === 0 ? (
          <EmptyState onSubmit={handleSendMessage} variant={variant} botName={botName} starters={starters} logoUrl={logoUrl} />
        ) : (
          messages.map((message, i) => {
            const isUser = message.role === "user";
            const prev = messages[i - 1];
            const next = messages[i + 1];
            const groupedWithPrev = isGroupedWith(message, prev);
            const groupedWithNext = isGroupedWith(message, next);
            const showTimestamp = !groupedWithNext;
            const showAvatar = !groupedWithNext;
            const isLast = i === messages.length - 1;
            // Skip entry animation for: history items already present at mount,
            // and the streaming assistant message replacing the typing indicator
            // (avoid double-pop when typing indicator fades into bubble).
            const isStreamingAssistant = isLast && isLoading && !isUser;
            const animateEntry =
              i >= initialCountRef.current && !isStreamingAssistant;
            return (
              <div
                key={message.id}
                className={cn(
                  "flex",
                  isUser ? "justify-end" : "justify-start",
                  i === 0 ? "" : groupedWithPrev ? "mt-1.5" : "mt-5",
                )}
              >
                <ChatMessageBubble
                  message={message}
                  isMostRecent={isLast}
                  messageCompleted={!isLoading || !isLast}
                  botName={botName}
                  showTimestamp={showTimestamp}
                  showAvatar={showAvatar}
                  logoUrl={logoUrl}
                  animateEntry={animateEntry}
                />
              </div>
            );
          })
        )}
        {(() => {
          const last = messages[messages.length - 1];
          const lastIsAssistantWithContent =
            !!last &&
            last.role === "assistant" &&
            typeof last.content === "string" &&
            last.content.length > 0;
          const showTyping = isLoading && !lastIsAssistantWithContent;
          return showTyping ? (
            <div className={cn("flex justify-start", messages.length > 0 && "mt-5")}>
              <TypingIndicator logoUrl={logoUrl} />
            </div>
          ) : null;
        })()}

        {showJumpToBottom && messages.length > 0 && (
          <button
            type="button"
            onClick={() => scrollToBottom(false)}
            aria-label="Ir al final"
            className="sticky bottom-2 ml-auto flex h-9 w-9 items-center justify-center rounded-full bg-surface-elevated text-foreground ring-1 ring-black/[0.08] shadow-[0_4px_12px_-4px_rgb(0_0_0_/_0.18)] transition-all hover:scale-[1.06] hover:shadow-[0_6px_16px_-4px_rgb(0_0_0_/_0.25)] active:scale-95 animate-fadeIn"
          >
            <ArrowDown className="h-4 w-4" />
          </button>
        )}
        </div>
      </div>

      {convMode === "human" && (
        <div
          role="status"
          aria-live="polite"
          className="border-t border-emerald-100 bg-emerald-50 px-4 py-2 text-[12px] font-medium text-emerald-700"
        >
          <div className="mx-auto flex w-full max-w-3xl items-center justify-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" aria-hidden="true" />
            Conectado con un asesor
          </div>
        </div>
      )}
      {showLeadForm && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (isLeadFormValid && !leadSubmitting) handleLeadSubmit();
          }}
          aria-label="Formulario de contacto con asesor"
          className="border-t border-border bg-muted/40 px-4 py-3"
        >
          <div className="mx-auto w-full max-w-3xl">
          <p id="lead-form-title" className="mb-2 text-[12px] font-medium text-foreground">
            Deja tus datos para que un asesor te contacte
          </p>
          <div className="flex flex-col gap-2">
            <label htmlFor="lead-name" className="sr-only">Nombre</label>
            <input
              id="lead-name"
              ref={leadNameRef}
              type="text"
              autoComplete="name"
              value={leadName}
              onChange={(e) => setLeadName(e.target.value)}
              placeholder="Tu nombre"
              className="rounded-lg border border-border bg-surface-elevated px-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground/70 focus:border-ring/50 focus:outline-none focus:ring-2 focus:ring-ring/20"
            />
            <label htmlFor="lead-email" className="sr-only">Correo electrónico</label>
            <input
              id="lead-email"
              type="email"
              autoComplete="email"
              inputMode="email"
              aria-invalid={!!leadError}
              aria-describedby={leadError ? "lead-email-error" : undefined}
              value={leadEmail}
              onChange={(e) => {
                setLeadEmail(e.target.value);
                if (leadError) setLeadError(null);
              }}
              placeholder="Tu correo electrónico"
              className="rounded-lg border border-border bg-surface-elevated px-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground/70 focus:border-ring/50 focus:outline-none focus:ring-2 focus:ring-ring/20"
            />
            {leadError && (
              <p
                id="lead-email-error"
                role="alert"
                aria-live="polite"
                className="text-[12px] font-medium text-destructive"
              >
                {leadError}
              </p>
            )}
            <button
              type="submit"
              disabled={leadSubmitting || !isLeadFormValid}
              className="rounded-lg bg-brand px-3 py-2 text-[13px] font-medium text-brand-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {leadSubmitting ? "Enviando…" : "Enviar"}
            </button>
          </div>
          </div>
        </form>
      )}
      <div
        className={cn(
          isPlayground
            ? "bg-card px-3 py-3 border-t"
            : "bg-surface px-3 pt-2 pb-3 pb-safe sm:px-4",
        )}
      >
        <div
          className={cn(
            "mx-auto flex w-full max-w-3xl items-end gap-2",
            isPlayground
              ? ""
              : "rounded-2xl border border-border bg-surface-elevated px-3 py-2 shadow-sm transition-all focus-within:border-ring/50 focus-within:ring-2 focus-within:ring-ring/20 sm:px-4 sm:py-3",
          )}
        >
          <AutoResizeTextarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
              }
            }}
            placeholder={placeholder ?? inputPlaceholder}
            className={cn(
              "flex-1 min-h-[44px] resize-none border-0 bg-transparent px-1 py-2 text-[15px] leading-[1.5] text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:ring-0",
              isPlayground && "flex-1",
            )}
            disabled={isLoading}
            autoFocus
          />
          <Button
            onClick={() => handleSendMessage()}
            disabled={isLoading || input.trim() === ""}
            size="icon"
            aria-label="Enviar mensaje"
            className={cn(
              "shrink-0 bg-brand text-brand-foreground shadow-[0_3px_10px_-3px_hsl(var(--primary)/0.45)] transition-all hover:shadow-[0_5px_16px_-4px_hsl(var(--primary)/0.55)] hover:scale-[1.05] active:scale-95 focus-visible:ring-2 focus-visible:ring-brand/50 focus-visible:ring-offset-2 disabled:opacity-40 disabled:hover:scale-100 disabled:shadow-sm",
              isPlayground
                ? "h-11 w-11 rounded-2xl"
                : "h-10 w-10 rounded-xl",
            )}
          >
            <ArrowUp className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
