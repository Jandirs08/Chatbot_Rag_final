"use client";

import React, { useRef, useEffect } from "react";
import { EmptyState } from "../components/EmptyState";
import { ChatMessageBubble } from "../components/ChatMessageBubble";
import { AutoResizeTextarea } from "./AutoResizeTextarea";
import { Button } from "./ui/button";
import { ArrowUp, MessageCircle, Sparkles, Trash } from "lucide-react";
import { useChatStream } from "../hooks/useChatStream";

export function ChatWindow(props: {
  placeholder?: string;
  titleText?: string;
  conversationId: string;
  initialMessages?: import("../hooks/useChatStream").Message[];
}) {
  const messageContainerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const [input, setInput] = React.useState("");

  const { placeholder, titleText = "An LLM", conversationId, initialMessages } = props;
  
  // Usar el hook personalizado para manejar el chat
  const { messages, isLoading, sendMessage, clearMessages } = useChatStream(conversationId, initialMessages);

  // Función para hacer scroll al último mensaje
  const scrollToBottom = () => {
    if (messageContainerRef.current) {
      const scrollContainer = messageContainerRef.current;
      scrollContainer.scrollTo({
        top: scrollContainer.scrollHeight,
        behavior: "smooth",
      });
    }
  };

  // Efecto para hacer scroll cuando hay nuevos mensajes
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Autoenfoque al cargar y cuando no está cargando
  useEffect(() => {
    if (!isLoading && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isLoading]);

  const handleSendMessage = async (message?: string) => {
    if (messageContainerRef.current) {
      messageContainerRef.current.classList.add("grow");
    }
    
    const messageValue = message ?? input;
    if (messageValue.trim() === "") return;
    
    setInput("");
    // Intentar mantener el foco en el input
    if (inputRef.current && !isLoading) {
      inputRef.current.focus();
    }
    await sendMessage(messageValue);
  };

  const sendInitialQuestion = async (question: string) => {
    await sendMessage(question);
  };

  // Limpieza de conversación eliminada: la sesión se pierde al refrescar pantalla

  return (
    <div className="flex flex-col h-full bg-gradient-to-br from-gray-50 via-white to-orange-50">
      {/* Header personalizado */}
      <div className="bg-gradient-to-r from-[#da5b3e] to-[#c54a33] shadow-lg shadow-[#da5b3e]/20">
        <div className="px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
              <MessageCircle className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1">
              <h1 className="text-xl font-bold text-white">Becas Grupo Romero</h1>
            </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
            <span className="text-white/80 text-sm">En línea</span>
            <button
              aria-label="Limpiar chat"
              title="Limpiar chat"
              onClick={() => clearMessages()}
              className="ml-3 p-2 rounded-lg bg-white/20 hover:bg-white/30 text-white transition-colors"
            >
              <Trash className="w-4 h-4" />
            </button>
          </div>
          </div>
        </div>
        
        {/* Decoración inferior */}
        <div className="h-1 bg-gradient-to-r from-transparent via-white/30 to-transparent"></div>
      </div>

      <div
        className="flex-1 overflow-y-auto p-4 space-y-4"
        ref={messageContainerRef}
      >
        {messages.length === 0 ? (
          <EmptyState onSubmit={handleSendMessage} />
        ) : (
          messages.map((message, i) => (
            <ChatMessageBubble
              key={message.id}
              message={message}
              aiEmoji="🤖"
              isMostRecent={i === messages.length - 1}
              messageCompleted={!isLoading || i !== messages.length - 1}
            />
          ))
        )}
      </div>

      <div className="border-t bg-gradient-to-r from-gray-50 to-white p-4">
        <div className="flex gap-3">
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
            placeholder={placeholder ?? "Escribe tu mensaje..."}
            className="flex-1 border-gray-200 focus:border-[#da5b3e] focus:ring-[#da5b3e]/20 rounded-xl"
            disabled={isLoading}
            autoFocus
          />
          <Button
            onClick={() => handleSendMessage()}
            disabled={isLoading || input.trim() === ""}
            size="icon"
            className="shrink-0 w-12 h-12 bg-gradient-to-br from-[#da5b3e] to-[#c54a33] hover:from-[#c54a33] hover:to-[#b03e28] disabled:from-gray-300 disabled:to-gray-400 shadow-lg shadow-[#da5b3e]/25 hover:shadow-xl hover:shadow-[#da5b3e]/30 transition-all duration-300 hover:scale-105 active:scale-95 rounded-xl border-0"
          >
            <ArrowUp className="h-5 w-5 text-white" />
          </Button>
        </div>
      </div>
    </div>
  );
}
