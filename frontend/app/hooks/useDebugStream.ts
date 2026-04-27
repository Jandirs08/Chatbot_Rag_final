import { useCallback } from "react";
import { useChatStream, type UseChatStreamReturn } from "./useChatStream";

interface UseDebugStreamOptions {
  enableVerification?: boolean;
}

/**
 * Thin wrapper around useChatStream that targets the admin-only /debug/chat endpoint.
 * Always returns debugData. Never persists to DB (enforced server-side).
 */
export function useDebugStream(
  conversationId: string,
  options?: UseDebugStreamOptions,
): UseChatStreamReturn {
  const hook = useChatStream(conversationId, undefined, {
    endpoint: "/debug/chat",
  });

  const enableVerification = options?.enableVerification ?? false;

  const sendMessage = useCallback(
    async (messageText: string) => {
      await hook.sendMessage(messageText, {
        body: { enable_verification: enableVerification },
      });
    },
    [hook.sendMessage, enableVerification],
  );

  return { ...hook, sendMessage };
}
