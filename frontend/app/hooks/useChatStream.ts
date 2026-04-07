import { useState, useCallback, useEffect, useRef } from "react";
import { logger } from "@/app/lib/logger";
import { API_URL } from "../lib/config";
import type { Message } from "@/types/chat";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateId(): string {
  return crypto?.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`;
}

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

export interface UseChatStreamReturn {
  messages: Message[];
  isLoading: boolean;
  debugData?: any;
  sendMessage: (
    message: string,
    opts?: { debug?: boolean; body?: Record<string, any> },
  ) => Promise<void>;
  clearMessages: () => void;
  cancelStream: () => void;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useChatStream(
  conversationId: string,
  initialMessages?: Message[],
): UseChatStreamReturn {
  const [messages, setMessages] = useState<Message[]>(initialMessages ?? []);
  const [isLoading, setIsLoading] = useState(false);
  const [debugData, setDebugData] = useState<any | undefined>(undefined);

  // ---- Refs for streaming performance ----
  // pendingDelta accumulates SSE text between animation frames so we batch
  // N rapid chunks into ~1 setState per frame (~60 fps) instead of N.
  const pendingDeltaRef = useRef("");
  const rafIdRef = useRef<number | null>(null);

  // AbortController lets us cancel an in-flight stream on unmount, new send,
  // or explicit cancel (e.g. "New chat" button).
  const abortRef = useRef<AbortController | null>(null);

  // Track mount status to guard against setState on unmounted component.
  const mountedRef = useRef(true);

  // isLoadingRef avoids recreating sendMessage every time isLoading toggles.
  const isLoadingRef = useRef(false);

  // ---- Sync initialMessages ----
  useEffect(() => {
    if (Array.isArray(initialMessages) && initialMessages.length > 0) {
      setMessages((prev) => (prev.length === 0 ? initialMessages : prev));
    }
  }, [initialMessages]);

  // ---- Cleanup on unmount ----
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
      }
    };
  }, []);

  // -----------------------------------------------------------------------
  // scheduleFlush – batches accumulated SSE deltas into a single setState
  // per animation frame.  This is the core performance win: instead of
  // cloning the messages array on every tiny chunk, we coalesce them.
  // -----------------------------------------------------------------------
  const scheduleFlush = useCallback(() => {
    if (rafIdRef.current !== null) return; // already scheduled

    rafIdRef.current = requestAnimationFrame(() => {
      rafIdRef.current = null;
      const delta = pendingDeltaRef.current;
      if (!delta || !mountedRef.current) return;
      pendingDeltaRef.current = "";

      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last && last.role === "assistant") {
          // Clone only the slice we need – reuse array prefix by reference.
          const updated = prev.slice();
          updated[updated.length - 1] = {
            ...last,
            content: (last.content || "") + delta,
          };
          return updated;
        }
        return [
          ...prev,
          {
            id: generateId(),
            content: delta,
            role: "assistant" as const,
            createdAt: new Date(),
          },
        ];
      });
    });
  }, []);

  // -----------------------------------------------------------------------
  // cancelStream – aborts the in-flight SSE connection and cleans up.
  // Safe to call multiple times.
  // -----------------------------------------------------------------------
  const cancelStream = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    pendingDeltaRef.current = "";

    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }

    if (mountedRef.current) {
      setIsLoading(false);
      isLoadingRef.current = false;
    }
  }, []);

  // -----------------------------------------------------------------------
  // sendMessage – initiates a new SSE stream.
  // -----------------------------------------------------------------------
  const sendMessage = useCallback(
    async (
      messageText: string,
      opts?: { debug?: boolean; body?: Record<string, any> },
    ) => {
      if (isLoadingRef.current || !messageText.trim()) {
        return;
      }

      // Cancel any previous in-flight stream before starting a new one.
      abortRef.current?.abort();

      const userMessage: Message = {
        id: generateId(),
        content: messageText,
        role: "user",
        createdAt: new Date(),
      };

      setMessages((prev) => [...prev, userMessage]);
      setIsLoading(true);
      isLoadingRef.current = true;
      pendingDeltaRef.current = "";

      let handledErrorMessage: string | null = null;

      const appendAssistantError = (content: string) => {
        if (handledErrorMessage || !mountedRef.current) return;
        handledErrorMessage = content;
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last?.role === "assistant" && last?.content === content) {
            return prev;
          }
          return [
            ...prev,
            {
              id: generateId(),
              content,
              role: "assistant" as const,
              createdAt: new Date(),
            },
          ];
        });
      };

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        // Dynamic import keeps fetchEventSource out of the initial bundle.
        const { fetchEventSource } = await import(
          "@microsoft/fetch-event-source"
        );

        setDebugData(undefined);

        await fetchEventSource(API_URL + "/chat/", {
          method: "POST",
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            Accept: "text/event-stream",
          },
          credentials: "include",
          body: JSON.stringify({
            input: messageText,
            conversation_id: conversationId,
            source: "embed-default",
            debug_mode: Boolean(opts?.debug),
            ...(opts?.body || {}),
          }),
          signal: controller.signal,
          openWhenHidden: true,

          async onopen(response) {
            if (!response.ok) {
              throw new Error(
                `Error en la conexión: ${response.status} ${response.statusText}`,
              );
            }
          },

          onerror(err) {
            // If we intentionally aborted, swallow the error silently.
            if (controller.signal.aborted) return;
            logger.error("Error en la conexión SSE:", err);
            // Re-throw to stop fetchEventSource's infinite retry loop.
            throw err;
          },

          async onmessage(msg) {
            // Guard: ignore messages after abort.
            if (controller.signal.aborted) return;

            if (msg.data) {
              try {
                const chunk = JSON.parse(msg.data);
                const delta: string | undefined =
                  chunk.stream ?? chunk.streamed_output;
                if (typeof delta === "string" && delta.length > 0) {
                  // Accumulate delta and schedule a batched flush.
                  pendingDeltaRef.current += delta;
                  scheduleFlush();
                }
              } catch (e) {
                logger.error("Error procesando mensaje:", e);
              }
            }

            // Handle server-sent event types.
            if (msg.event === "end") {
              // Force one last flush so no text is lost.
              if (pendingDeltaRef.current) {
                scheduleFlush();
              }
              if (mountedRef.current) {
                setIsLoading(false);
                isLoadingRef.current = false;
              }
            } else if (msg.event === "debug") {
              try {
                const dataObj = JSON.parse(msg.data ?? "{}");
                if (mountedRef.current) setDebugData(dataObj);
              } catch (e) {
                logger.warn("No se pudo parsear debug data", e);
              }
            } else if (msg.event === "error") {
              if (mountedRef.current) {
                setIsLoading(false);
                isLoadingRef.current = false;
              }
              let errorContent =
                "Lo siento, ocurrió un error procesando tu mensaje. Por favor, inténtalo nuevamente.";
              try {
                const errorPayload = JSON.parse(msg.data ?? "{}");
                if (
                  typeof errorPayload?.message === "string" &&
                  errorPayload.message.trim()
                ) {
                  errorContent = errorPayload.message;
                }
              } catch {}
              appendAssistantError(errorContent);
            }
          },
        });
      } catch (error) {
        // AbortError is expected when we cancel – don't treat it as failure.
        if (controller.signal.aborted) return;
        logger.error("Error general:", error);
        if (mountedRef.current) {
          setIsLoading(false);
          isLoadingRef.current = false;
        }
        appendAssistantError(
          "Se perdió la conexión con el servidor. Por favor, verifica tu conexión o intenta más tarde.",
        );
      }
    },
    [conversationId, scheduleFlush],
  );

  // -----------------------------------------------------------------------
  // clearMessages – cancels any active stream, then wipes history.
  // -----------------------------------------------------------------------
  const clearMessages = useCallback(() => {
    cancelStream();
    setMessages([]);
  }, [cancelStream]);

  return {
    messages,
    isLoading,
    debugData,
    sendMessage,
    clearMessages,
    cancelStream,
  };
}
