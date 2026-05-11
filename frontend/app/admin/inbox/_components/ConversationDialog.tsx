"use client";

import React, { useCallback } from "react";
import useSWR from "swr";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X, Loader2, ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/app/hooks/use-toast";
import {
  RateLimitError,
  buildConversationUrl,
  inboxJsonFetcher,
} from "@/app/lib/services/inboxService";
import { ConversationWorkspace } from "./ConversationWorkspace";
import type { InboxConversation } from "./InboxConversationCard";

interface ConversationDialogProps {
  conversationId: string | null;
  onClose: () => void;
  fallbackData?: InboxConversation;
  agentId: string;
  onConversationUpdate: (updated: InboxConversation) => void;
}

// Stable empty object so SWR's fallbackData reference doesn't churn.
function useConversationSWR(
  conversationId: string | null,
  fallbackData: InboxConversation | undefined,
  onRateLimited: (secs: number) => void,
) {
  return useSWR<InboxConversation>(
    conversationId ? buildConversationUrl(conversationId) : null,
    inboxJsonFetcher,
    {
      fallbackData,
      refreshInterval: 15000,
      revalidateOnFocus: true,
      dedupingInterval: 3000,
      shouldRetryOnError: (err) => !(err instanceof RateLimitError),
      onError: (err) => {
        if (err instanceof RateLimitError) {
          onRateLimited(err.retryAfterSeconds);
        }
      },
    },
  );
}

export function ConversationDialog({
  conversationId,
  onClose,
  fallbackData,
  agentId,
  onConversationUpdate,
}: ConversationDialogProps) {
  const { toast } = useToast();
  const open = conversationId != null;

  const handleRateLimited = useCallback(
    (secs: number) => {
      toast({
        title: "Demasiadas solicitudes",
        description: `Esperando ${secs}s antes de reintentar.`,
        variant: "destructive",
      });
    },
    [toast],
  );

  const { data: conversation, error, isLoading, mutate } = useConversationSWR(
    conversationId,
    fallbackData,
    handleRateLimited,
  );

  const handleConversationUpdate = useCallback(
    (updated: InboxConversation) => {
      // 1. Seed the per-conversation SWR cache with the patched record so the
      //    body re-renders immediately (no wait for the 15s poll).
      mutate(updated, { revalidate: false });
      // 2. Propagate up to the kanban so the list card behind the dialog
      //    reflects the new state.
      onConversationUpdate(updated);
    },
    [mutate, onConversationUpdate],
  );

  const notFound =
    error instanceof Error && /HTTP 404/.test(error.message);

  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className={cn(
            "fixed inset-0 z-50 bg-black/50 backdrop-blur-sm",
            "data-[state=open]:animate-in data-[state=open]:fade-in-0",
            "data-[state=closed]:animate-out data-[state=closed]:fade-out-0",
            "motion-reduce:animate-none",
          )}
        />
        <DialogPrimitive.Content
          aria-labelledby="conversation-dialog-title"
          onOpenAutoFocus={(e) => {
            // Avoid auto-focusing the textarea (would pop up mobile keyboards).
            // Radix focuses the content root by default; that's fine for SR users.
            e.preventDefault();
          }}
          className={cn(
            "fixed z-50 flex flex-col overflow-hidden bg-background shadow-2xl",
            "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
            "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
            "motion-reduce:animate-none",
            // Mobile / small: full screen
            "inset-0 h-[100dvh] w-screen max-w-none rounded-none",
            // lg: 92vw × 88vh centered
            "lg:inset-auto lg:left-1/2 lg:top-1/2 lg:h-[88vh] lg:w-[92vw]",
            "lg:max-w-[1100px] lg:-translate-x-1/2 lg:-translate-y-1/2 lg:rounded-2xl lg:border lg:border-border/60",
            // xl: cap at 1280 / 860
            "xl:max-w-[1280px] xl:h-[min(860px,90vh)] xl:w-[min(1280px,92vw)]",
          )}
        >
          {/* Close button — top-right, large hit target. */}
          <DialogPrimitive.Close
            className={cn(
              "absolute right-2 top-2 z-10 inline-flex h-9 w-9 items-center justify-center rounded-lg",
              "text-muted-foreground/70 transition-colors",
              "hover:bg-muted/50 hover:text-foreground",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
            )}
            aria-label="Cerrar conversación"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </DialogPrimitive.Close>

          {/* Body */}
          {isLoading && !conversation ? (
            <div className="flex h-full items-center justify-center">
              <span className="inline-flex items-center gap-2 text-[12px] text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                Cargando conversación…
              </span>
              <DialogPrimitive.Title className="sr-only">
                Cargando conversación
              </DialogPrimitive.Title>
            </div>
          ) : notFound || (!conversation && !isLoading) ? (
            <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
              <DialogPrimitive.Title
                id="conversation-dialog-title"
                className="font-heading text-[15px] font-semibold text-foreground"
              >
                Conversación no encontrada
              </DialogPrimitive.Title>
              <p className="text-[12px] text-muted-foreground">
                El id no existe o fue eliminado.
              </p>
              <button
                type="button"
                onClick={onClose}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-lg border border-border/60 bg-card px-3",
                  "font-heading text-[11px] font-semibold text-foreground",
                  "transition-colors hover:bg-muted/40",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                )}
              >
                <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                Volver al inbox
              </button>
            </div>
          ) : conversation ? (
            <ConversationWorkspace
              conversation={conversation}
              agentId={agentId}
              onConversationUpdate={handleConversationUpdate}
            />
          ) : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
