"use client";

import React from "react";
import { ChatWindow } from "../components/ChatWindow";
import { v4 as uuidv4 } from "uuid";
import { ChakraProvider } from "@chakra-ui/react";

export default function ChatPage() {
  // Optimización: usar useMemo para evitar regenerar UUID en cada render
  const conversationId = React.useMemo(() => uuidv4(), []);
  
  return (
    <ChakraProvider>
      <div className="h-screen w-screen">
        <ChatWindow titleText="Chatbot" conversationId={conversationId} />
      </div>
    </ChakraProvider>
  );
}
