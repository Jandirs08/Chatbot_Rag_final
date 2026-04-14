"use client";

import { Suspense, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { logger } from "@/app/lib/logger";
import { toast } from "sonner";
import { botService } from "@/app/lib/services/botService";
import {
  useBotState,
  useDashboardStats,
} from "@/app/hooks/useDashboardData";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import { Skeleton } from "@/app/components/ui/skeleton";
import DashboardHeader from "./DashboardHeader";
import DashboardStats from "./DashboardStats";
import DashboardQuickActions from "./DashboardQuickActions";

const DashboardChartsLazy = dynamic(
  () => import("@/components/dashboard/DashboardCharts"),
  { ssr: false, suspense: true },
);

function ChartsSkeleton() {
  return (
    <div className="h-[380px] w-full">
      <Skeleton className="w-full h-full rounded-xl" />
    </div>
  );
}

export default function DashboardClient() {
  const {
    data: botState,
    isLoading: isBotStateLoading,
    mutate: mutateBotState,
  } = useBotState();
  const { data: statsData, isLoading: isStatsLoading } = useDashboardStats();
  const [isToggling, setIsToggling] = useState(false);
  const [relativeLastActivity, setRelativeLastActivity] = useState<string>("-");

  const stats = statsData ?? {
    total_queries: 0,
    total_users: 0,
    total_pdfs: 0,
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
    const id = setInterval(() => {
      setRelativeLastActivity(fmt(lastActivityIso));
    }, 60000);
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
    <div className="space-y-8 animate-fade-in w-full">
      <DashboardHeader
        isBotActive={isBotActive}
        isLoading={isLoading}
        relativeLastActivity={relativeLastActivity}
        onToggle={handleBotToggle}
      />

      <DashboardStats stats={stats} isLoading={isLoading} />

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <Card className="lg:col-span-2 p-6">
          <Suspense fallback={<ChartsSkeleton />}>
            <DashboardChartsLazy />
          </Suspense>
        </Card>

        <Card className="lg:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg font-semibold text-slate-900 dark:text-white">
              Accesos Directos
            </CardTitle>
            <CardDescription className="text-sm text-slate-500 dark:text-slate-400">
              Acciones rápidas del sistema
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-2">
            <DashboardQuickActions />
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
