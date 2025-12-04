"use client";

import React, { useRef, useEffect } from "react";
import useSWR from "swr";
import { EmptyState } from "./EmptyState";
import { ChatMessageBubble } from "./ChatMessageBubble";
import { AutoResizeTextarea } from "@/shared/components/ui/AutoResizeTextarea";
import { Button } from "@/app/components/ui/button";
import { ArrowUp, MessageCircle, Trash } from "lucide-react";
import { useChatStream } from "@/app/hooks/useChatStream";
import { getPublicBotConfig } from "@/app/lib/services/botConfigService";
import { botService } from "@/app/lib/services/botService";
import { TokenManager } from "@/app/lib/services/authService";
import { API_URL } from "@/app/lib/config";

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
          document.documentElement.style.setProperty("--brand-color", cfg.theme_color);
        } catch {}
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
      } catch (_e) {}
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
    <div className="flex flex-col h-full bg-gradient-to-br from-gray-50 via-white to-gray-50">
      <div className="shadow-lg bg-brand">
        <div className="px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center overflow-hidden">
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt="logo"
                  className="w-full h-full object-cover"
                  onError={() => setLogoUrl(undefined)}
                />
              ) : (
                <MessageCircle className="w-6 h-6 text-white" />
              )}
            </div>
            <div className="flex-1">
              <h1 className="text-xl font-bold text-white">
                {botName ?? "Asistente"}
              </h1>
            </div>
            <div className="flex items-center gap-2">
              <div
                className={`w-5 h-5 rounded-full ${isBotActive ? "bg-emerald-500 animate-pulse" : "bg-gray-400"}`}
              ></div>
              <div>
                <div className={`text-sm font-semibold ${isBotActive ? "text-white" : "text-white"}`}>
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

      <div className="flex-1 overflow-y-auto p-4 flex flex-col space-y-4" ref={messageContainerRef}>
        {messages.length === 0 ? (
          <EmptyState onSubmit={handleSendMessage} />
        ) : (
          messages.map((message, i) => {
            const isUser = message.role === "user";
            return (
              <div key={message.id} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
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
          const lastIsAssistantWithContent = !!last && last.role === "assistant" && (last as any).content && (last as any).content.length > 0;
          const showTyping = isLoading && !lastIsAssistantWithContent;
          return showTyping ? (
            <div className="flex justify-start">
              <div className="bg-gray-100 dark:bg-slate-800 rounded-2xl rounded-tl-none p-4 inline-flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-gray-400 dark:bg-slate-500 animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="h-2 w-2 rounded-full bg-gray-400 dark:bg-slate-500 animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="h-2 w-2 rounded-full bg-gray-400 dark:bg-slate-500 animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          ) : null;
        })()}
      </div>

      <div className="border-t bg-gradient-to-r from-gray-50 to-white p-4">
        <div className="flex items-end gap-3 pb-2">
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
            className="flex-1 border-gray-200 rounded-xl"
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
