"use client";

import React, { useState, useMemo } from "react";
import { MessageCircle, X } from "lucide-react";
import { Button } from "./ui/button";
import { v4 as uuidv4 } from "uuid";

// Lazy loading del ChatWindow para reducir el bundle inicial
const ChatWindow = React.lazy(() => import("./ChatWindow").then(module => ({ default: module.ChatWindow })));

export const LazyFloatingChatWidget = () => {
  const [isOpen, setIsOpen] = useState(false);
  
  // Memoizar el conversationId para evitar regeneración en cada render
  const conversationId = useMemo(() => uuidv4(), []);

  return (
    <div className="fixed bottom-5 right-5 z-50">
      {isOpen ? (
        <div className="w-80 h-96 bg-white border border-gray-200 rounded-lg shadow-xl overflow-hidden animate-in slide-in-from-bottom-2 duration-300">
          <div className="flex items-center justify-between p-3 bg-gray-50 border-b">
            <h3 className="font-semibold text-gray-800">Gestor de Becas</h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsOpen(false)}
              className="h-6 w-6 p-0"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="h-full">
            <React.Suspense 
              fallback={
                <div className="flex items-center justify-center h-full">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                </div>
              }
            >
              <ChatWindow
                titleText="Gestor de Becas"
                conversationId={conversationId}
                placeholder="Pregúntame sobre becas..."
              />
            </React.Suspense>
          </div>
        </div>
      ) : (
        <Button
          onClick={() => setIsOpen(true)}
          className="h-12 w-12 rounded-full bg-blue-600 hover:bg-blue-700 shadow-lg"
          size="icon"
        >
          <MessageCircle className="h-6 w-6 text-white" />
        </Button>
      )}
    </div>
  );
};