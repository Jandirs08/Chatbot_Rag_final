"use client";
import React, { useState } from "react";
import { ChatWindow } from "./ChatWindow";
import { Button } from "./ui/button";
import { MessageCircle, X } from "lucide-react";

export const FloatingChatWidget = () => {
  const [isOpen, setIsOpen] = useState(false);
  const conversationId = crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;

  return (
    <div className="fixed bottom-5 right-5 z-50">
      {isOpen ? (
        <div className="w-[350px] h-[500px] bg-gray-900 dark:bg-slate-900 rounded-md shadow-xl overflow-hidden relative">
          <div className="absolute top-2 right-2 z-10">
            <Button
              aria-label="Cerrar chat"
              variant="ghost"
              size="icon"
              onClick={() => setIsOpen(false)}
              className="text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="h-full w-full">
            <ChatWindow titleText="Gestor de Becas" conversationId={conversationId} />
          </div>
        </div>
      ) : (
        <Button
          aria-label="Abrir chat"
          size="icon"
          onClick={() => setIsOpen(true)}
          className="h-12 w-12 rounded-full bg-blue-600 hover:bg-blue-700 text-white shadow-md"
        >
          <MessageCircle className="h-6 w-6" />
        </Button>
      )}
    </div>
  );
};
