"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import {
  Timer,
  RefreshCw,
  Activity,
  Database,
  Workflow,
  BarChart3,
  Filter,
  Coins,
  HelpCircle,
  Zap,
} from "lucide-react";
import { useRequireAdmin } from "@/app/hooks/useAuthGuard";
import { useRingBuffer } from "@/app/hooks/useRingBuffer";
import { API_URL } from "@/app/lib/config";
import { authenticatedJsonFetcher } from "@/app/lib/services/authService";
import { Skeleton } from "@/app/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/app/components/ui/tabs";
import { TooltipProvider } from "@/app/components/ui/tooltip";
import { Switch } from "@/app/components/ui/switch";
import {
  HealthLabel,
  type Severity,
  type WaterfallStage,
  type GatingItem,
} from "@/app/_components/telemetry";
import { FadeIn, PulseDot, TickNumber } from "@/app/_components/motion";
import {
  PIPELINE_STAGES,
  GATING_SUCCESS_KEYS,
  GATING_LABELS,
  THRESHOLDS,
  REFRESH_MS,
  evalSuccess,
  evalLatency,
  aggregate,
  fmtUptime,
  fmtClock,
  type ObservabilityData,
  type HealthReadyData,
  type SystemStatusData,
} from "./_utils";
import { AlertBanner } from "./_components/AlertBanner";
import { KPISection } from "./_components/KPISection";
import { ServicesSection } from "./_components/ServicesSection";
import { PipelineSection } from "./_components/PipelineSection";
import { ThroughputSection } from "./_components/ThroughputSection";
import { GatingSection } from "./_components/GatingSection";
import { TokensSection } from "./_components/TokensSection";
import { KnowledgeGapsTab } from "./_components/KnowledgeGapsTab";

// ─── Hero ─────────────────────────────────────────────────────────────────────

function HeroZone({
  overall,
  autoRefresh,
  setAutoRefresh,
  isValidating,
  lastRefresh,
  onRefresh,
  uptimeSeconds,
}: {
  overall: Severity;
  autoRefresh: boolean;
  setAutoRefresh: (v: boolean) => void;
  isValidating: boolean;
  lastRefresh: Date | null;
  onRefresh: () => void;
  uptimeSeconds?: number;
}) {
  const severityMap: Record<Severity, { color: string; bg: string; border: string; label: string }> = {
    ok:    { color: "text-success", bg: "bg-success/10",  border: "border-success/30",  label: "saludable" },
    info:  { color: "text-accent-cyan", bg: "bg-accent-cyan/10", border: "border-accent-cyan/30", label: "observando" },
    warn:  { color: "text-warning", bg: "bg-warning/10",  border: "border-warning/30",  label: "atención" },
    crit:  { color: "text-error",   bg: "bg-error/10",    border: "border-error/30",    label: "crítico" },
  };
  const sev = severityMap[overall] ?? severityMap.info;
  const pulseColor: "success" | "cyan" | "warning" | "error" =
    overall === "ok" ? "success" :
    overall === "warn" ? "warning" :
    overall === "crit" ? "error" :
    "cyan";

  return (
    <section className="relative overflow-hidden rounded-3xl border border-border/60 bg-card px-8 py-12 md:px-12 md:py-14 mb-10">
      <div
        aria-hidden="true"
        className="absolute -top-24 -right-24 w-[440px] h-[440px] opacity-50 animate-orb-float pointer-events-none"
      >
        <img src="/assets/decor/glow-orb-cyan.svg" alt="" className="w-full h-full" />
      </div>
      <div
        aria-hidden="true"
        className="absolute -bottom-32 -left-20 w-[460px] h-[460px] opacity-35 animate-orb-float pointer-events-none"
        style={{ animationDelay: "-9s" }}
      >
        <img src="/assets/decor/glow-orb-violet.svg" alt="" className="w-full h-full" />
      </div>
      <div
        aria-hidden="true"
        className="absolute right-12 top-1/2 -translate-y-1/2 w-40 opacity-30 text-accent-violet pointer-events-none hidden lg:block"
      >
        <img src="/assets/decor/embedding-cloud.svg" alt="" className="w-full" loading="lazy" />
      </div>
      <div
        aria-hidden="true"
        className="absolute left-16 bottom-10 w-28 opacity-25 text-accent-cyan pointer-events-none hidden md:block"
      >
        <img src="/assets/decor/pulse-wave.svg" alt="" className="w-full" loading="lazy" />
      </div>
      <div aria-hidden="true" className="absolute inset-0 bg-grid opacity-30 pointer-events-none" />

      <div className="relative flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex items-center gap-2.5 mb-4">
            <span className="font-mono text-[11px] text-primary/70 tabular-nums">01 / 06</span>
            <span className="h-px w-8 bg-primary/40" />
            <span className="text-[10px] uppercase tracking-[0.18em] font-heading text-muted-foreground">
              Telemetría · backend
            </span>
          </div>

          <h1 className="text-4xl md:text-5xl lg:text-6xl font-heading font-bold tracking-tighter leading-[1.02] mb-3">
            <span className="gradient-hero-display">Estado del sistema</span>
          </h1>

          <p className="text-base md:text-lg text-muted-foreground max-w-2xl">
            Métricas en vivo del backend RAG. Inferencia, datos, pipeline.
          </p>

          <div className="flex flex-wrap items-center gap-3 mt-5">
            <div className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-full ${sev.bg} border ${sev.border}`}>
              <PulseDot color={pulseColor} size={6} />
              <span className={`text-[11px] font-mono uppercase tracking-wider ${sev.color}`}>
                {sev.label}
              </span>
            </div>
            <HealthLabel severity={overall} />
            {uptimeSeconds != null && (
              <span className="inline-flex items-center gap-1.5 text-[11px] font-mono text-muted-foreground tabular-nums">
                <Timer className="h-3 w-3 text-accent-violet" />
                uptime {fmtUptime(uptimeSeconds)}
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-col items-stretch md:items-end gap-3 self-start">
          <label className="inline-flex items-center gap-2.5 px-3 py-1.5 rounded-lg border border-border bg-background/40 backdrop-blur-sm cursor-pointer">
            <Switch
              checked={autoRefresh}
              onCheckedChange={setAutoRefresh}
              className="h-4 w-8 [&>span]:h-3 [&>span]:w-3 [&>span[data-state=checked]]:translate-x-4"
            />
            <span className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
              auto · 30s
            </span>
          </label>
          <button
            type="button"
            onClick={onRefresh}
            disabled={isValidating}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-border bg-background/40 backdrop-blur-sm text-xs font-mono text-muted-foreground hover:text-foreground hover:border-primary/40 hover:bg-primary/[0.04] transition-all duration-200 ease-out-expo disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isValidating ? "animate-spin text-primary" : ""}`} />
            {lastRefresh ? fmtClock(lastRefresh) : "--:--"}
          </button>
        </div>
      </div>
    </section>
  );
}

// ─── Section header ───────────────────────────────────────────────────────────

function SectionHeader({
  index,
  total,
  title,
  icon: Icon,
  iconColor = "text-primary",
}: {
  index: string;
  total: string;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  iconColor?: string;
}) {
  return (
    <div className="flex items-center gap-3 mb-5 mt-2">
      <span className="font-mono text-[11px] text-primary/70 tabular-nums">{index} / {total}</span>
      <span className={`${iconColor} flex-shrink-0`}>
        <Icon className="h-4 w-4" />
      </span>
      <h2 className="text-xs uppercase tracking-[0.16em] font-heading text-muted-foreground whitespace-nowrap">
        {title}
      </h2>
      <span className="h-px flex-1 bg-gradient-to-r from-border via-border to-transparent" />
    </div>
  );
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="space-y-10">
      <div className="space-y-5">
        <Skeleton className="h-4 w-48 rounded" />
        <Skeleton className="h-36 w-full rounded-2xl" />
      </div>
      <div className="space-y-5">
        <Skeleton className="h-4 w-56 rounded" />
        <Skeleton className="h-28 w-full rounded-2xl" />
      </div>
      <div className="space-y-5">
        <Skeleton className="h-4 w-44 rounded" />
        <Skeleton className="h-48 w-full rounded-2xl" />
      </div>
      <div className="space-y-5">
        <Skeleton className="h-4 w-52 rounded" />
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          <Skeleton className="h-44 w-full rounded-2xl lg:col-span-3" />
          <Skeleton className="h-44 w-full rounded-2xl lg:col-span-2" />
        </div>
      </div>
      <div className="space-y-5">
        <Skeleton className="h-4 w-40 rounded" />
        <Skeleton className="h-32 w-full rounded-2xl" />
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ObservabilityPage() {
  const { isAuthorized, isChecking } = useRequireAdmin();
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  useEffect(() => { setLastRefresh(new Date()); }, []);

  const { data, isLoading, error, mutate, isValidating } = useSWR<ObservabilityData>(
    isAuthorized ? `${API_URL}/dashboard/observability` : null,
    authenticatedJsonFetcher,
    { refreshInterval: autoRefresh ? REFRESH_MS : 0, onSuccess: () => setLastRefresh(new Date()) },
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

  const handleRefresh = useCallback(() => { mutate(); }, [mutate]);

  const t60 = data?.throughput?.["60m"];
  const successRate60 = t60 && t60.chats > 0 ? 1 - t60.error_rate : null;
  const totalP95 = data?.latency_ms?.total_ms?.p95 ?? null;
  const totalP50 = data?.latency_ms?.total_ms?.p50 ?? null;
  const ftP95 = data?.latency_ms?.first_token_ms?.p95 ?? null;

  useRingBuffer(successRate60 != null ? successRate60 * 100 : null, { capacity: 60, storageKey: "success60" });
  useRingBuffer(t60?.chats_per_min ?? null, { capacity: 60, storageKey: "chats_per_min" });
  useRingBuffer(ftP95, { capacity: 60, storageKey: "ft_p95" });
  useRingBuffer(totalP95, { capacity: 60, storageKey: "total_p95" });
  const mongoLatBuf = useRingBuffer(healthData?.mongodb?.latency_ms ?? null, { capacity: 60, storageKey: "mongo_lat" });
  const qdrantLatBuf = useRingBuffer(healthData?.qdrant?.latency_ms ?? null, { capacity: 60, storageKey: "qdrant_lat" });

  const { overall, severities } = useMemo(() => {
    const successSev: Severity = !t60 || t60.chats < 20 ? "info" : evalSuccess(successRate60);
    const totalSev = evalLatency(totalP95, THRESHOLDS.p95Total);
    const ftSev = evalLatency(ftP95, THRESHOLDS.p95FirstToken);
    const totalAlertSev = evalLatency(totalP95, THRESHOLDS.p95TotalAlert);
    const ftAlertSev = evalLatency(ftP95, THRESHOLDS.p95FirstTokenAlert);
    return { severities: { successSev, totalSev, ftSev }, overall: aggregate(successSev, totalAlertSev, ftAlertSev) };
  }, [t60, successRate60, totalP95, ftP95]);

  const stages: WaterfallStage[] = useMemo(() => {
    if (!data) return [];
    return PIPELINE_STAGES
      .map((stage) => {
        const bucket = data.latency_ms[stage.key];
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
      })
      .filter(Boolean) as WaterfallStage[];
  }, [data]);

  const { filteredGatingItems, filteredGatingTotal, cantAnswerCount } = useMemo(() => {
    if (!data) return { filteredGatingItems: [] as GatingItem[], filteredGatingTotal: 0, cantAnswerCount: 0 };
    const allItems: GatingItem[] = Object.entries(data.gating_reasons || {}).map(([key, count]) => ({
      key,
      label: GATING_LABELS[key] ?? key,
      count,
    }));
    const items = allItems.filter((item) => !GATING_SUCCESS_KEYS.has(item.key));
    const cant =
      (data.gating_reasons?.no_candidates ?? 0) +
      (data.gating_reasons?.no_parent_candidates ?? 0) +
      (data.gating_reasons?.reranker_empty ?? 0) +
      (data.gating_reasons?.low_relevance_score ?? 0);
    return {
      filteredGatingItems: items,
      filteredGatingTotal: items.reduce((acc, it) => acc + it.count, 0),
      cantAnswerCount: cant,
    };
  }, [data]);

  if (isChecking || !isAuthorized) return null;

  return (
    <TooltipProvider>
      <div className="min-h-full -m-8 p-6 md:p-10 lg:p-14">
        <div className="mx-auto max-w-[1200px]">

          <FadeIn>
            <HeroZone
              overall={overall}
              autoRefresh={autoRefresh}
              setAutoRefresh={setAutoRefresh}
              isValidating={isValidating}
              lastRefresh={lastRefresh}
              onRefresh={handleRefresh}
              uptimeSeconds={data?.uptime_seconds}
            />
          </FadeIn>

          <AlertBanner overall={overall} error={error} hasData={!!data} />

          <FadeIn delay={0.08}>
            <Tabs defaultValue="metrics" className="w-full">
              <TabsList className="mb-8 bg-card border border-border rounded-xl p-1 h-auto">
                <TabsTrigger
                  value="metrics"
                  className="inline-flex items-center gap-2 px-4 py-2 text-xs font-heading uppercase tracking-wider data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-glow-primary rounded-lg transition-all"
                >
                  <Activity className="h-3.5 w-3.5" />
                  Métricas
                </TabsTrigger>
                <TabsTrigger
                  value="gaps"
                  className="inline-flex items-center gap-2 px-4 py-2 text-xs font-heading uppercase tracking-wider data-[state=active]:bg-accent-violet/10 data-[state=active]:text-accent-violet data-[state=active]:shadow-glow-violet rounded-lg transition-all"
                >
                  <HelpCircle className="h-3.5 w-3.5" />
                  Vacíos de conocimiento
                </TabsTrigger>
              </TabsList>

              <TabsContent value="metrics">
                {isLoading && !data ? (
                  <LoadingSkeleton />
                ) : data ? (
                  <div className="space-y-10">
                    <section>
                      <SectionHeader index="02" total="06" title="Indicadores clave" icon={Zap} iconColor="text-accent-cyan" />
                      <KPISection
                        t60={t60}
                        successRate60={successRate60}
                        ftP95={ftP95}
                        totalP95={totalP95}
                        cantAnswerCount={cantAnswerCount}
                        severities={severities}
                      />
                    </section>

                    <section>
                      <SectionHeader index="03" total="06" title="Servicios + datos" icon={Database} iconColor="text-accent-violet" />
                      <ServicesSection
                        healthData={healthData}
                        statusData={statusData}
                        mongoLatBuf={mongoLatBuf}
                        qdrantLatBuf={qdrantLatBuf}
                      />
                    </section>

                    <section>
                      <SectionHeader index="04" total="06" title="Pipeline RAG" icon={Workflow} iconColor="text-primary" />
                      <PipelineSection stages={stages} totalP50={totalP50} totalP95={totalP95} />
                    </section>

                    <section>
                      <SectionHeader index="05" total="06" title="Throughput + gating" icon={BarChart3} iconColor="text-accent-cyan" />
                      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                        <ThroughputSection throughput={data.throughput} />
                        <GatingSection items={filteredGatingItems} total={filteredGatingTotal} />
                      </div>
                    </section>

                    <section>
                      <SectionHeader index="06" total="06" title="Consumo LLM" icon={Coins} iconColor="text-accent-violet" />
                      <TokensSection tokens={data.tokens} />
                    </section>

                    <footer className="pt-6 mt-4 flex items-center gap-3 border-t border-border/40">
                      <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent-violet/10 border border-accent-violet/25">
                        <Timer className="h-3 w-3 text-accent-violet" />
                        <span className="text-[10px] font-mono uppercase tracking-wider text-accent-violet">Uptime</span>
                      </div>
                      <span className="font-mono text-sm text-foreground tabular-nums">
                        {data.uptime_seconds != null ? (
                          <TickNumber value={data.uptime_seconds} suffix="s" />
                        ) : "s/d"}
                      </span>
                      <span className="text-xs text-muted-foreground font-mono">
                        ≈ {fmtUptime(data.uptime_seconds) || "s/d"}
                      </span>
                    </footer>
                  </div>
                ) : null}
              </TabsContent>

              <TabsContent value="gaps">
                <KnowledgeGapsTab isAuthorized={isAuthorized} />
              </TabsContent>
            </Tabs>
          </FadeIn>

        </div>
      </div>
    </TooltipProvider>
  );
}
