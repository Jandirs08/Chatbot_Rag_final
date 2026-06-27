// ─── Dashboard domain types ───────────────────────────────────────────────────

export interface OverviewData {
  today_messages: number;
  total_messages: number;
  today_conversations: number;
  total_conversations: number;
  leads_total: number;
  leads_this_week: number;
  pdfs_ready: number;
}

export interface HistoryItem {
  date: string;
  messages_count: number;
  users_count: number;
}

export interface LeadItem {
  conversation_id: string;
  lead_name: string | null;
  lead_email: string;
  captured_at: string | null;
}

export interface LeadsData {
  total: number;
  this_week: number;
  items: LeadItem[];
}

export interface PeakHourItem {
  hour: number;
  count: number;
}

export interface PeakHoursData {
  items: PeakHourItem[];
  timezone: string;
}

export interface HandoffStatsData {
  user_request: number;
  low_confidence: number;
  out_of_scope: number;
  total: number;
  period_days: number;
}
