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
import { getPublicBotConfig } from "@/app/lib/services/botConfigService";
import { botService } from "@/app/lib/services/botService";
import { TokenManager } from "@/app/lib/services/authService";
import { API_URL } from "@/app/lib/config";

// Helper para determinar si un color es claro u oscuro
function isLightColor(hexColor: string) {
  const hex = hexColor.replace("#", "");
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  // Fórmula de luminosidad relativa (YIQ)
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
  } = props;
  const [botName, setBotName] = React.useState<string | undefined>(undefined);
  const [isBotActive, setIsBotActive] = React.useState(true);
  const [inputPh, setInputPh] = React.useState<string>("Escribe tu mensaje...");
  const [logoUrl, setLogoUrl] = React.useState<string | undefined>(undefined);
  const [isThemeLight, setIsThemeLight] = React.useState(false);

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

  const { data: cfg } = useSWR("chat-bot-config", getPublicBotConfig);
  useEffect(() => {
    if (cfg) {
      setBotName(cfg.bot_name || undefined);
      setInputPh(cfg.input_placeholder || "Escribe tu mensaje...");
      setLogoUrl(`${API_URL}/assets/logo`);
      if (cfg.theme_color) {
        try {
          setIsThemeLight(isLightColor(cfg.theme_color));
          document.documentElement.style.setProperty(
            "--brand-color",
            cfg.theme_color,
          );
        } catch { }
      }
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
    <div className="flex flex-col h-full w-full bg-gradient-to-br from-gray-50 via-white to-gray-50 rounded-2xl shadow-2xl overflow-hidden animate-slide-in">
      <div className="shadow-lg bg-brand">
        <div className="px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="relative w-10 h-10 bg-white/20 hover:bg-white/30 transition-colors rounded-xl flex items-center justify-center overflow-hidden">
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
              <h1 className="text-xl font-bold text-white">
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
                className="ml-3 p-2 rounded-lg bg-white/20 hover:bg-white/30 text-white transition-colors"
              >
                <Trash className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
        <div className="h-1 bg-white/30"></div>
      </div>

      <div
        className="flex-1 overflow-y-auto overflow-x-hidden overscroll-contain p-4 flex flex-col space-y-5"
        ref={messageContainerRef}
      >
        {messages.length === 0 ? (
          <EmptyState onSubmit={handleSendMessage} />
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

      <div className="border-t bg-gradient-to-r from-gray-50 to-white p-4">
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
            className="shrink-0 w-10 h-10 rounded-full text-white shadow-md transition-all duration-200 hover:scale-105 active:scale-95 bg-brand"
          >
            <ArrowUp className="h-5 w-5 text-white" />
          </Button>
        </div>
      </div>
    </div>
  );
}
