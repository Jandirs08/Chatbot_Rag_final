import { API_URL } from "@/app/lib/config";
import { authenticatedFetch } from "@/app/lib/services/authService";
import type { InboxConversation } from "@/app/admin/inbox/_components/InboxConversationCard";

export type InboxFetchParams = {
  category?: string;
  min_score?: number;
  limit?: number;
  skip?: number;
};

export function buildInboxUrl(params?: InboxFetchParams): string {
  const url = new URL(`${API_URL}/conversations/inbox`);
  if (params?.category) url.searchParams.set("category", params.category);
  if (params?.min_score != null)
    url.searchParams.set("min_score", String(params.min_score));
  if (params?.limit) url.searchParams.set("limit", String(params.limit));
  if (params?.skip) url.searchParams.set("skip", String(params.skip));
  return url.toString();
}

export async function takeover(conversationId: string): Promise<void> {
  const res = await authenticatedFetch(
    `${API_URL}/conversations/${conversationId}/takeover`,
    { method: "POST" },
  );
  if (res.status === 409) throw new Error("ALREADY_TAKEN");
  if (!res.ok) throw new Error("Error al tomar la conversación");
}

export async function release(conversationId: string): Promise<void> {
  const res = await authenticatedFetch(
    `${API_URL}/conversations/${conversationId}/release`,
    { method: "POST" },
  );
  if (!res.ok) throw new Error("Error al devolver la conversación");
}

export async function markViewed(conversationId: string): Promise<void> {
  const res = await authenticatedFetch(
    `${API_URL}/conversations/${conversationId}/mark-viewed`,
    { method: "POST" },
  );
  if (!res.ok) throw new Error("Error al marcar como visto");
}

export type HandoffStats = {
  user_request: number;
  low_confidence: number;
  out_of_scope: number;
  total: number;
  period_days: number;
};

export async function getHandoffStats(days = 30): Promise<HandoffStats> {
  const res = await authenticatedFetch(
    `${API_URL}/inbox/handoff-stats?days=${days}`,
    { method: "GET" },
  );
  if (!res.ok) throw new Error("Error al obtener métricas de handoff");
  return res.json();
}

export async function sendAgentMessage(
  conversationId: string,
  content: string,
): Promise<void> {
  const res = await authenticatedFetch(
    `${API_URL}/conversations/${conversationId}/agent-message`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    },
  );
  if (!res.ok) throw new Error("Error al enviar el mensaje");
}

export async function refreshSummary(
  conversationId: string,
): Promise<InboxConversation> {
  const res = await authenticatedFetch(
    `${API_URL}/conversations/${conversationId}/refresh-summary`,
    { method: "POST" },
  );
  if (!res.ok) throw new Error("Error al regenerar el resumen");
  return res.json() as Promise<InboxConversation>;
}

export async function complete(
  conversationId: string,
): Promise<InboxConversation> {
  const res = await authenticatedFetch(
    `${API_URL}/conversations/${conversationId}/complete`,
    { method: "POST" },
  );
  if (!res.ok) throw new Error("Error al completar la conversación");
  return res.json() as Promise<InboxConversation>;
}

export async function reopen(
  conversationId: string,
): Promise<InboxConversation> {
  const res = await authenticatedFetch(
    `${API_URL}/conversations/${conversationId}/reopen`,
    { method: "POST" },
  );
  if (!res.ok) throw new Error("Error al reabrir la conversación");
  return res.json() as Promise<InboxConversation>;
}
