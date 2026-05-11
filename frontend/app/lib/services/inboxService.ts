import { API_URL } from "@/app/lib/config";
import { authenticatedFetch } from "@/app/lib/services/authService";
import type { InboxConversation } from "@/app/admin/inbox/_components/InboxConversationCard";

export type InboxFetchParams = {
  limit?: number;
  skip?: number;
  tab?: string;
  channel?: string;
  datos?: string;
  only_unseen?: boolean;
};

export type InboxTabCounts = {
  todos: number;
  pendientes: number;
  mias: number;
  bot: number;
};

export type InboxListResponse = {
  items: InboxConversation[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
  has_next: boolean;
};

export class RateLimitError extends Error {
  retryAfterSeconds: number;
  constructor(retryAfterSeconds: number) {
    super("RATE_LIMITED");
    this.name = "RateLimitError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

function parseRetryAfter(res: Response): number {
  const raw = res.headers.get("Retry-After");
  if (!raw) return 5;
  const asInt = Number(raw);
  if (!Number.isNaN(asInt) && asInt > 0) return Math.min(asInt, 300);
  const asDate = Date.parse(raw);
  if (!Number.isNaN(asDate)) {
    const secs = Math.ceil((asDate - Date.now()) / 1000);
    return Math.max(1, Math.min(secs, 300));
  }
  return 5;
}

async function ensureOk(res: Response, fallbackMsg: string): Promise<Response> {
  if (res.status === 429) throw new RateLimitError(parseRetryAfter(res));
  if (!res.ok) throw new Error(fallbackMsg);
  return res;
}

export function buildInboxUrl(params?: InboxFetchParams): string {
  const url = new URL(`${API_URL}/conversations/inbox`);
  if (params?.limit != null) url.searchParams.set("limit", String(params.limit));
  if (params?.skip != null) url.searchParams.set("skip", String(params.skip));
  if (params?.tab && params.tab !== "todos") url.searchParams.set("tab", params.tab);
  if (params?.channel && params.channel !== "todos")
    url.searchParams.set("channel", params.channel);
  if (params?.datos && params.datos !== "todos")
    url.searchParams.set("datos", params.datos);
  if (params?.only_unseen) url.searchParams.set("only_unseen", "true");
  return url.toString();
}

export type ConversationMessage = {
  message_id?: string;
  conversation_id?: string;
  role: "user" | "assistant" | "system" | "function" | "agent";
  content: string;
  timestamp?: string;
  source?: string | null;
  sender_type?: string;
  agent_id?: string;
};

export type MessagesPage = {
  conversation_id: string;
  messages: ConversationMessage[];
  has_more: boolean;
  next_before: string | null;
};

export function buildMessagesUrl(
  conversationId: string,
  opts?: { limit?: number; before?: string },
): string {
  const url = new URL(`${API_URL}/conversations/${conversationId}/messages`);
  if (opts?.limit != null) url.searchParams.set("limit", String(opts.limit));
  if (opts?.before) url.searchParams.set("before", opts.before);
  return url.toString();
}

export function buildConversationUrl(conversationId: string): string {
  return `${API_URL}/conversations/${conversationId}`;
}

export function buildInboxCountsUrl(opts?: { channel?: string; datos?: string }): string {
  const url = new URL(`${API_URL}/conversations/inbox/counts`);
  if (opts?.channel && opts.channel !== "todos")
    url.searchParams.set("channel", opts.channel);
  if (opts?.datos && opts.datos !== "todos")
    url.searchParams.set("datos", opts.datos);
  return url.toString();
}

export async function inboxJsonFetcher<T = unknown>(url: string): Promise<T> {
  const res = await authenticatedFetch(url, { method: "GET" });
  if (res.status === 429) throw new RateLimitError(parseRetryAfter(res));
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

export type TakeoverResult = { mode: "human"; assigned_agent_id: string };

export async function takeover(conversationId: string): Promise<TakeoverResult> {
  const res = await authenticatedFetch(
    `${API_URL}/conversations/${conversationId}/takeover`,
    { method: "POST" },
  );
  if (res.status === 429) throw new RateLimitError(parseRetryAfter(res));
  if (res.status === 409) throw new Error("ALREADY_TAKEN");
  if (!res.ok) throw new Error("Error al tomar la conversación");
  return (await res.json()) as TakeoverResult;
}

export async function release(conversationId: string): Promise<void> {
  const res = await authenticatedFetch(
    `${API_URL}/conversations/${conversationId}/release`,
    { method: "POST" },
  );
  await ensureOk(res, "Error al devolver la conversación");
}

export async function markViewed(conversationId: string): Promise<void> {
  const res = await authenticatedFetch(
    `${API_URL}/conversations/${conversationId}/mark-viewed`,
    { method: "POST" },
  );
  await ensureOk(res, "Error al marcar como visto");
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
  await ensureOk(res, "Error al obtener métricas de handoff");
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
  await ensureOk(res, "Error al enviar el mensaje");
}

export async function refreshSummary(
  conversationId: string,
): Promise<InboxConversation> {
  const res = await authenticatedFetch(
    `${API_URL}/conversations/${conversationId}/refresh-summary`,
    { method: "POST" },
  );
  await ensureOk(res, "Error al regenerar el resumen");
  return res.json() as Promise<InboxConversation>;
}

export async function complete(
  conversationId: string,
): Promise<InboxConversation> {
  const res = await authenticatedFetch(
    `${API_URL}/conversations/${conversationId}/complete`,
    { method: "POST" },
  );
  await ensureOk(res, "Error al completar la conversación");
  return res.json() as Promise<InboxConversation>;
}

export async function reopen(
  conversationId: string,
): Promise<InboxConversation> {
  const res = await authenticatedFetch(
    `${API_URL}/conversations/${conversationId}/reopen`,
    { method: "POST" },
  );
  await ensureOk(res, "Error al reabrir la conversación");
  return res.json() as Promise<InboxConversation>;
}
