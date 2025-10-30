"use client";

import React from "react";
import { ChatWindow } from "../components/ChatWindow";
import { v4 as uuidv4 } from "uuid";

export default function ChatPage() {
  // Optimización: usar useMemo para evitar regenerar UUID en cada render
  const conversationId = React.useMemo(() => uuidv4(), []);
  
  return (
    <div className="h-screen w-screen">
      <ChatWindow titleText="Chatbot" conversationId={conversationId} />
    </div>
  );
}
