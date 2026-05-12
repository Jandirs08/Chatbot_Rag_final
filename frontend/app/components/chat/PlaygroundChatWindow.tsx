"use client";

import React, { useEffect } from "react";
import { ChatWindow } from "./ChatWindow";
import { useDebugStream } from "@/app/hooks/useDebugStream";
import type { DebugData } from "@/app/components/debug/utils";

interface PlaygroundChatWindowProps {
  conversationId: string;
  titleText?: string;
  enableVerification?: boolean;
  onDebugData?: (data: DebugData | null | undefined) => void;
  onLoadingChange?: (isLoading: boolean) => void;
  onNewChat?: () => void;
}

/**
 * Chat window for the admin playground.
 * Uses useDebugStream → /debug/chat (admin-only, never persists).
 * Passes debug data and loading state up via callbacks.
 */
export function PlaygroundChatWindow({
  conversationId,
  titleText,
  enableVerification = false,
  onDebugData,
  onLoadingChange,
  onNewChat,
}: PlaygroundChatWindowProps) {
  const debugHook = useDebugStream(conversationId, { enableVerification });

  useEffect(() => {
    onDebugData?.(debugHook.debugData ?? null);
  }, [debugHook.debugData, onDebugData]);

  useEffect(() => {
    onLoadingChange?.(debugHook.isLoading);
  }, [debugHook.isLoading, onLoadingChange]);

  return (
    <ChatWindow
      conversationId={conversationId}
      titleText={titleText}
      chatHook={debugHook}
      variant="playground"
      onNewChat={onNewChat}
    />
  );
}
