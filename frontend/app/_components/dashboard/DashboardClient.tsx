"use client";

import { useEffect, useState } from "react";
import { logger } from "@/app/lib/logger";
import { toast } from "sonner";
import { botService } from "@/app/lib/services/botService";
import {
  useBotState,
  useDashboardStats,
} from "@/app/hooks/useDashboardData";
import { useAuth } from "@/app/hooks/useAuth";
import DashboardHeader from "./DashboardHeader";
import DashboardStats from "./DashboardStats";
import DashboardQuickActions from "./DashboardQuickActions";

function Divider() {
  return (
    <div className="h-px bg-gradient-to-r from-transparent via-border/50 to-transparent" />
  );
}

export default function DashboardClient() {
  const { isAuthenticated, isInitialized } = useAuth();
  const ready = isInitialized && isAuthenticated;
  const {
    data: botState,
    isLoading: isBotStateLoading,
    mutate: mutateBotState,
  } = useBotState({ enabled: ready });
  const { data: statsData, isLoading: isStatsLoading } = useDashboardStats({ enabled: ready });
  const [isToggling, setIsToggling] = useState(false);
  const [relativeLastActivity, setRelativeLastActivity] = useState<string>("-");

  const stats = statsData ?? {
    total_queries: 0,
    total_users: 0,
  };
  const isBotActive = botState?.is_active ?? true;
  const lastActivityIso = botState?.last_activity_iso ?? null;
  const isLoading = isToggling || isBotStateLoading || isStatsLoading;

  useEffect(() => {
    const fmt = (iso?: string | null) => {
      if (!iso) return "-";
      const d = new Date(iso);
      if (isNaN(d.getTime())) return "-";
      const now = Date.now();
      const diffMs = Math.max(0, now - d.getTime());
      const sec = Math.floor(diffMs / 1000);
      if (sec < 60) return "Hace segundos";
      const min = Math.floor(sec / 60);
      if (min < 60) return `Hace ${min} min`;
      const hr = Math.floor(min / 60);
      if (hr < 24) return `Hace ${hr} h`;
      const day = Math.floor(hr / 24);
      return `Hace ${day} d`;
    };
    setRelativeLastActivity(fmt(lastActivityIso));
    const id = setInterval(() => setRelativeLastActivity(fmt(lastActivityIso)), 60000);
    return () => clearInterval(id);
  }, [lastActivityIso]);

  const handleBotToggle = async (_checked: boolean) => {
    try {
      setIsToggling(true);
      const state = await botService.toggleState();
      await mutateBotState(state, { revalidate: false });
      toast.success(state.message);
    } catch (error) {
      logger.error("Error al cambiar el estado del bot:", error);
      toast.error("Error al cambiar el estado del bot");
    } finally {
      setIsToggling(false);
    }
  };

  return (
    <div className="relative w-full">
      {/* ℵ brand watermark — CSS only, no layout cost */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
        <span
          className="aleph-watermark absolute -top-10 -right-6 font-heading font-bold text-primary leading-none select-none"
          style={{ fontSize: "clamp(10rem, 20vw, 18rem)" }}
        >
          ℵ
        </span>
      </div>

      <div className="relative space-y-8">
        <div className="animate-count-reveal" style={{ animationDelay: "0ms" }}>
          <DashboardHeader
            isBotActive={isBotActive}
            isLoading={isLoading}
            relativeLastActivity={relativeLastActivity}
            onToggle={handleBotToggle}
          />
        </div>

        <Divider />

        <div className="animate-count-reveal" style={{ animationDelay: "80ms" }}>
          <DashboardStats stats={stats} isLoading={isLoading} />
        </div>

        <Divider />

        <div className="animate-count-reveal" style={{ animationDelay: "160ms" }}>
          <section>
            <p className="font-heading text-[10px] uppercase tracking-[0.08em] text-muted-foreground/50 mb-4">
              Accesos directos
            </p>
            <DashboardQuickActions />
          </section>
        </div>
      </div>
    </div>
  );
}
