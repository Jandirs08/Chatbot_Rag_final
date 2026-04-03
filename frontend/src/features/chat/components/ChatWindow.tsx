"use client";

import React, { useRef, useEffect } from "react";
import useSWR from "swr";
import Image from "next/image";
import { EmptyState } from "./EmptyState";
import { ChatMessageBubble, TypingIndicator } from "./ChatMessageBubble";
import { AutoResizeTextarea } from "@/shared/components/ui/AutoResizeTextarea";
import { Button } from "@/app/components/ui/button";
import { ArrowUp, MessageCircle, Trash } from "lucide-react";
import { useChatStream } from "@/app/hooks/useChatStream";
import { botService } from "@/app/lib/services/botService";
import { TokenManager } from "@/app/lib/services/authService";
import { API_URL } from "@/app/lib/config";
import { getPublicBotConfig } from "@/app/lib/services/botConfigService";
import { cn } from "@/lib/utils";

function isLightColor(hexColor: string) {
  const hex = hexColor.replace("#", "");
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 128;
}

export function ChatWindow(props: {
  placeholder?: string;
  titleText?: string;
  conversationId: string;
  initialMessages?: import("@/types/chat").Message[];
  forceDebug?: boolean;
  enableVerification?: boolean;
  onDebugData?: (data: any) => void;
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
  const [botName, setBotName] = React.useState<string | undefined>(undefined);
  const [isBotActive, setIsBotActive] = React.useState(true);
  const [inputPh, setInputPh] = React.useState<string>("Escribe tu mensaje...");
  const [logoUrl, setLogoUrl] = React.useState<string | undefined>(undefined);
  const isPlayground = variant === "playground";

  const { messages, isLoading, debugData, sendMessage, clearMessages } =
    useChatStream(conversationId, initialMessages);

  const scrollToBottom = () => {
    if (messageContainerRef.current) {
      const scrollContainer = messageContainerRef.current;
      scrollContainer.scrollTo({
        top: scrollContainer.scrollHeight,
        behavior: "smooth",
      });
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const resetIdle = React.useCallback(() => {
    setShowPulse(false);
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current as any);
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

  const { data: cfg } = useSWR("chat-window-config", getPublicBotConfig);
  const [isThemeLight, setIsThemeLight] = React.useState(true);

  useEffect(() => {
    if (cfg) {
      if (cfg.theme_color) {
        try {
          document.documentElement.style.setProperty(
            "--brand-color",
            cfg.theme_color
          );
          setIsThemeLight(isLightColor(cfg.theme_color));
        } catch {}
      }
      setBotName(cfg.bot_name || undefined);
      setInputPh(cfg.input_placeholder || "Escribe tu mensaje...");
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

  const sendInitialQuestion = async (question: string) => {
    await sendMessage(question, {
      debug: forceDebug,
      body: { enable_verification: enableVerification },
    });
  };

  if (!cfg) return null;

  return (
    <div
      className={cn(
        "flex h-full w-full flex-col overflow-hidden",
        isPlayground
          ? "rounded-[22px] border border-border/60 bg-card shadow-none"
          : "animate-slide-in rounded-2xl bg-gradient-to-br from-gray-50 via-white to-gray-50 shadow-2xl",
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
          isPlayground ? "bg-surface/80 px-3 py-3 space-y-4" : "p-4 space-y-5",
        )}
        ref={messageContainerRef}
      >
        {messages.length === 0 ? (
          <EmptyState onSubmit={handleSendMessage} variant={variant} />
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
            (last as any).content &&
            (last as any).content.length > 0;
          const showTyping = isLoading && !lastIsAssistantWithContent;
          return showTyping ? (
            <div className="flex justify-start">
              <TypingIndicator />
            </div>
          ) : null;
        })()}
      </div>

      <div
        className={cn(
          "border-t p-4",
          isPlayground ? "bg-card px-3 py-3" : "bg-gradient-to-r from-gray-50 to-white",
        )}
      >
        <div className="flex items-center gap-3 pb-2">
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
            placeholder={placeholder ?? inputPh}
            className="flex-1"
            disabled={isLoading}
            autoFocus
          />
          <Button
            onClick={() => handleSendMessage()}
            disabled={isLoading || input.trim() === ""}
            size="icon"
            className={cn(
              "shrink-0 text-white transition-all duration-200 hover:scale-105 active:scale-95 bg-brand",
              isPlayground
                ? "h-11 w-11 rounded-2xl shadow-sm"
                : "h-10 w-10 rounded-full shadow-md",
            )}
          >
            <ArrowUp className="h-5 w-5 text-white" />
          </Button>
        </div>
      </div>
    </div>
  );
}
