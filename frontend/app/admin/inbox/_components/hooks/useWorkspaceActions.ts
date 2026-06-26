"use client";

import { useState, useCallback } from "react";
import type { RefObject, KeyboardEvent } from "react";
import type { KeyedMutator } from "swr";
import * as inboxService from "@/app/lib/services/inboxService";
import {
  RateLimitError,
  type MessagesPage,
} from "@/app/lib/services/inboxService";
import type { InboxConversation } from "../InboxConversationCard";

// ─── Types ────────────────────────────────────────────────────────────────────

type ToastFn = (options: {
  title: string;
  description?: string;
  variant?: "default" | "destructive";
}) => void;

export interface UseWorkspaceActionsParams {
  agentId: string;
  conversationId: string;
  conversation: InboxConversation;
  isCompleted: boolean;
  summaryAtDate: Date | null;
  mutateMessages: KeyedMutator<MessagesPage>;
  onConversationUpdate?: (updated: InboxConversation) => void;
  toast: ToastFn;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
}

const RECENT_SUMMARY_MS = 10 * 60 * 1000; // 10 min

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useWorkspaceActions({
  agentId,
  conversationId,
  conversation,
  isCompleted,
  summaryAtDate,
  mutateMessages,
  onConversationUpdate,
  toast,
  textareaRef,
}: UseWorkspaceActionsParams) {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [stageMutating, setStageMutating] = useState(false);
  const [takeoverMutating, setTakeoverMutating] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const handleSend = useCallback(async () => {
    if (!agentId || !draft.trim() || sending) return;
    setSending(true);
    try {
      await inboxService.sendAgentMessage(conversationId, draft.trim());
      setDraft("");
      await mutateMessages();
      textareaRef.current?.focus();
    } catch (err) {
      if (err instanceof RateLimitError) {
        toast({
          title: "Demasiadas solicitudes",
          description: `Espera ${err.retryAfterSeconds}s antes de reenviar.`,
          variant: "destructive",
        });
      } else {
        toast({
          title: "No se envió el mensaje",
          description:
            "Vuelve a intentarlo. El texto se mantuvo en el borrador.",
          variant: "destructive",
        });
      }
    } finally {
      setSending(false);
    }
  }, [agentId, conversationId, draft, mutateMessages, sending, textareaRef, toast]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        void handleSend();
      }
    },
    [handleSend],
  );

  const runRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const updated = await inboxService.refreshSummary(conversationId);
      onConversationUpdate?.(updated);
    } catch (err) {
      if (err instanceof RateLimitError) {
        toast({
          title: "Demasiadas solicitudes",
          description: `Espera ${err.retryAfterSeconds}s antes de regenerar.`,
          variant: "destructive",
        });
      } else {
        toast({
          title: "No se regeneró el resumen",
          description: "Intenta de nuevo en un momento.",
          variant: "destructive",
        });
      }
    } finally {
      setRefreshing(false);
    }
  }, [conversationId, onConversationUpdate, toast]);

  const handleStageToggle = useCallback(async () => {
    if (stageMutating) return;
    setStageMutating(true);
    try {
      const updated = isCompleted
        ? await inboxService.reopen(conversationId)
        : await inboxService.complete(conversationId);
      onConversationUpdate?.(updated);
      toast({
        title: isCompleted ? "Reabierta" : "Marcada como completada",
      });
    } catch (err) {
      if (err instanceof RateLimitError) {
        toast({
          title: "Demasiadas solicitudes",
          description: `Espera ${err.retryAfterSeconds}s e intenta de nuevo.`,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Error",
          description: isCompleted
            ? "No se pudo reabrir la conversación."
            : "No se pudo completar la conversación.",
          variant: "destructive",
        });
      }
    } finally {
      setStageMutating(false);
    }
  }, [conversationId, isCompleted, onConversationUpdate, stageMutating, toast]);

  const handleTakeover = useCallback(async () => {
    if (takeoverMutating) return;
    setTakeoverMutating(true);
    try {
      const patch = await inboxService.takeover(conversationId);
      onConversationUpdate?.({
        ...conversation,
        mode: patch.mode,
        assigned_agent_id: patch.assigned_agent_id,
      });
    } catch (err) {
      if (err instanceof RateLimitError) {
        toast({
          title: "Demasiadas solicitudes",
          description: `Espera ${err.retryAfterSeconds}s e intenta de nuevo.`,
          variant: "destructive",
        });
      } else {
        const isConflict =
          err instanceof Error && err.message === "ALREADY_TAKEN";
        toast({
          title: isConflict ? "Conversación no disponible" : "Error",
          description: isConflict
            ? "Otro agente ya tomó esta conversación."
            : "No se pudo tomar la conversación.",
          variant: "destructive",
        });
      }
    } finally {
      setTakeoverMutating(false);
    }
  }, [conversation, conversationId, onConversationUpdate, takeoverMutating, toast]);

  const handleRelease = useCallback(async () => {
    if (takeoverMutating) return;
    setTakeoverMutating(true);
    try {
      await inboxService.release(conversationId);
      onConversationUpdate?.({
        ...conversation,
        mode: "bot",
        assigned_agent_id: null,
      });
    } catch (err) {
      if (err instanceof RateLimitError) {
        toast({
          title: "Demasiadas solicitudes",
          description: `Espera ${err.retryAfterSeconds}s e intenta de nuevo.`,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Error",
          description: "No se pudo liberar la conversación.",
          variant: "destructive",
        });
      }
    } finally {
      setTakeoverMutating(false);
    }
  }, [conversation, conversationId, onConversationUpdate, takeoverMutating, toast]);

  const handleRefreshClick = useCallback(() => {
    if (
      summaryAtDate &&
      Date.now() - summaryAtDate.getTime() < RECENT_SUMMARY_MS
    ) {
      setConfirmOpen(true);
      return;
    }
    void runRefresh();
  }, [runRefresh, summaryAtDate]);

  return {
    draft,
    setDraft,
    sending,
    refreshing,
    stageMutating,
    takeoverMutating,
    confirmOpen,
    setConfirmOpen,
    handleSend,
    handleKeyDown,
    runRefresh,
    handleStageToggle,
    handleTakeover,
    handleRelease,
    handleRefreshClick,
  };
}
