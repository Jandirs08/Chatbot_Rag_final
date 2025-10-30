"use client";

import React, { useRef, useEffect } from "react";
import { EmptyState } from "../components/EmptyState";
import { ChatMessageBubble } from "../components/ChatMessageBubble";
import { AutoResizeTextarea } from "./AutoResizeTextarea";
import { Button } from "./ui/button";
import { ArrowUp } from "lucide-react";
import { useChatStream } from "../hooks/useChatStream";

export function ChatWindow(props: {
  placeholder?: string;
  titleText?: string;
  conversationId: string;
}) {
  const messageContainerRef = useRef<HTMLDivElement | null>(null);
  const [input, setInput] = React.useState("");

  const { placeholder, titleText = "An LLM", conversationId } = props;
  
  // Usar el hook personalizado para manejar el chat
  const { messages, isLoading, sendMessage } = useChatStream(conversationId);

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

  const handleSendMessage = async (message?: string) => {
    if (messageContainerRef.current) {
      messageContainerRef.current.classList.add("grow");
    }
    
    const messageValue = message ?? input;
    if (messageValue.trim() === "") return;
    
    setInput("");
    await sendMessage(messageValue);
  };

  const sendInitialQuestion = async (question: string) => {
    await sendMessage(question);
  };

  // Limpieza de conversación eliminada: la sesión se pierde al refrescar pantalla

  return (
    <div className="flex flex-col h-full">
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

      <div className="border-t p-4">
        <div className="flex gap-2">
          <AutoResizeTextarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
              }
            }}
            placeholder={placeholder ?? "Type a message..."}
            className="flex-1"
            disabled={isLoading}
          />
          <Button
            onClick={() => handleSendMessage()}
            disabled={isLoading || input.trim() === ""}
            size="icon"
            className="shrink-0"
          >
            <ArrowUp className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
