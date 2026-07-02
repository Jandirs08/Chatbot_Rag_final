"use client";

import { useState, useCallback, useEffect } from "react";
import useSWR from "swr";
import { useRequireAdmin } from "@/app/hooks/useAuthGuard";
import { API_URL } from "@/app/lib/config";
import { authenticatedJsonFetcher } from "@/app/lib/services/authService";
import { LiveIndicator } from "@/app/_components/shared/LiveIndicator";
import { HeroBrief } from "./_components/HeroBrief";
import { KpiCard } from "./_components/KpiCard";
import { ActivityChart } from "./_components/ActivityChart";
import { ActivityHeatmap } from "./_components/ActivityHeatmap";
import { LeadsTimeline } from "./_components/LeadsTimeline";
import { HandoffSection } from "./_components/HandoffSection";
import { KnowledgeGapsSection } from "./_components/KnowledgeGapsSection";
import type {
  OverviewData,
  HistoryItem,
  LeadsData,
  PeakHoursData,
  HandoffStatsData,
} from "./types";

type ActivityWindow = "7d" | "30d" | "90d";

const DAYS_MAP: Record<ActivityWindow, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

export default function DashboardPage() {
  const { isAuthorized } = useRequireAdmin();
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [activityWindow, setActivityWindow] = useState<ActivityWindow>("7d");

  useEffect(() => {
    setLastRefresh(new Date());
  }, []);

  // ── Data fetching ────────────────────────────────────────────────────────────

  const {
    data: overview,
    isLoading: overviewLoading,
    mutate: refreshOverview,
  } = useSWR<OverviewData>(
    isAuthorized ? `${API_URL}/dashboard/overview` : null,
    authenticatedJsonFetcher,
    { refreshInterval: 60000 },
  );

  const {
    data: history,
    isLoading: historyLoading,
    error: historyError,
  } = useSWR<HistoryItem[]>(
    isAuthorized
      ? `${API_URL}/chat/stats/history?days=${DAYS_MAP[activityWindow]}`
      : null,
    authenticatedJsonFetcher,
    { refreshInterval: 300000 },
  );

  const { data: leads } = useSWR<LeadsData>(
    isAuthorized ? `${API_URL}/dashboard/leads` : null,
    authenticatedJsonFetcher,
    { refreshInterval: 120000 },
  );

  const { data: peakHours } = useSWR<PeakHoursData>(
    isAuthorized ? `${API_URL}/dashboard/peak-hours` : null,
    authenticatedJsonFetcher,
    { refreshInterval: 0 },
  );

  const { data: handoffStats } = useSWR<HandoffStatsData>(
    isAuthorized ? `${API_URL}/inbox/handoff-stats?days=30` : null,
    authenticatedJsonFetcher,
    { refreshInterval: 300000 },
  );

  // ── Sparklines ───────────────────────────────────────────────────────────────

  const messagesSeries = (history ?? []).map((h) => h.messages_count);
  const usersSeries = (history ?? []).map((h) => h.users_count);

  // ── Handlers ─────────────────────────────────────────────────────────────────

  const handleRefresh = useCallback(() => {
    refreshOverview().catch(console.error);
    setLastRefresh(new Date());
  }, [refreshOverview]);

  if (!isAuthorized) return null;

  return (
    <div className="min-h-screen bg-background">
      {/* Sticky header */}
      <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-3 border-b border-border/60 bg-background/80 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-primary shadow-[0_0_8px_hsl(var(--primary)/0.5)]" />
          <span className="text-xs font-bold tracking-[0.12em] uppercase text-muted-foreground">
            Métricas
          </span>
        </div>
        <div className="flex items-center gap-3">
          <LiveIndicator lastUpdated={lastRefresh} />
          <button
            type="button"
            onClick={handleRefresh}
            className="text-[11px] font-mono text-muted-foreground hover:text-foreground border border-border rounded-lg px-2.5 py-1 transition-colors"
          >
            Actualizar
          </button>
        </div>
      </div>

      {/* Hero */}
      <div className="px-6 pt-6 pb-4 max-w-screen-2xl mx-auto">
        <HeroBrief
          messages={overview?.today_messages ?? 0}
          conversations={overview?.today_conversations ?? 0}
          leads={overview?.leads_this_week ?? 0}
          docs={overview?.pdfs_ready ?? 0}
        />
      </div>

      {/* Bento grid */}
      <main className="px-6 pb-12 max-w-screen-2xl mx-auto grid grid-cols-12 gap-3">
        {/* KPI cards */}
        <div className="col-span-6 md:col-span-3">
          <KpiCard
            label="Mensajes hoy"
            value={overview?.today_messages ?? 0}
            total={overview?.total_messages}
            color="indigo"
            sparklineData={messagesSeries}
          />
        </div>
        <div className="col-span-6 md:col-span-3">
          <KpiCard
            label="Conversaciones hoy"
            value={overview?.today_conversations ?? 0}
            total={overview?.total_conversations}
            color="cyan"
            sparklineData={usersSeries}
          />
        </div>
        <div className="col-span-6 md:col-span-3">
          <KpiCard
            label="Leads esta semana"
            value={overview?.leads_this_week ?? 0}
            total={overview?.leads_total}
            color="emerald"
            sparklineData={[]}
          />
        </div>
        <div className="col-span-6 md:col-span-3">
          <KpiCard
            label="PDFs en corpus"
            value={overview?.pdfs_ready ?? 0}
            color="amber"
            sparklineData={[]}
          />
        </div>

        {/* Activity chart + Leads timeline */}
        <div className="col-span-12 lg:col-span-8 bg-card rounded-xl border border-border shadow-sm p-4">
          <ActivityChart
            data={history}
            loading={historyLoading}
            error={!!historyError}
            window={activityWindow}
            onWindowChange={setActivityWindow}
          />
        </div>
        <div className="col-span-12 lg:col-span-4 bg-card rounded-xl border border-border shadow-sm p-4">
          <LeadsTimeline
            leads={leads?.items ?? []}
            total={leads?.total ?? 0}
            onViewAll={() => {
              /* navigate to leads page */
            }}
          />
        </div>

        {/* Heatmap + Handoff */}
        <div className="col-span-12 lg:col-span-7 bg-card rounded-xl border border-border shadow-sm p-4">
          <ActivityHeatmap data={peakHours?.items ?? []} />
        </div>
        <div className="col-span-12 lg:col-span-5 bg-card rounded-xl border border-border shadow-sm p-4">
          {handoffStats ? (
            <HandoffSection data={handoffStats} />
          ) : (
            <p className="text-sm text-muted-foreground italic">
              Cargando escalaciones…
            </p>
          )}
        </div>

        {/* Knowledge Gaps */}
        <div className="col-span-12 bg-card rounded-xl border border-border shadow-sm p-4">
          <KnowledgeGapsSection isAuthorized={isAuthorized} />
        </div>
      </main>
    </div>
  );
}
