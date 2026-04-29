"use client";

import { useMemo } from "react";
import { Badge } from "@/app/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/app/components/ui/tooltip";
import { cn } from "@/app/lib/utils";
import {
  Ban,
  BrainCircuit,
  Clock,
  Database,
  Hash,
  Info,
  MessageSquare,
  Shield,
  ShieldCheck,
  Thermometer,
  Ticket,
  Zap,
} from "lucide-react";
import {
  GATING_EXPLAIN,
  GATING_MAP,
  GATING_TONE_MAP,
  fmtMsVal,
  fmtSVal,
  fmtTokVal,
  type DebugData,
  type RetrievedDoc,
} from "@/app/components/debug/utils";

interface DebugSummaryCardProps {
  data: DebugData;
  docs: RetrievedDoc[];
}

type StageMetric = {
  key: string;
  label: string;
  value: number | null;
  help: string;
  accent: string;
};

function num(v: unknown): number | null {
  return typeof v === "number" ? v : null;
}

function TimelineNode({
  completed,
  active,
  icon,
  label,
}: {
  completed: boolean;
  active: boolean;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={cn(
            "relative flex items-center justify-center w-5 h-5 rounded-full",
            completed ? "bg-success" : active ? "bg-primary" : "bg-muted",
            active && "ring-2 ring-primary/50 animate-pulse",
          )}
        >
          <div className="text-primary-foreground">{icon}</div>
        </div>
      </TooltipTrigger>
      <TooltipContent className="text-xs">{label}</TooltipContent>
    </Tooltip>
  );
}

function TimelineLine({ active }: { active: boolean }) {
  return (
    <div
      className={cn(
        "h-[2px] w-12",
        active ? "bg-primary" : "bg-muted",
        "transition-all duration-500",
      )}
    />
  );
}

function DebugPipelineTimeline({
  data,
  docs,
  embeddingMs,
  ragTime,
  llmTime,
  totalTime,
  gatingText,
  gatingReason,
}: {
  data: DebugData;
  docs: RetrievedDoc[];
  embeddingMs: number | null;
  ragTime: number | null;
  llmTime: number | null;
  totalTime: number | null;
  gatingText: string;
  gatingReason: string;
}) {
  const ragT = docs.length > 0 || embeddingMs !== null ? (ragTime ?? 0) : 0;
  const llmOnlyT = Math.max(0, (llmTime ?? 0) - ragT);
  const tot = (totalTime ?? 0) > 0 ? totalTime! : ragT + llmOnlyT || 0;
  const overhead = Math.max(0, tot - (ragT + llmOnlyT));
  const minSeg = 15;
  let rPct = tot > 0 ? (ragT / tot) * 100 : 0;
  let lPct = tot > 0 ? (llmOnlyT / tot) * 100 : 0;
  let oPct = tot > 0 ? (overhead / tot) * 100 : 0;

  if (tot > 0) {
    if (ragT > 0) rPct = Math.max(minSeg, rPct);
    if (llmOnlyT > 0) lPct = Math.max(minSeg, lPct);
    const extra = rPct + lPct + oPct - 100;
    if (extra > 0) {
      oPct = Math.max(0, oPct - extra);
    } else if (extra < 0) {
      oPct += Math.abs(extra);
    }
  }

  const ragActuallySearched = docs.length > 0 || embeddingMs !== null;
  const intentCompleted = Boolean(gatingReason || gatingText);
  const searchCompleted = ragActuallySearched;
  const retrievalCompleted = docs.length > 0;
  const responseCompleted = llmTime !== null;
  const verdictCompleted = Boolean(data.verification);
  const activeStage = verdictCompleted
    ? "veredicto"
    : responseCompleted
      ? "respuesta"
      : retrievalCompleted
        ? "razonamiento"
        : searchCompleted
          ? "recuperacion"
          : intentCompleted
            ? "busqueda"
            : "intencion";

  return (
    <div className="relative space-y-5">
      <div className="flex items-center justify-center gap-3">
        <div className="flex flex-wrap md:flex-nowrap items-center justify-center gap-2 overflow-x-auto md:overflow-visible">
          <TimelineNode
            completed={intentCompleted}
            active={activeStage === "intencion"}
            icon={<BrainCircuit className="w-3 h-3" />}
            label="Intención"
          />
          <TimelineLine active={activeStage === "busqueda"} />
          <TimelineNode
            completed={searchCompleted}
            active={activeStage === "busqueda"}
            icon={<Database className="w-3 h-3" />}
            label="Búsqueda RAG"
          />
          <TimelineLine active={activeStage === "recuperacion"} />
          <TimelineNode
            completed={retrievalCompleted}
            active={activeStage === "recuperacion"}
            icon={<Database className="w-3 h-3" />}
            label="Recuperación"
          />
          <TimelineLine active={activeStage === "razonamiento"} />
          <TimelineNode
            completed={responseCompleted}
            active={activeStage === "razonamiento"}
            icon={<Zap className="w-3 h-3" />}
            label="Razonamiento"
          />
          <TimelineLine active={activeStage === "respuesta"} />
          <TimelineNode
            completed={responseCompleted}
            active={activeStage === "respuesta"}
            icon={<MessageSquare className="w-3 h-3" />}
            label="Respuesta"
          />
          {data.verification != null && (
            <>
              <TimelineLine active={activeStage === "veredicto"} />
              <TimelineNode
                completed={verdictCompleted}
                active={activeStage === "veredicto"}
                icon={
                  data.verification.is_grounded ? (
                    <ShieldCheck className="w-3 h-3" />
                  ) : (
                    <Shield className="w-3 h-3" />
                  )
                }
                label="Veredicto"
              />
            </>
          )}
        </div>
      </div>
      <div className="w-full">
        <div className="flex mb-2 text-xs text-slate-800">
          <div
            style={{ width: `${Math.max(0, Math.min(100, rPct))}%` }}
            className="relative"
          >
            <div className="flex justify-center">
              {typeof ragTime === "number" &&
                ragTime >= 0.01 &&
                ragActuallySearched && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="px-2 py-[2px] rounded bg-warning text-warning-foreground">
                        RAG {fmtSVal(ragTime)}s
                      </span>
                    </TooltipTrigger>
                    <TooltipContent className="text-xs">
                      Tiempo de búsqueda en el corpus
                    </TooltipContent>
                  </Tooltip>
                )}
            </div>
          </div>
          <div
            style={{ width: `${Math.max(0, Math.min(100, lPct))}%` }}
            className="relative"
          >
            <div className="flex justify-center">
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="px-2 py-[2px] rounded bg-info text-info-foreground">
                    LLM {fmtSVal(llmOnlyT > 0 ? llmOnlyT : llmTime)}s
                  </span>
                </TooltipTrigger>
                <TooltipContent className="text-xs">
                  Inferencia del modelo (excluye RAG)
                </TooltipContent>
              </Tooltip>
            </div>
          </div>
          {oPct > 0 && (
            <div
              style={{ width: `${Math.max(0, Math.min(100, oPct))}%` }}
            />
          )}
        </div>
        <div className="h-8 rounded-full bg-muted overflow-hidden flex">
          <div
            className="h-full bg-warning transition-all"
            style={{ width: `${Math.max(0, Math.min(100, rPct))}%` }}
          />
          <div
            className="h-full bg-info transition-all"
            style={{ width: `${Math.max(0, Math.min(100, lPct))}%` }}
          />
          {oPct > 0 && (
            <div
              className="h-full bg-muted-foreground/30 transition-all"
              style={{ width: `${Math.max(0, Math.min(100, oPct))}%` }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function StageMetrics({ metrics }: { metrics: StageMetric[] }) {
  if (metrics.length === 0) return null;

  return (
    <div className="rounded-[20px] border border-border/60 bg-surface/80 p-4 dark:bg-slate-900 dark:border-slate-800">
      <div className="mb-3 flex items-center gap-2">
        <Clock className="h-4 w-4 text-muted-foreground" />
        <div>
          <div className="text-xs font-semibold text-foreground">
            Tiempos por etapa
          </div>
          <div className="text-[11px] text-muted-foreground">
            Métricas internas del pipeline
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (
          <Tooltip key={metric.key}>
            <TooltipTrigger asChild>
              <div
                className={cn(
                  "rounded-2xl border border-border/60 bg-card px-3 py-2.5 border-l-[3px] dark:bg-slate-950 dark:border-slate-800",
                  metric.accent,
                )}
              >
                <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  {metric.label}
                </div>
                <div className="mt-1 text-sm font-semibold text-foreground">
                  {fmtMsVal(metric.value)}
                </div>
              </div>
            </TooltipTrigger>
            <TooltipContent className="text-xs">{metric.help}</TooltipContent>
          </Tooltip>
        ))}
      </div>
    </div>
  );
}

export function DebugSummaryCard({ data, docs }: DebugSummaryCardProps) {
  const metrics = useMemo(
    () => ({
      modelName: String(
        data.model_params?.model_name ?? data.model_params?.model ?? "-",
      ),
      ragTime: num(data.rag_time),
      llmTime: num(data.llm_time),
      historyMs: num(data.history_ms),
      embeddingMs: num(data.embedding_ms),
      denseMs: num(data.dense_ms),
      lexicalMs: num(data.lexical_ms),
      hydrateMs: num(data.hydrate_ms),
      rerankMs: num(data.rerank_ms),
      llmMs: num(data.llm_ms),
      firstTokenMs: num(data.first_token_ms),
      streamTotalMs: num(data.stream_total_ms),
      inTok: num(data.input_tokens),
      outTok: num(data.output_tokens),
    }),
    [data],
  );

  const {
    modelName,
    ragTime,
    llmTime,
    historyMs,
    embeddingMs,
    denseMs,
    lexicalMs,
    hydrateMs,
    rerankMs,
    llmMs,
    firstTokenMs,
    streamTotalMs,
    inTok,
    outTok,
  } = metrics;

  const totalTime = useMemo(() => {
    if (streamTotalMs !== null) return streamTotalMs / 1000;
    if (ragTime !== null && llmTime !== null) return ragTime + llmTime;
    if (ragTime !== null) return ragTime;
    if (llmTime !== null) return llmTime;
    return null;
  }, [streamTotalMs, ragTime, llmTime]);

  const stageMetrics = useMemo(
    () =>
      [
        {
          key: "history_ms",
          label: "History",
          value: historyMs,
          help: "Carga del historial en memoria/Mongo",
          accent: "border-l-violet-400",
        },
        {
          key: "embedding_ms",
          label: "Embedding",
          value: embeddingMs,
          help: "Embedding de la consulta",
          accent: "border-l-blue-400",
        },
        {
          key: "dense_ms",
          label: "Dense",
          value: denseMs,
          help: "Búsqueda vectorial en Qdrant",
          accent: "border-l-blue-500",
        },
        {
          key: "lexical_ms",
          label: "Lexical",
          value: lexicalMs,
          help: "Búsqueda léxica/híbrida",
          accent: "border-l-sky-400",
        },
        {
          key: "hydrate_ms",
          label: "Hydrate",
          value: hydrateMs,
          help: "Hidratación de parents/documentos",
          accent: "border-l-cyan-400",
        },
        {
          key: "rerank_ms",
          label: "Rerank",
          value: rerankMs,
          help: "Reranking de candidatos",
          accent: "border-l-purple-400",
        },
        {
          key: "llm_ms",
          label: "LLM",
          value: llmMs,
          help: "Inferencia del modelo de lenguaje",
          accent: "border-l-emerald-400",
        },
        {
          key: "first_token_ms",
          label: "1st Token",
          value: firstTokenMs,
          help: "Tiempo hasta el primer chunk visible",
          accent: "border-l-amber-400",
        },
      ].filter((item) => item.value !== null),
    [
      historyMs,
      embeddingMs,
      denseMs,
      lexicalMs,
      hydrateMs,
      rerankMs,
      llmMs,
      firstTokenMs,
    ],
  );

  const gatingText = data.gating_reason
    ? GATING_MAP[data.gating_reason] || data.gating_reason
    : "-";
  const cacheText = data.is_cached ? "Cache: ON" : "Cache: OFF";
  const gatingReason = String(data.gating_reason || "");
  const decisionTone = GATING_TONE_MAP[gatingReason];
  const isRagOn = docs.length > 0 || embeddingMs !== null;

  return (
    <section>
      <div className="rounded-[24px] border border-border/70 bg-card p-5 shadow-sm dark:bg-slate-900 dark:border-slate-800">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-foreground">
              Resumen del flujo
            </div>
            <div className="text-xs text-muted-foreground">
              Latencia, modelo y decisión del pipeline
            </div>
          </div>
          {typeof totalTime === "number" && (
            <Badge
              variant="secondary"
              className="rounded-full px-2.5 py-1 text-[10px] font-medium"
            >
              Total {fmtSVal(totalTime)}s
            </Badge>
          )}
        </div>
        <div className="space-y-4">
          {Boolean(data.is_cached) ? (
            <div className="rounded-lg border border-success/20 bg-success/10 px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Zap className="w-5 h-5 text-success" />
                <div className="text-sm font-medium text-success">
                  Respuesta Instantánea (Caché)
                </div>
              </div>
              <div className="text-xs text-success">{fmtSVal(totalTime)}s</div>
            </div>
          ) : (
            <DebugPipelineTimeline
              data={data}
              docs={docs}
              embeddingMs={embeddingMs}
              ragTime={ragTime}
              llmTime={llmTime}
              totalTime={totalTime}
              gatingText={gatingText}
              gatingReason={gatingReason}
            />
          )}

          <StageMetrics metrics={stageMetrics} />

          <div className="grid grid-cols-1 gap-3 rounded-[20px] border border-border/60 bg-surface/80 p-4 md:grid-cols-3 dark:bg-slate-900 dark:border-slate-800">
            <div className="flex flex-col gap-2">
              <div className="text-xs font-semibold text-foreground">Motor</div>
              <div className="flex flex-wrap items-center gap-3">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="inline-flex items-center gap-2">
                      <Info className="w-4 h-4 text-muted-foreground" />
                      <Badge
                        variant="outline"
                        className="px-2 py-[3px] text-[11px] font-mono text-foreground bg-muted/50 border-border"
                      >
                        {modelName}
                      </Badge>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent className="text-xs">
                    Modelo LLM utilizado
                  </TooltipContent>
                </Tooltip>
                {typeof data.model_params?.temperature === "number" && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="inline-flex items-center gap-1.5">
                        <Thermometer className="w-4 h-4 text-muted-foreground" />
                        <Badge
                          variant="outline"
                          className="px-2 py-[3px] text-[11px] font-mono text-foreground bg-muted/50 border-border"
                        >
                          T={data.model_params.temperature}
                        </Badge>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent className="text-xs">
                      Temperatura (0=determinista, 1=creativo)
                    </TooltipContent>
                  </Tooltip>
                )}
                {typeof data.model_params?.max_tokens === "number" && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="inline-flex items-center gap-1.5">
                        <Hash className="w-4 h-4 text-muted-foreground" />
                        <Badge
                          variant="outline"
                          className="px-2 py-[3px] text-[11px] font-mono text-foreground bg-muted/50 border-border"
                        >
                          max={data.model_params.max_tokens}
                        </Badge>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent className="text-xs">
                      Máximo de tokens en la respuesta
                    </TooltipContent>
                  </Tooltip>
                )}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="inline-flex items-center gap-2">
                      <Ticket className="w-4 h-4 text-muted-foreground" />
                      <Badge
                        className={cn(
                          "px-2 py-[3px] text-[11px]",
                          data.is_cached
                            ? "bg-success/10 text-success border border-success/20"
                            : "bg-muted text-muted-foreground border border-border",
                        )}
                      >
                        {cacheText}
                      </Badge>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent className="text-xs">
                    Indica si se respondió desde caché
                  </TooltipContent>
                </Tooltip>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <div className="text-xs font-semibold text-foreground">
                  Consumo Tokens
                </div>
                {data.tokens_estimated !== false && (
                  <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                    ~estimado
                  </span>
                )}
              </div>
              <div className="space-y-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Input</span>
                      <span className="font-mono text-slate-900">
                        {fmtTokVal(inTok)}
                      </span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent className="text-xs">
                    Cantidad de tokens procesados
                  </TooltipContent>
                </Tooltip>
                <div className="h-2 rounded-full bg-slate-100 overflow-hidden dark:bg-slate-800/70">
                  <div
                    className="h-full bg-emerald-400 transition-all"
                    style={{
                      width: `${Math.max(
                        0,
                        Math.min(
                          100,
                          ((inTok ?? 0) /
                            Math.max(1, (inTok ?? 0) + (outTok ?? 0))) *
                            100,
                        ),
                      )}%`,
                    }}
                  />
                </div>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Output</span>
                      <span className="font-mono text-slate-900">
                        {fmtTokVal(outTok)}
                      </span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent className="text-xs">
                    Cantidad de tokens procesados
                  </TooltipContent>
                </Tooltip>
                <div className="h-2 rounded-full bg-slate-100 overflow-hidden dark:bg-slate-800/70">
                  <div
                    className="h-full bg-blue-400 transition-all"
                    style={{
                      width: `${Math.max(
                        0,
                        Math.min(
                          100,
                          ((outTok ?? 0) /
                            Math.max(1, (inTok ?? 0) + (outTok ?? 0))) *
                            100,
                        ),
                      )}%`,
                    }}
                  />
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <div className="text-xs font-semibold text-foreground">
                Diagnóstico
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <span className="inline-flex items-center gap-2">
                  {isRagOn ? (
                    <Database className="w-4 h-4 text-blue-700" />
                  ) : (
                    <Ban className="w-4 h-4 text-slate-600" />
                  )}
                  <Badge
                    className={cn(
                      "px-2 py-[3px] text-[11px]",
                      isRagOn
                        ? "bg-blue-100 text-blue-700 border border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800"
                        : "bg-slate-100 text-slate-600 border border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
                    )}
                  >
                    {isRagOn ? "RAG: ON" : "RAG: OFF"}
                  </Badge>
                </span>
                <div
                  className={cn(
                    "inline-flex items-center gap-2 rounded-md px-2 py-[3px] border text-[11px]",
                    decisionTone === "green"
                      ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                      : decisionTone === "indigo"
                        ? "bg-indigo-50 border-indigo-200 text-indigo-700"
                        : decisionTone === "amber"
                          ? "bg-amber-50 border-amber-200 text-amber-700"
                          : decisionTone === "rose"
                            ? "bg-rose-50 border-rose-200 text-rose-700"
                            : "bg-slate-50 border-slate-200 text-slate-700 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300",
                  )}
                >
                  <Shield className="w-3.5 h-3.5" />
                  <span className="font-semibold">
                    {GATING_EXPLAIN[gatingReason]?.title || gatingText}
                  </span>
                </div>
                {data.context_truncated && (
                  <span className="inline-flex items-center gap-1.5 rounded-md bg-rose-50 border border-rose-200 px-2 py-[3px] text-[11px] font-semibold text-rose-700 dark:bg-rose-900/20 dark:border-rose-800 dark:text-rose-400">
                    <span>⚠</span> Contexto truncado
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
