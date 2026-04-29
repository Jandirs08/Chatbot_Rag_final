import { API_URL } from "@/app/lib/config";
import { authenticatedFetch } from "@/app/lib/services/authService";

export async function takeover(conversationId: string): Promise<void> {
  const res = await authenticatedFetch(
    `${API_URL}/conversations/${conversationId}/takeover`,
    { method: "POST" },
  );
  if (!res.ok) throw new Error("Error al tomar la conversación");
}

export async function release(conversationId: string): Promise<void> {
  const res = await authenticatedFetch(
    `${API_URL}/conversations/${conversationId}/release`,
    { method: "POST" },
  );
  if (!res.ok) throw new Error("Error al devolver la conversación");
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
