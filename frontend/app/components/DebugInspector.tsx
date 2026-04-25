"use client";

import React, { useCallback, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/app/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  Clock,
  Zap,
  MessageSquare,
  Info,
  Shield,
  ShieldCheck,
  AlertTriangle,
  Ticket,
  Gauge,
  BrainCircuit,
  Database,
  Ban,
  Terminal,
  Braces,
} from "lucide-react";
import { SourcesList } from "@/app/components/debug/SourcesList";

const PdfViewerModal = dynamic(
  () => import("@/app/components/modals/PdfViewerModal"),
  { ssr: false },
);

const PromptDrawer = dynamic(
  () =>
    import("@/app/components/debug/PromptDrawer").then((mod) => ({
      default: mod.PromptDrawer,
    })),
  { ssr: false },
);

const JsonDrawer = dynamic(
  () =>
    import("@/app/components/debug/JsonDrawer").then((mod) => ({
      default: mod.JsonDrawer,
    })),
  { ssr: false },
);
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

export type { DebugData, RetrievedDoc };

export function DebugInspector({ data }: { data?: DebugData | null }) {
  const [pdfOpen, setPdfOpen] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfPage, setPdfPage] = useState<number | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [showJson, setShowJson] = useState(false);

  // Cleanup Object URL when PDF modal closes to prevent memory leaks
  React.useEffect(() => {
    if (!pdfOpen && pdfUrl) {
      URL.revokeObjectURL(pdfUrl);
      setPdfUrl(null);
    }
  }, [pdfOpen, pdfUrl]);

  React.useEffect(() => {
    return () => {
      if (pdfUrl) {
        URL.revokeObjectURL(pdfUrl);
      }
    };
  }, [pdfUrl]);

  const promptText = (data?.prompt_used ?? "") as string;

  const docs = useMemo<RetrievedDoc[]>(() => {
    if (Array.isArray(data?.retrieved_documents)) {
      return data!.retrieved_documents as RetrievedDoc[];
    }
    if (Array.isArray(data?.retrieved)) {
      return data!.retrieved as RetrievedDoc[];
    }
    return [];
  }, [data]);

  const metrics = useMemo(() => {
    const num = (v: unknown): number | null =>
      typeof v === "number" ? v : null;
    return {
      modelName: String(
        data?.model_params?.model_name ?? data?.model_params?.model ?? "-",
      ),
      ragTime: num(data?.rag_time),
      llmTime: num(data?.llm_time),
      historyMs: num(data?.history_ms),
      embeddingMs: num(data?.embedding_ms),
      denseMs: num(data?.dense_ms),
      lexicalMs: num(data?.lexical_ms),
      hydrateMs: num(data?.hydrate_ms),
      rerankMs: num(data?.rerank_ms),
      firstTokenMs: num(data?.first_token_ms),
      streamTotalMs: num(data?.stream_total_ms),
      inTok: num(data?.input_tokens),
      outTok: num(data?.output_tokens),
    };
  }, [data]);

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
        { key: "history_ms", label: "History", value: historyMs, help: "Carga del historial en memoria/Mongo" },
        { key: "embedding_ms", label: "Embedding", value: embeddingMs, help: "Embedding de la consulta" },
        { key: "dense_ms", label: "Dense", value: denseMs, help: "Busqueda vectorial en Qdrant" },
        { key: "lexical_ms", label: "Lexical", value: lexicalMs, help: "Busqueda lexical/hibrida" },
        { key: "hydrate_ms", label: "Hydrate", value: hydrateMs, help: "Hidratacion de parents/documentos" },
        { key: "rerank_ms", label: "Rerank", value: rerankMs, help: "Reranking de candidatos" },
        { key: "first_token_ms", label: "First Token", value: firstTokenMs, help: "Tiempo hasta el primer chunk visible" },
        { key: "stream_total_ms", label: "Stream Total", value: streamTotalMs, help: "Tiempo total del stream" },
      ].filter((item) => item.value !== null),
    [
      historyMs,
      embeddingMs,
      denseMs,
      lexicalMs,
      hydrateMs,
      rerankMs,
      firstTokenMs,
      streamTotalMs,
    ],
  );

  const gatingText = data?.gating_reason
    ? GATING_MAP[data.gating_reason] || data.gating_reason
    : "-";
  const cacheText = data?.is_cached ? "Cache: ON" : "Cache: OFF";
  const gr = String(data?.gating_reason || "");
  const decisionTone = GATING_TONE_MAP[gr];

  const handleOpenPdf = useCallback((url: string, page: number | null) => {
    setPdfUrl(url);
    setPdfPage(page);
    setPdfOpen(true);
  }, []);

  if (!data) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-gradient-to-b from-background via-background to-surface/70 p-6">
        <div className="w-full max-w-sm rounded-[24px] border border-border/60 bg-card px-6 py-8 text-center shadow-sm">
          <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-border/60 bg-surface shadow-sm">
            <Gauge className="w-5 h-5 text-slate-500" />
          </div>
          <div className="text-sm font-semibold text-foreground">Esperando datos</div>
          <div className="mt-1 text-xs text-muted-foreground">
            Envía un mensaje para inspeccionar el flujo RAG
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-gradient-to-b from-background via-background to-surface/60">
      <div className="flex-none border-b border-border/60 bg-background/95 px-4 py-3 supports-[backdrop-filter]:bg-background/90 dark:bg-slate-900 dark:border-slate-800">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="text-sm font-semibold text-foreground">Monitor RAG</div>
            <Tooltip>
              <TooltipTrigger asChild>
                <div
                  className={cn(
                    "inline-flex items-center gap-2 rounded-full px-3 py-1 border text-xs",
                    data?.verification?.is_grounded === false
                      ? "bg-warning/10 border-warning/20 text-warning"
                      : data?.verification?.is_grounded === true
                        ? "bg-success/10 border-success/20 text-success"
                        : "bg-muted border-border text-muted-foreground",
                  )}
                >
                  {data?.verification?.is_grounded === false ? (
                    <AlertTriangle className="w-3.5 h-3.5" />
                  ) : data?.verification?.is_grounded === true ? (
                    <ShieldCheck className="w-3.5 h-3.5" />
                  ) : (
                    <Shield className="w-3.5 h-3.5" />
                  )}
                  <span className="font-semibold">
                    {data?.verification?.is_grounded === false
                      ? "Posible Alucinación"
                      : data?.verification?.is_grounded === true
                        ? "Verificado"
                        : "Sin verificación"}
                  </span>
                </div>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs text-xs">
                {data?.verification?.reason || "Veredicto del pipeline"}
              </TooltipContent>
            </Tooltip>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8 rounded-full gap-2 border-border bg-card px-3 text-xs font-medium text-muted-foreground transition-all hover:border-primary/30 hover:bg-primary/5 hover:text-primary dark:border-slate-700"
              onClick={() => setShowPrompt(true)}
            >
              <Terminal className="w-3.5 h-3.5" />
              Prompt
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 rounded-full gap-2 border-border bg-card px-3 text-xs font-medium text-muted-foreground transition-all hover:border-primary/30 hover:bg-primary/5 hover:text-primary dark:border-slate-700"
              onClick={() => setShowJson(true)}
            >
              <Braces className="w-3.5 h-3.5" />
              JSON
            </Button>
          </div>
        </div>
      </div>
      <div className="flex-1 overflow-visible px-4 py-4 md:overflow-y-auto">
        <div className="space-y-5">
          <section>
            <div className="rounded-[24px] border border-border/70 bg-card p-5 shadow-sm dark:bg-slate-900 dark:border-slate-800">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-foreground">Resumen del flujo</div>
                  <div className="text-xs text-muted-foreground">Latencia, modelo y decisión del pipeline</div>
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
                {Boolean(data?.is_cached) ? (
                  <div className="rounded-lg border border-success/20 bg-success/10 px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Zap className="w-5 h-5 text-success" />
                      <div className="text-sm font-medium text-success">Respuesta Instantánea (Caché)</div>
                    </div>
                    <div className="text-xs text-success">{fmtSVal(totalTime)}s</div>
                  </div>
                ) : (
                  (() => {
                    const tot = (totalTime ?? 0) > 0 ? totalTime! : (ragTime ?? 0) + (llmTime ?? 0) || 0;
                    const r = ragTime ?? 0;
                    const l = llmTime ?? 0;
                    const overhead = Math.max(0, tot - (r + l));
                    const minSeg = 15;
                    let rPct = tot > 0 ? (r / tot) * 100 : 0;
                    let lPct = tot > 0 ? (l / tot) * 100 : 0;
                    let oPct = tot > 0 ? (overhead / tot) * 100 : 0;
                    if (tot > 0) {
                      if (r > 0) rPct = Math.max(minSeg, rPct);
                      if (l > 0) lPct = Math.max(minSeg, lPct);
                      const extra = rPct + lPct + oPct - 100;
                      if (extra > 0) {
                        oPct = Math.max(0, oPct - extra);
                      } else if (extra < 0) {
                        oPct = oPct + Math.abs(extra);
                      }
                    }
                    const intentCompleted = Boolean(gr || gatingText);
                    const searchCompleted = ragTime !== null;
                    const retrievalCompleted = docs.length > 0;
                    const responseCompleted = llmTime !== null;
                    const verdictCompleted = Boolean(data?.verification);
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
                    const node = (
                      completed: boolean,
                      active: boolean,
                      icon: React.ReactNode,
                      label: string,
                    ) => (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div
                            className={cn(
                              "relative flex items-center justify-center w-5 h-5 rounded-full",
                              completed
                                ? "bg-success"
                                : active
                                  ? "bg-primary"
                                  : "bg-muted",
                              active && "ring-2 ring-primary/50 animate-pulse",
                            )}
                          >
                            <div className="text-primary-foreground">{icon}</div>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent className="text-xs">{label}</TooltipContent>
                      </Tooltip>
                    );
                    const line = (active: boolean) => (
                      <div
                        className={cn(
                          "h-[2px] w-12",
                          active ? "bg-primary" : "bg-muted",
                          "transition-all duration-500",
                        )}
                      />
                    );
                    return (
                      <div className="relative space-y-5">
                        <div className="flex items-center justify-center gap-3">
                          <div className="flex flex-wrap md:flex-nowrap items-center justify-center gap-2 overflow-x-auto md:overflow-visible">
                            {node(
                              intentCompleted,
                              activeStage === "intencion",
                              <BrainCircuit className="w-3 h-3" />,
                              "Intención",
                            )}
                            {line(activeStage === "busqueda")}
                            {node(
                              searchCompleted,
                              activeStage === "busqueda",
                              <Database className="w-3 h-3" />,
                              "Búsqueda RAG",
                            )}
                            {line(activeStage === "recuperacion")}
                            {node(
                              retrievalCompleted,
                              activeStage === "recuperacion",
                              <Database className="w-3 h-3" />,
                              "Recuperación",
                            )}
                            {line(activeStage === "razonamiento")}
                            {node(
                              responseCompleted,
                              activeStage === "razonamiento",
                              <Zap className="w-3 h-3" />,
                              "Razonamiento",
                            )}
                            {line(activeStage === "respuesta")}
                            {node(
                              responseCompleted,
                              activeStage === "respuesta",
                              <MessageSquare className="w-3 h-3" />,
                              "Respuesta",
                            )}
                            {line(activeStage === "veredicto")}
                            {node(
                              verdictCompleted,
                              activeStage === "veredicto",
                              data?.verification?.is_grounded ? (
                                <ShieldCheck className="w-3 h-3" />
                              ) : (
                                <Shield className="w-3 h-3" />
                              ),
                              "Veredicto",
                            )}
                          </div>
                        </div>
                        <div className="w-full">
                          <div className="flex mb-2 text-xs text-slate-800">
                            <div style={{ width: `${Math.max(0, Math.min(100, rPct))}%` }} className="relative">
                              <div className="flex justify-center">
                                {typeof ragTime === "number" && ragTime >= 0.01 && (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <span className="px-2 py-[2px] rounded bg-warning text-warning-foreground">RAG {fmtSVal(ragTime)}s</span>
                                    </TooltipTrigger>
                                    <TooltipContent className="text-xs">Tiempo de búsqueda en el corpus</TooltipContent>
                                  </Tooltip>
                                )}
                              </div>
                            </div>
                            <div style={{ width: `${Math.max(0, Math.min(100, lPct))}%` }} className="relative">
                              <div className="flex justify-center">
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="px-2 py-[2px] rounded bg-info text-info-foreground">LLM {fmtSVal(llmTime)}s</span>
                                  </TooltipTrigger>
                                  <TooltipContent className="text-xs">Tiempo de generación del modelo</TooltipContent>
                                </Tooltip>
                              </div>
                            </div>
                            {oPct > 0 && <div style={{ width: `${Math.max(0, Math.min(100, oPct))}%` }} />}
                          </div>
                          <div className="h-8 rounded-full bg-muted overflow-hidden flex">
                            <div className="h-full bg-warning transition-all" style={{ width: `${Math.max(0, Math.min(100, rPct))}%` }} />
                            <div className="h-full bg-info transition-all" style={{ width: `${Math.max(0, Math.min(100, lPct))}%` }} />
                            {oPct > 0 && (
                              <div className="h-full bg-muted-foreground/30 transition-all" style={{ width: `${Math.max(0, Math.min(100, oPct))}%` }} />
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })()
                )}
                {stageMetrics.length > 0 && (
                  <div className="rounded-[20px] border border-border/60 bg-surface/80 p-4 dark:bg-slate-900 dark:border-slate-800">
                    <div className="mb-3 flex items-center gap-2">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <div className="text-xs font-semibold text-foreground">Tiempos por etapa</div>
                        <div className="text-[11px] text-muted-foreground">Metricas internas del pipeline</div>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-4">
                      {stageMetrics.map((metric) => (
                        <Tooltip key={metric.key}>
                          <TooltipTrigger asChild>
                            <div className="rounded-2xl border border-border/60 bg-card px-3 py-2.5 dark:bg-slate-950 dark:border-slate-800">
                              <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                                {metric.label}
                              </div>
                              <div className="mt-1 text-sm font-semibold text-foreground">
                                {fmtMsVal(metric.value)}
                              </div>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent className="text-xs">
                            {metric.help}
                          </TooltipContent>
                        </Tooltip>
                      ))}
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-1 gap-3 rounded-[20px] border border-border/60 bg-surface/80 p-4 md:grid-cols-3 dark:bg-slate-900 dark:border-slate-800">
                  <div className="flex flex-col gap-2">
                    <div className="text-xs font-semibold text-foreground">Motor</div>
                    <div className="flex flex-wrap items-center gap-3">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="inline-flex items-center gap-2">
                            <Info className="w-4 h-4 text-muted-foreground" />
                            <Badge variant="outline" className="px-2 py-[3px] text-[11px] font-mono text-foreground bg-muted/50 border-border">{modelName}</Badge>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent className="text-xs">Modelo LLM utilizado</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="inline-flex items-center gap-2">
                            <Ticket className="w-4 h-4 text-muted-foreground" />
                            <Badge className={cn(
                              "px-2 py-[3px] text-[11px]",
                              data?.is_cached
                                ? "bg-success/10 text-success border border-success/20"
                                : "bg-muted text-muted-foreground border border-border"
                            )}>{cacheText}</Badge>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent className="text-xs">Indica si se respondió desde caché</TooltipContent>
                      </Tooltip>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <div className="text-xs font-semibold text-foreground">Consumo Tokens</div>
                    <div className="space-y-2">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-muted-foreground">Input</span>
                            <span className="font-mono text-slate-900">{fmtTokVal(inTok)}</span>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent className="text-xs">Cantidad de tokens procesados</TooltipContent>
                      </Tooltip>
                      <div className="h-2 rounded-full bg-slate-100 overflow-hidden dark:bg-slate-800/70">
                        <div
                          className="h-full bg-emerald-400 transition-all"
                          style={{ width: `${Math.max(0, Math.min(100, ((inTok ?? 0) / Math.max(1, ((inTok ?? 0) + (outTok ?? 0)))) * 100))}%` }}
                        />
                      </div>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-muted-foreground">Output</span>
                            <span className="font-mono text-slate-900">{fmtTokVal(outTok)}</span>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent className="text-xs">Cantidad de tokens procesados</TooltipContent>
                      </Tooltip>
                      <div className="h-2 rounded-full bg-slate-100 overflow-hidden dark:bg-slate-800/70">
                        <div
                          className="h-full bg-blue-400 transition-all"
                          style={{ width: `${Math.max(0, Math.min(100, ((outTok ?? 0) / Math.max(1, ((inTok ?? 0) + (outTok ?? 0)))) * 100))}%` }}
                        />
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <div className="text-xs font-semibold text-foreground">Diagnóstico</div>
                    <div className="flex flex-wrap items-center gap-3">
                      {(() => {
                        const isRagOn = docs.length > 0 || (ragTime ?? 0) > 0;
                        const label = isRagOn ? "RAG: ON" : "RAG: OFF";
                        const cls = isRagOn
                          ? "bg-blue-100 text-blue-700 border border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800"
                          : "bg-slate-100 text-slate-600 border border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700";
                        return (
                          <span className="inline-flex items-center gap-2">
                            {isRagOn ? (
                              <Database className="w-4 h-4 text-blue-700" />
                            ) : (
                              <Ban className="w-4 h-4 text-slate-600" />
                            )}
                            <Badge className={cn("px-2 py-[3px] text-[11px]", cls)}>{label}</Badge>
                          </span>
                        );
                      })()}
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
                                  : "bg-slate-50 border-slate-200 text-slate-700 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300"
                        )}
                      >
                        <Shield className="w-3.5 h-3.5" />
                        <span className="font-semibold">{GATING_EXPLAIN[gr]?.title || gatingText}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <TooltipProvider delayDuration={0}>
            <SourcesList docs={docs} onOpenPdf={handleOpenPdf} />
          </TooltipProvider>
        </div>
      </div>

      {pdfOpen && (
        <PdfViewerModal
          isOpen={pdfOpen}
          onClose={setPdfOpen}
          pdfUrl={pdfUrl}
          initialPage={pdfPage ?? null}
        />
      )}

      {showPrompt && (
        <PromptDrawer
          open={showPrompt}
          onClose={() => setShowPrompt(false)}
          promptText={promptText}
        />
      )}

      {showJson && (
        <JsonDrawer
          open={showJson}
          onClose={() => setShowJson(false)}
          data={data}
        />
      )}
    </div>
  );
}
