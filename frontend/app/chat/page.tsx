"use client";

import React from "react";
import { ChatWindow } from "../components/ChatWindow";

export default function ChatPage() {
  // Optimización: usar useMemo para evitar regenerar UUID en cada render
  const conversationId = React.useMemo(
    () => (crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`),
    []
  );
  
  return (
    <div className="h-screen w-screen">
      <ChatWindow titleText="Chatbot" conversationId={conversationId} />
    </div>
  );
}
