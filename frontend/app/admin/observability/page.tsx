"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { Activity, HelpCircle } from "lucide-react";
import { useRequireAdmin } from "@/app/hooks/useAuthGuard";
import { useRingBuffer } from "@/app/hooks/useRingBuffer";
import { API_URL } from "@/app/lib/config";
import { authenticatedJsonFetcher } from "@/app/lib/services/authService";
import { TooltipProvider } from "@/app/components/ui/tooltip";
import {
  type Severity,
  type WaterfallStage,
  type GatingItem,
} from "@/app/_components/telemetry";
import { PulseDot } from "@/app/_components/motion";
import {
  PIPELINE_STAGES,
  GATING_SUCCESS_KEYS,
  GATING_LABELS,
  THRESHOLDS,
  REFRESH_MS,
  evalSuccess,
  evalLatency,
  aggregate,
  type ObservabilityData,
  type HealthReadyData,
  type SystemStatusData,
} from "./_utils";
import { KPISection } from "./_components/KPISection";
import { PipelineFlow } from "./_components/PipelineFlow";
import { ThroughputSection } from "./_components/ThroughputSection";
import { GatingSection } from "./_components/GatingSection";
import { TokensSection } from "./_components/TokensSection";
import { KnowledgeGapsTab } from "./_components/KnowledgeGapsTab";
import { ServicePanel } from "./_components/ServicePanel";
import { FloatingAlert } from "./_components/FloatingAlert";
import { RefreshCountdown } from "./_components/RefreshCountdown";

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ObservabilityPage() {
  const { isAuthorized, isChecking } = useRequireAdmin();
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [tab, setTab] = useState<"metrics" | "gaps">("metrics");
  const [dismissedMessages, setDismissedMessages] = useState<string[]>([]);

  useEffect(() => {
    void autoRefresh; // keep autoRefresh state for future toggle
  }, [autoRefresh]);

  const {
    data: obsData,
    isLoading,
    error,
    mutate,
    isValidating,
  } = useSWR<ObservabilityData>(
    isAuthorized ? `${API_URL}/dashboard/observability` : null,
    authenticatedJsonFetcher,
    { refreshInterval: autoRefresh ? REFRESH_MS : 0 },
  );

  const { data: healthData } = useSWR<HealthReadyData>(
    isAuthorized ? `${API_URL}/health/ready` : null,
    authenticatedJsonFetcher,
    { refreshInterval: 15000 },
  );
  const { data: statusData } = useSWR<SystemStatusData>(
    isAuthorized ? `${API_URL}/internal/status` : null,
    authenticatedJsonFetcher,
    { refreshInterval: 15000 },
  );

  const handleRefresh = useCallback(() => {
    mutate();
  }, [mutate]);
  void handleRefresh; // available for future use

  const t60 = obsData?.throughput?.["60m"];
  const successRate60 = t60 && t60.chats > 0 ? 1 - t60.error_rate : null;
  const totalP95 = obsData?.latency_ms?.total_ms?.p95 ?? null;
  const totalP50 = obsData?.latency_ms?.total_ms?.p50 ?? null;
  const ftP95 = obsData?.latency_ms?.first_token_ms?.p95 ?? null;

  useRingBuffer(successRate60 != null ? successRate60 * 100 : null, {
    capacity: 60,
    storageKey: "success60",
  });
  useRingBuffer(t60?.chats_per_min ?? null, {
    capacity: 60,
    storageKey: "chats_per_min",
  });
  useRingBuffer(ftP95, { capacity: 60, storageKey: "ft_p95" });
  useRingBuffer(totalP95, { capacity: 60, storageKey: "total_p95" });
  useRingBuffer(healthData?.mongodb?.latency_ms ?? null, {
    capacity: 60,
    storageKey: "mongo_lat",
  });
  useRingBuffer(healthData?.qdrant?.latency_ms ?? null, {
    capacity: 60,
    storageKey: "qdrant_lat",
  });

  const { overall, severities } = useMemo(() => {
    const successSev: Severity =
      !t60 || t60.chats < 20 ? "info" : evalSuccess(successRate60);
    const totalSev = evalLatency(totalP95, THRESHOLDS.p95Total);
    const ftSev = evalLatency(ftP95, THRESHOLDS.p95FirstToken);
    const totalAlertSev = evalLatency(totalP95, THRESHOLDS.p95TotalAlert);
    const ftAlertSev = evalLatency(ftP95, THRESHOLDS.p95FirstTokenAlert);
    return {
      severities: { successSev, totalSev, ftSev },
      overall: aggregate(successSev, totalAlertSev, ftAlertSev),
    };
  }, [t60, successRate60, totalP95, ftP95]);

  const stages: WaterfallStage[] = useMemo(() => {
    if (!obsData) return [];
    return PIPELINE_STAGES.map((stage) => {
      const bucket = obsData.latency_ms[stage.key];
      if (!bucket || bucket.count === 0) return null;
      const t = THRESHOLDS.pipeline[stage.key] ?? { ok: 1000, warn: 3000 };
      return {
        key: stage.key,
        label: stage.label,
        short: stage.short,
        p50: bucket.p50,
        p95: bucket.p95,
        count: bucket.count,
        severity: evalLatency(bucket.p95, t),
      };
    }).filter(Boolean) as WaterfallStage[];
  }, [obsData]);

  const bottleneckStageId = useMemo(() => {
    if (stages.length === 0) return undefined;
    const warnOrCrit = stages.filter(
      (s) => s.severity === "warn" || s.severity === "crit",
    );
    if (warnOrCrit.length === 0) return undefined;
    return warnOrCrit.reduce((a, b) => ((a.p95 ?? 0) > (b.p95 ?? 0) ? a : b))
      .key;
  }, [stages]);

  const { filteredGatingItems, filteredGatingTotal, cantAnswerCount } =
    useMemo(() => {
      if (!obsData)
        return {
          filteredGatingItems: [] as GatingItem[],
          filteredGatingTotal: 0,
          cantAnswerCount: 0,
        };
      const allItems: GatingItem[] = Object.entries(
        obsData.gating_reasons || {},
      ).map(([key, count]) => ({
        key,
        label: GATING_LABELS[key] ?? key,
        count,
      }));
      const items = allItems.filter(
        (item) => !GATING_SUCCESS_KEYS.has(item.key),
      );
      const cant =
        (obsData.gating_reasons?.no_candidates ?? 0) +
        (obsData.gating_reasons?.no_parent_candidates ?? 0) +
        (obsData.gating_reasons?.reranker_empty ?? 0) +
        (obsData.gating_reasons?.low_relevance_score ?? 0);
      return {
        filteredGatingItems: items,
        filteredGatingTotal: items.reduce((acc, it) => acc + it.count, 0),
        cantAnswerCount: cant,
      };
    }, [obsData]);

  // ── Alerts ────────────────────────────────────────────────────────────────
  const rawAlerts = useMemo(() => {
    const list: Array<{
      severity: "ok" | "warn" | "crit" | "info";
      message: string;
    }> = [];
    if (error && !obsData) {
      list.push({
        severity: "crit",
        message: "No se pudo cargar las métricas",
      });
    }
    if (overall === "crit") {
      list.push({ severity: "crit", message: "Sistema en estado crítico" });
    } else if (overall === "warn") {
      list.push({
        severity: "warn",
        message: "Una o más métricas fuera de objetivo",
      });
    }
    return list;
  }, [overall, error, obsData]);

  const activeAlerts = useMemo(
    () => rawAlerts.filter((a) => !dismissedMessages.includes(a.message)),
    [rawAlerts, dismissedMessages],
  );

  const dismissAlert = useCallback(
    (index: number) => {
      const alert = activeAlerts[index];
      if (alert) {
        setDismissedMessages((prev) => [...prev, alert.message]);
      }
    },
    [activeAlerts],
  );

  // Reset dismissed when overall severity changes
  useEffect(() => {
    setDismissedMessages([]);
  }, [overall]);

  if (isChecking || !isAuthorized) return null;

  const systemStatusLabel =
    overall === "ok"
      ? "SISTEMA OPERATIVO"
      : overall === "warn"
        ? "ATENCIÓN REQUERIDA"
        : overall === "crit"
          ? "ESTADO CRÍTICO"
          : "OBSERVANDO";

  const statusPulseColor: "success" | "warning" | "error" | "cyan" =
    overall === "ok"
      ? "success"
      : overall === "warn"
        ? "warning"
        : overall === "crit"
          ? "error"
          : "cyan";

  const statusTextColor =
    overall === "ok"
      ? "text-emerald-400"
      : overall === "warn"
        ? "text-amber-400"
        : overall === "crit"
          ? "text-rose-400"
          : "text-cyan-400";

  const statusBgBorder =
    overall === "ok"
      ? "bg-emerald-500/[0.08] border-emerald-500/20"
      : overall === "warn"
        ? "bg-amber-500/[0.08] border-amber-500/20"
        : overall === "crit"
          ? "bg-rose-500/[0.08] border-rose-500/20"
          : "bg-cyan-500/[0.08] border-cyan-500/20";

  return (
    <TooltipProvider>
      <div className="min-h-screen -m-8 bg-background">
        {/* ── TOPBAR ─────────────────────────────────────────────────────────── */}
        <header className="sticky top-0 z-50 flex items-center justify-between px-6 py-3 border-b border-border bg-background/80 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <span className="text-[11px] font-bold tracking-[0.18em] uppercase text-muted-foreground">
              Mission Control
            </span>
            <span
              className={`flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1 rounded-full border ${statusTextColor} ${statusBgBorder}`}
            >
              <PulseDot color={statusPulseColor} size={6} />
              {systemStatusLabel}
            </span>
          </div>

          <div className="flex items-center gap-4">
            <RefreshCountdown
              intervalMs={REFRESH_MS}
              isRefreshing={isValidating}
            />

            {/* Tab switcher */}
            <div
              className="flex items-center gap-1 rounded-lg p-1 bg-muted/50 border border-border"
              role="tablist"
              aria-label="Secciones"
            >
              <button
                role="tab"
                aria-selected={tab === "metrics"}
                type="button"
                onClick={() => setTab("metrics")}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-semibold uppercase tracking-wide transition-all ${
                  tab === "metrics"
                    ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Activity className="h-3 w-3" aria-hidden="true" />
                Métricas
              </button>
              <button
                role="tab"
                aria-selected={tab === "gaps"}
                type="button"
                onClick={() => setTab("gaps")}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-semibold uppercase tracking-wide transition-all ${
                  tab === "gaps"
                    ? "bg-violet-500/10 text-violet-400 border border-violet-500/20"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <HelpCircle className="h-3 w-3" aria-hidden="true" />
                Vacíos
              </button>
            </div>
          </div>
        </header>

        {/* ── FLOATING ALERT ─────────────────────────────────────────────────── */}
        <FloatingAlert alerts={activeAlerts} onDismiss={dismissAlert} />

        {/* ── BODY: sidebar + main ─────────────────────────────────────────── */}
        <div
          className="grid"
          style={{
            gridTemplateColumns: "264px 1fr",
            minHeight: "calc(100vh - 49px)",
          }}
        >
          {/* Left panel */}
          <ServicePanel
            health={healthData ?? null}
            status={statusData ?? null}
            obs={obsData ?? null}
          />

          {/* Main content */}
          <main
            className="overflow-y-auto p-5 flex flex-col gap-3"
            data-surface="telemetry"
            role="tabpanel"
            aria-label={
              tab === "metrics" ? "Métricas" : "Vacíos de conocimiento"
            }
          >
            {tab === "metrics" && (
              <>
                {isLoading && !obsData ? (
                  <MetricsSkeleton />
                ) : obsData ? (
                  <>
                    <KPISection
                      t60={t60}
                      successRate60={successRate60}
                      ftP95={ftP95}
                      totalP95={totalP95}
                      cantAnswerCount={cantAnswerCount}
                      severities={severities}
                    />

                    <PipelineFlow
                      stages={stages}
                      bottleneckStageId={bottleneckStageId}
                    />

                    <div className="grid grid-cols-2 gap-3">
                      <ThroughputSection throughput={obsData.throughput} />
                      <TokensSection tokens={obsData.tokens} />
                    </div>

                    <div>
                      <GatingSection
                        items={filteredGatingItems}
                        total={filteredGatingTotal}
                      />
                    </div>
                  </>
                ) : null}
              </>
            )}

            {tab === "gaps" && <KnowledgeGapsTab isAuthorized={isAuthorized} />}
          </main>
        </div>
      </div>
    </TooltipProvider>
  );
}

function MetricsSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-36 rounded-xl bg-muted/40" />
      <div className="h-40 rounded-xl bg-muted/40" />
      <div className="grid grid-cols-2 gap-3">
        <div className="h-32 rounded-xl bg-muted/40" />
        <div className="h-32 rounded-xl bg-muted/40" />
      </div>
      <div className="h-28 rounded-xl bg-muted/40" />
    </div>
  );
}
