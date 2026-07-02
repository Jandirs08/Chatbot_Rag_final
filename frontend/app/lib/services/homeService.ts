import { API_URL } from "@/app/lib/config";
import { authenticatedFetch } from "@/app/lib/services/authService";

export interface DashboardOverview {
  today_messages: number;
  total_messages: number;
  today_conversations: number;
  total_conversations: number;
  leads_total: number;
  leads_this_week: number;
  pdfs_ready: number;
}

export interface StatsHistoryDay {
  date: string;
  messages_count: number;
  users_count: number;
}

export interface StatsHistory {
  data: StatsHistoryDay[];
  days: number;
}

export interface HandoffStats {
  user_request: number;
  low_confidence: number;
  out_of_scope: number;
  total: number;
}

export interface RecentConversation {
  conversation_id: string;
  summary?: string | null;
  last_message?: string | null;
  lead?: { name?: string | null; email?: string | null } | null;
  channel?: "web" | "whatsapp" | string | null;
  mode?: "bot" | "handoff" | "human" | string | null;
  status?: string | null;
  created_at?: string | null;
  last_message_at?: string | null;
  gating_reason?: string | null;
}

export const homeService = {
  async getOverview(): Promise<DashboardOverview> {
    const res = await authenticatedFetch(`${API_URL}/dashboard/overview`);
    if (!res.ok) throw new Error(`Overview: ${res.status}`);
    return res.json();
  },

  async getStatsHistory(days: 7 | 30 | 90 = 7): Promise<StatsHistory> {
    const res = await authenticatedFetch(
      `${API_URL}/chat/stats/history?days=${days}`,
    );
    if (!res.ok) throw new Error(`StatsHistory: ${res.status}`);
    return res.json();
  },

  async getHandoffStats(): Promise<HandoffStats> {
    const res = await authenticatedFetch(`${API_URL}/inbox/handoff-stats`);
    if (!res.ok) throw new Error(`HandoffStats: ${res.status}`);
    return res.json();
  },

  async getRecentConversations(limit = 5): Promise<RecentConversation[]> {
    const res = await authenticatedFetch(
      `${API_URL}/chat/conversations?limit=${limit}&skip=0`,
    );
    if (!res.ok) throw new Error(`RecentConvos: ${res.status}`);
    const data = await res.json();
    return Array.isArray(data) ? data : (data.items ?? []);
  },
};
