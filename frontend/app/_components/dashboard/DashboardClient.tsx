"use client";

import { useEffect, useState } from "react";
import { logger } from "@/app/lib/logger";
import { toast } from "sonner";
import { botService } from "@/app/lib/services/botService";
import { statsService } from "@/app/lib/services/statsService";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/app/components/ui/card";
import dynamic from "next/dynamic";
import { Suspense } from "react";
import { Skeleton } from "@/app/components/ui/skeleton";
import DashboardHeader from "./DashboardHeader";
import DashboardStats from "./DashboardStats";
import DashboardQuickActions from "./DashboardQuickActions";

const DashboardChartsLazy = dynamic(
  () => import("@/components/dashboard/DashboardCharts"),
  { ssr: false, suspense: true }
);

function ChartsSkeleton() {
  return (
    <div className="h-[380px] w-full">
      <Skeleton className="w-full h-full rounded-xl" />
    </div>
  );
}

export default function DashboardClient() {
  const [isBotActive, setIsBotActive] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [lastActivityIso, setLastActivityIso] = useState<string | null>(null);
  const [relativeLastActivity, setRelativeLastActivity] = useState<string>("-");

  const [stats, setStats] = useState({
    total_queries: 0,
    total_users: 0,
    total_pdfs: 0,
  });

  useEffect(() => {
    const fetchData = async () => {
      try {
        const results = await Promise.allSettled([botService.getState(), statsService.getStats()]);
        const botRes = results[0];
        const statsRes = results[1];
        if (botRes.status === "fulfilled") {
          setIsBotActive(botRes.value.is_active);
          setLastActivityIso(botRes.value.last_activity_iso ?? null);
        } else {
          logger.warn("Estado del bot no disponible:", botRes.reason);
        }
        if (statsRes.status === "fulfilled") {
          setStats(statsRes.value);
        } else {
          logger.warn("Estadísticas no disponibles:", statsRes.reason);
        }
      } catch (error) {
        logger.error("Error al obtener datos:", error);
        toast.error("Error al obtener datos del dashboard");
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, []);

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

  const handleBotToggle = async (checked: boolean) => {
    try {
      setIsLoading(true);
      const state = await botService.toggleState();
      setIsBotActive(state.is_active);
      toast.success(state.message);
    } catch (error) {
      logger.error("Error al cambiar el estado del bot:", error);
      toast.error("Error al cambiar el estado del bot");
      setIsBotActive(!checked);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-8 animate-fade-in w-full">
      {/* Header Section */}
      <DashboardHeader
        isBotActive={isBotActive}
        isLoading={isLoading}
        relativeLastActivity={relativeLastActivity}
        onToggle={handleBotToggle}
      />

      {/* KPI Stats Cards */}
      <DashboardStats stats={stats} isLoading={isLoading} />

      {/* Main Content Grid */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Chart Card - Takes 2 columns */}
        <Card className="lg:col-span-2 p-6">
          <Suspense fallback={<ChartsSkeleton />}>
            <DashboardChartsLazy />
          </Suspense>
        </Card>

        {/* Quick Actions Card */}
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
