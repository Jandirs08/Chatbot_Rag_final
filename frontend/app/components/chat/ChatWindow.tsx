"use client";

import React, { useRef, useEffect } from "react";
import Image from "next/image";
import { EmptyState } from "./EmptyState";
import { ChatMessageBubble, TypingIndicator } from "./ChatMessageBubble";
import { AutoResizeTextarea } from "@/app/components/ui/AutoResizeTextarea";
import { Button } from "@/app/components/ui/button";
import { ArrowUp, MessageCircle, Trash } from "lucide-react";
import { useChatStream } from "@/app/hooks/useChatStream";
import { usePublicBotConfig } from "@/app/hooks/usePublicBotConfig";
import { botService } from "@/app/lib/services/botService";
import { TokenManager } from "@/app/lib/services/authService";
import { API_URL } from "@/app/lib/config";
import type { DebugData } from "@/app/components/debug/utils";
import { cn } from "@/lib/utils";

export function ChatWindow(props: {
  placeholder?: string;
  titleText?: string;
  conversationId: string;
  initialMessages?: import("@/types/chat").Message[];
  forceDebug?: boolean;
  enableVerification?: boolean;
  onDebugData?: (data: DebugData | null | undefined) => void;
  onNewChat?: () => void;
  variant?: "default" | "playground";
}) {
  const messageContainerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const [input, setInput] = React.useState("");
  const [showPulse, setShowPulse] = React.useState(false);
  const idleTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const {
    placeholder,
    titleText = "An LLM",
    conversationId,
    initialMessages,
    forceDebug = false,
    enableVerification = false,
    onDebugData,
    onNewChat,
    variant = "default",
  } = props;
  const { botName, isThemeLight, inputPlaceholder, starters, cfg } = usePublicBotConfig();
  const [isBotActive, setIsBotActive] = React.useState(true);
  const [logoUrl, setLogoUrl] = React.useState<string | undefined>(undefined);
  const isPlayground = variant === "playground";

  const { messages, isLoading, debugData, sendMessage, clearMessages, cancelStream } =
    useChatStream(conversationId, initialMessages);

  // --- Smart auto-scroll ---
  // Only auto-scroll if user is near the bottom (hasn't scrolled up to read).
  // Use "instant" during streaming to avoid animation overhead from batched
  // rAF flushes, and "smooth" for discrete events like new user messages.
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

  const resetIdle = React.useCallback(() => {
    setShowPulse(false);
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
    idleTimerRef.current = setTimeout(() => {
      setShowPulse(true);
    }, 30000);
  }, []);

  useEffect(() => {
    resetIdle();
  }, [messages, input, resetIdle]);

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

  useEffect(() => {
    if (typeof onDebugData === "function") {
      onDebugData(debugData);
    }
  }, [debugData, onDebugData]);

  const handleSendMessage = async (message?: string) => {
    if (messageContainerRef.current) {
      messageContainerRef.current.classList.add("grow");
    }
    const messageValue = message ?? input;
    if (messageValue.trim() === "") return;
    setInput("");
    if (inputRef.current && !isLoading) {
      inputRef.current.focus();
    }
    await sendMessage(messageValue, {
      debug: forceDebug,
      body: { enable_verification: enableVerification },
    });
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
      <div className={cn(isPlayground ? "border-b border-border/60 bg-brand" : "shadow-lg bg-brand")}>
        <div className={cn("px-6 py-4", isPlayground && "px-4 py-3")}>
          <div className="flex items-center gap-3">
            <div
              className={cn(
                "relative flex items-center justify-center overflow-hidden rounded-xl bg-white/20 transition-colors hover:bg-white/30",
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
              {showPulse && <span className="absolute inset-0 rounded-xl attention-pulse pointer-events-none" />}
            </div>
            <div className="flex-1">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/70">
                {titleText}
              </div>
              <h1 className={cn("text-white", isPlayground ? "text-base font-semibold" : "text-xl font-bold")}>
                {botName ?? "Asistente"}
              </h1>
            </div>
            <div className="flex items-center gap-2">
              <div
                className={`px-2 py-1 rounded-full flex items-center gap-2 transition-colors ${
                  isThemeLight
                    ? "bg-slate-900/90 text-white"
                    : "bg-white/90 text-slate-800"
                }`}
              >
                <div
                  className={`w-2.5 h-2.5 rounded-full ${
                    isBotActive ? "bg-emerald-500" : "bg-gray-400"
                  }`}
                ></div>
                <div className="text-xs font-semibold">
                  {isBotActive ? "Estado: Activo" : "Estado: En Pausa"}
                </div>
              </div>
              <button
                aria-label="Limpiar chat"
                title="Limpiar chat"
                onClick={() => {
                  clearMessages();
                  if (typeof onNewChat === "function") {
                    onNewChat();
                  }
                  resetIdle();
                }}
                className={cn(
                  "ml-1 p-2 text-white transition-colors",
                  isPlayground
                    ? "rounded-xl bg-white/16 hover:bg-white/24"
                    : "rounded-lg bg-white/20 hover:bg-white/30",
                )}
              >
                <Trash className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
        <div className="h-1 bg-white/30"></div>
      </div>

      <div
        className={cn(
          "flex flex-1 flex-col overflow-y-auto overflow-x-hidden overscroll-contain",
          isPlayground ? "bg-surface/80 px-3 py-3 space-y-3" : "px-5 pt-5 pb-3 space-y-2.5",
        )}
        ref={messageContainerRef}
        onScroll={handleContainerScroll}
      >
        {messages.length === 0 ? (
          <EmptyState onSubmit={handleSendMessage} variant={variant} botName={botName} starters={starters} />
        ) : (
          messages.map((message, i) => {
            const isUser = message.role === "user";
            return (
              <div
                key={message.id}
                className={`flex ${isUser ? "justify-end" : "justify-start"}`}
              >
                <ChatMessageBubble
                  message={message}
                  aiEmoji="🤖"
                  isMostRecent={i === messages.length - 1}
                  messageCompleted={!isLoading || i !== messages.length - 1}
                  botName={botName}
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
            <div className="flex justify-start">
              <TypingIndicator />
            </div>
          ) : null;
        })()}
      </div>

      {/* Input flotante estilo ChatGPT */}
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
              : "rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-[0_4px_24px_0_rgba(0,0,0,0.08)] ring-1 ring-slate-100 transition-shadow focus-within:shadow-[0_4px_32px_0_rgba(59,130,246,0.15)] focus-within:ring-blue-200",
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
              "flex-1 min-h-[44px] px-2 py-2.5 resize-none border-0 bg-transparent text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-0 leading-relaxed",
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
              "shrink-0 transition-all duration-200 hover:scale-105 active:scale-95 bg-brand text-white",
              isPlayground
                ? "h-11 w-11 rounded-2xl shadow-sm"
                : "h-9 w-9 rounded-xl shadow-sm",
            )}
          >
            <ArrowUp className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
