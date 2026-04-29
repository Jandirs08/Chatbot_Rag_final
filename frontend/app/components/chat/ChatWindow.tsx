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
import { ArrowUp, MessageCircle, Trash } from "lucide-react";
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
  if (!a.createdAt || !b.createdAt) return true;
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
}) {
  const messageContainerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const [input, setInput] = React.useState("");
  const [confirmClearOpen, setConfirmClearOpen] = React.useState(false);
  const [leadName, setLeadName] = React.useState("");
  const [leadEmail, setLeadEmail] = React.useState("");
  const [leadSubmitting, setLeadSubmitting] = React.useState(false);
  const [leadSubmitted, setLeadSubmitted] = React.useState(false);

  const {
    placeholder,
    titleText = "An LLM",
    conversationId,
    initialMessages,
    chatHook,
    onNewChat,
    variant = "default",
  } = props;
  const { botName, isThemeLight, inputPlaceholder, starters, cfg } = usePublicBotConfig();
  const [isBotActive, setIsBotActive] = React.useState(true);
  const [logoUrl, setLogoUrl] = React.useState<string | undefined>(undefined);
  const isPlayground = variant === "playground";

  const internalHook = useChatStream(conversationId, initialMessages);
  const { messages, isLoading, sendMessage, clearMessages, cancelStream, convMode, showLeadForm, submitLead } =
    chatHook ?? internalHook;

  // --- Smart auto-scroll ---
  const isNearBottomRef = React.useRef(true);

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
    isNearBottomRef.current = scrollHeight - scrollTop - clientHeight < 120;
  }, []);

  useEffect(() => {
    if (isNearBottomRef.current) {
      scrollToBottom(isLoading);
    }
  }, [messages, isLoading, scrollToBottom]);

  useEffect(() => {
    if (!isLoading && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isLoading]);

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
    if (!leadName.trim() || !leadEmail.trim()) return;
    setLeadSubmitting(true);
    await submitLead(leadName.trim(), leadEmail.trim());
    setLeadSubmitted(true);
    setLeadSubmitting(false);
  };

  const handleSendMessage = async (message?: string) => {
    const messageValue = message ?? input;
    if (messageValue.trim() === "") return;
    setInput("");
    if (inputRef.current && !isLoading) {
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
          : "animate-slide-in rounded-2xl bg-[#f7f8fa] shadow-2xl",
      )}
    >
      <div className={cn(isPlayground ? "border-b border-border/60 bg-brand" : "shadow-sm bg-brand")}>
        <div className={cn("px-6 py-4", isPlayground && "px-4 py-3")}>
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
              <h1 className={cn("text-white truncate", isPlayground ? "text-base font-semibold" : "text-xl font-semibold tracking-tight")}>
                {botName ?? "Asistente"}
              </h1>
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
          isPlayground ? "bg-surface/80 px-3 py-3" : "px-5 pt-5 pb-3",
        )}
        ref={messageContainerRef}
        onScroll={handleContainerScroll}
        aria-live="polite"
        aria-relevant="additions text"
      >
        {messages.length === 0 ? (
          <EmptyState onSubmit={handleSendMessage} variant={variant} botName={botName} starters={starters} />
        ) : (
          messages.map((message, i) => {
            const isUser = message.role === "user";
            const prev = messages[i - 1];
            const next = messages[i + 1];
            const groupedWithPrev = isGroupedWith(message, prev);
            const groupedWithNext = isGroupedWith(message, next);
            const showTimestamp = !groupedWithNext;
            const showAvatar = !groupedWithNext;
            return (
              <div
                key={message.id}
                className={cn(
                  "flex",
                  isUser ? "justify-end" : "justify-start",
                  i === 0 ? "" : groupedWithPrev ? "mt-1" : "mt-5",
                )}
              >
                <ChatMessageBubble
                  message={message}
                  isMostRecent={i === messages.length - 1}
                  messageCompleted={!isLoading || i !== messages.length - 1}
                  botName={botName}
                  showTimestamp={showTimestamp}
                  showAvatar={showAvatar}
                  logoUrl={logoUrl}
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
      </div>

      {convMode === "human" && (
        <div className="flex items-center justify-center gap-2 border-t border-emerald-100 bg-emerald-50 px-4 py-2 text-[12px] font-medium text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-400">
          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          Conectado con un asesor
        </div>
      )}
      {showLeadForm && !leadSubmitted && (
        <div className="border-t border-blue-100 bg-blue-50 px-4 py-3 dark:border-blue-900/40 dark:bg-blue-950/30">
          <p className="mb-2 text-[12px] font-medium text-blue-700 dark:text-blue-400">
            Deja tus datos para que un asesor te contacte
          </p>
          <div className="flex flex-col gap-2">
            <input
              type="text"
              value={leadName}
              onChange={(e) => setLeadName(e.target.value)}
              placeholder="Tu nombre"
              className="rounded-lg border border-blue-200 bg-white px-3 py-1.5 text-[13px] placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-400 dark:bg-slate-900 dark:border-blue-800"
            />
            <input
              type="email"
              value={leadEmail}
              onChange={(e) => setLeadEmail(e.target.value)}
              placeholder="Tu correo electrónico"
              className="rounded-lg border border-blue-200 bg-white px-3 py-1.5 text-[13px] placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-400 dark:bg-slate-900 dark:border-blue-800"
            />
            <button
              onClick={handleLeadSubmit}
              disabled={leadSubmitting || !leadName.trim() || !leadEmail.trim()}
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-[13px] font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {leadSubmitting ? "Enviando…" : "Enviar"}
            </button>
          </div>
        </div>
      )}
      {showLeadForm && leadSubmitted && (
        <div className="flex items-center justify-center gap-2 border-t border-blue-100 bg-blue-50 px-4 py-2 text-[12px] font-medium text-blue-700 dark:border-blue-900/40 dark:bg-blue-950/30 dark:text-blue-400">
          <span className="h-2 w-2 rounded-full bg-blue-500" />
          Datos recibidos. Un asesor te contactará pronto.
        </div>
      )}
      <div
        className={cn(
          isPlayground ? "bg-card px-3 py-3 border-t" : "bg-[#f7f8fa] px-4 pb-5 pt-2",
        )}
      >
        <div
          className={cn(
            "flex items-end gap-3",
            isPlayground
              ? ""
              : "rounded-2xl border border-slate-200 bg-white px-4 py-3 transition-shadow focus-within:border-slate-300 focus-within:shadow-sm",
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
              "flex-1 min-h-[44px] px-2 py-2.5 resize-none border-0 bg-transparent text-[15px] text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-0 leading-relaxed",
              isPlayground && "flex-1",
            )}
            disabled={isLoading}
            autoFocus
          />
          <Button
            onClick={() => handleSendMessage()}
            disabled={isLoading || input.trim() === ""}
            size="icon"
            className={cn(
              "shrink-0 bg-brand text-brand-foreground transition-opacity hover:opacity-90 disabled:opacity-40",
              isPlayground
                ? "h-11 w-11 rounded-2xl"
                : "h-9 w-9 rounded-xl",
            )}
          >
            <ArrowUp className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
