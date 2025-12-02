"use client";

import React, { useState } from "react";
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
  Eye,
  Info,
  Shield,
  ShieldCheck,
  AlertTriangle,
  Ticket,
  Gauge,
  X,
  BrainCircuit,
  Database,
} from "lucide-react";
import PdfViewerModal from "@/app/components/modals/PdfViewerModal";

type RetrievedDoc = {
  text?: string;
  preview?: string;
  source?: string | null;
  file_path?: string | null;
  score?: number | null;
  page_number?: number | null;
};

type DebugData = {
  retrieved_documents?: RetrievedDoc[];
  retrieved?: RetrievedDoc[];
  system_prompt_used?: string;
  system_prompt?: string;
  model_params?: Record<string, any>;
  rag_time?: number | null;
  llm_time?: number | null;
  input_tokens?: number | null;
  output_tokens?: number | null;
  verification?: { is_grounded: boolean; reason?: string } | null;
  gating_reason?: string | null;
  is_cached?: boolean;
};

export function DebugInspector({ data }: { data?: DebugData | null }) {
  const [pdfOpen, setPdfOpen] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfPage, setPdfPage] = useState<number | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [showJson, setShowJson] = useState(false);
  const [expandedDocs, setExpandedDocs] = useState<Record<number, boolean>>({});
  const docs: RetrievedDoc[] = Array.isArray(data?.retrieved_documents)
    ? (data?.retrieved_documents as RetrievedDoc[])
    : Array.isArray(data?.retrieved)
      ? (data?.retrieved as RetrievedDoc[])
      : [];

  const modelParams = data?.model_params || {};
  const modelName = String(modelParams.model_name ?? modelParams.model ?? "-");
  const temperature =
    typeof modelParams.temperature === "number"
      ? modelParams.temperature
      : undefined;
  const sysPrompt = (data?.system_prompt_used ??
    data?.system_prompt ??
    "") as string;
  const ragTime = typeof data?.rag_time === "number" ? data!.rag_time! : null;
  const llmTime = typeof data?.llm_time === "number" ? data!.llm_time! : null;
  const inTok =
    typeof data?.input_tokens === "number" ? data!.input_tokens! : null;
  const outTok =
    typeof data?.output_tokens === "number" ? data!.output_tokens! : null;
  const fmtSVal = (v: number | null) => (v === null ? "-" : v.toFixed(2));
  const fmtTokVal = (v: number | null) =>
    v === null ? "-" : v.toLocaleString();
  const ragColor =
    ragTime === null
      ? "text-muted-foreground"
      : ragTime < 1
        ? "text-emerald-500"
        : ragTime > 3
          ? "text-rose-500"
          : "text-amber-500";
  const totalTime =
    typeof ragTime === "number" && typeof llmTime === "number"
      ? ragTime + llmTime
      : typeof ragTime === "number"
        ? ragTime
        : typeof llmTime === "number"
          ? llmTime
          : null;
  const totalTokens =
    typeof inTok === "number" && typeof outTok === "number"
      ? inTok + outTok
      : typeof inTok === "number"
        ? inTok
        : typeof outTok === "number"
          ? outTok
          : null;
  // costo eliminado
  const gatingMap: Record<string, string> = {
    semantic_match: "Búsqueda Semántica",
    keyword_match: "Búsqueda por Palabras Clave",
    qa: "Pregunta y Respuesta",
    small_talk: "Charla",
    chatty: "Charla",
    low_intent: "Charla",
    no_corpus: "Sin Corpus",
    too_short: "Consulta Muy Corta",
    error: "Error",
  };
  const gatingText = data?.gating_reason
    ? gatingMap[data.gating_reason] || data.gating_reason
    : "-";
  const cacheText = data?.is_cached ? "⚡ HIT" : "🐢 MISS";
  const gatingToneMap: Record<string, "green" | "indigo" | "amber" | "rose"> = {
    semantic_match: "green",
    keyword_match: "green",
    qa: "green",
    small_talk: "indigo",
    chatty: "indigo",
    low_intent: "indigo",
    no_corpus: "amber",
    too_short: "amber",
    error: "rose",
  };
  const gr = String(data?.gating_reason || "");
  const decisionTone = gatingToneMap[gr];
  const gatingExplain: Record<string, { title: string; subtitle: string }> = {
    semantic_match: {
      title: "Búsqueda Semántica",
      subtitle: "Intención informativa detectada",
    },
    keyword_match: {
      title: "Búsqueda Directa",
      subtitle: "Coincidencias por palabras clave",
    },
    qa: {
      title: "Pregunta y Respuesta",
      subtitle: "Consulta compatible con corpus",
    },
    small_talk: { title: "Charla Casual", subtitle: "Intención social ligera" },
    chatty: { title: "Charla Casual", subtitle: "Intención social ligera" },
    low_intent: {
      title: "Charla Casual",
      subtitle: "Baja intención informativa",
    },
    no_corpus: { title: "Sin Corpus", subtitle: "No hay base documental" },
    too_short: { title: "Consulta Muy Corta", subtitle: "Amplía la pregunta" },
    error: { title: "Error", subtitle: "Gating con fallo" },
    small_corpus: {
      title: "Búsqueda Directa",
      subtitle: "Corpus pequeño detectado",
    },
  };

  const renderPromptWithHighlights = (text: string) => {
    const colors: Record<string, string> = {
      context: "text-indigo-400",
      history: "text-violet-400",
      instructions: "text-emerald-400",
    };
    const bgColors: Record<string, string> = {
      context: "bg-indigo-900/20",
      history: "bg-violet-900/20",
      instructions: "bg-emerald-900/20",
    };
    let i = 0;
    const out: React.ReactNode[] = [];
    const src = String(text || "");
    while (i < src.length) {
      const openMatch = src.slice(i).match(/<(context|history|instructions)>/);
      if (!openMatch) {
        const rest = src.slice(i);
        if (rest)
          out.push(
            <span key={i} className="text-slate-300 leading-7 break-words">
              {rest}
            </span>,
          );
        break;
      }
      const openIdx = i + (openMatch.index || 0);
      const tagName = openMatch[1] as keyof typeof colors;
      const before = src.slice(i, openIdx);
      if (before)
        out.push(
          <span key={i} className="text-slate-300 leading-7 break-words">
            {before}
          </span>,
        );
      const openTagLen = `<${tagName}>`.length;
      const afterOpen = openIdx + openTagLen;
      const closeRe = new RegExp(`</${tagName}>`);
      const closeMatch = src.slice(afterOpen).match(closeRe);
      if (!closeMatch) {
        out.push(
          <span
            key={`open-${openIdx}`}
            className={cn("px-1 font-semibold", colors[tagName])}
          >{`<${tagName}>`}</span>,
        );
        i = afterOpen;
        continue;
      }
      const closeIdx = afterOpen + (closeMatch.index || 0);
      out.push(
        <span
          key={`open-${openIdx}`}
          className={cn("px-1 font-semibold", colors[tagName])}
        >{`<${tagName}>`}</span>,
      );
      const inner = src.slice(afterOpen, closeIdx);
      out.push(
        <span
          key={`inner-${openIdx}`}
          className={cn(
            "px-2 py-1 inline-block rounded",
            bgColors[tagName],
            "text-slate-300 leading-7 break-words",
          )}
        >
          {inner}
        </span>,
      );
      const closeTagLen = `</${tagName}>`.length;
      out.push(
        <span
          key={`close-${closeIdx}`}
          className="px-1 font-semibold text-slate-400"
        >{`</${tagName}>`}</span>,
      );
      i = closeIdx + closeTagLen;
    }
    return <>{out}</>;
  };

  const renderJsonWithHighlights = (value: any, depth = 0): React.ReactNode => {
    const pad = depth > 0 ? `pl-${Math.min(depth * 4, 24)}` : "";
    if (value === null) {
      return <span className="text-slate-400">null</span>;
    }
    if (typeof value === "string") {
      return (
        <span className="text-green-300 break-words">&quot;{value}&quot;</span>
      );
    }
    if (typeof value === "number") {
      return <span className="text-amber-300">{String(value)}</span>;
    }
    if (typeof value === "boolean") {
      return <span className="text-violet-300">{String(value)}</span>;
    }
    if (Array.isArray(value)) {
      return (
        <span className="text-zinc-100">
          <span className="text-slate-400">[</span>
          <div className={cn("", pad)}>
            {value.map((v, i) => (
              <div key={i} className="leading-7">
                {renderJsonWithHighlights(v, depth + 1)}
                {i < value.length - 1 && (
                  <span className="text-slate-400">,</span>
                )}
              </div>
            ))}
          </div>
          <span className="text-slate-400">]</span>
        </span>
      );
    }
    if (typeof value === "object") {
      const entries = Object.entries(value);
      return (
        <span className="text-zinc-100">
          <span className="text-slate-400">{`{`}</span>
          <div className={cn("", pad)}>
            {entries.map(([k, v], i) => (
              <div key={k} className="leading-7">
                <span className="text-sky-300 font-semibold break-words">
                  &quot;{k}&quot;
                </span>
                <span className="text-slate-400">: </span>
                {renderJsonWithHighlights(v, depth + 1)}
                {i < entries.length - 1 && (
                  <span className="text-slate-400">,</span>
                )}
              </div>
            ))}
          </div>
          <span className="text-slate-400">{`}`}</span>
        </span>
      );
    }
    return <span className="text-zinc-100">{String(value)}</span>;
  };

  if (!data) {
    return (
      <div className="h-full w-full flex items-center justify-center">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-white shadow-sm border mb-3">
            <Gauge className="w-5 h-5 text-slate-500" />
          </div>
          <div className="text-sm text-slate-600">Esperando datos...</div>
          <div className="text-xs text-muted-foreground mt-1">
            Envía un mensaje para inspeccionar el flujo RAG
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full flex flex-col overflow-hidden bg-transparent">
      <div className="flex-none border-b bg-white p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="text-sm font-semibold text-slate-800">
              Monitor RAG
            </div>
            <Badge variant="outline" className="font-mono text-[10px]">
              {modelName}
            </Badge>
          </div>
          <div className="flex gap-2">
            <Button
              className="h-9"
              variant="outline"
              onClick={() => setShowPrompt(true)}
            >
              Prompt
            </Button>
            <Button
              className="h-9"
              variant="outline"
              onClick={() => setShowJson(true)}
            >
              JSON
            </Button>
          </div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-8">
        <TooltipProvider delayDuration={0}>
          <section>
            <div className="flex items-center gap-3">
              {(() => {
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
                            ? "bg-emerald-500"
                            : active
                              ? "bg-blue-500"
                              : "bg-slate-300",
                          active && "ring-2 ring-blue-300 animate-pulse",
                        )}
                      >
                        <div className="text-white">{icon}</div>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent className="text-xs">{label}</TooltipContent>
                  </Tooltip>
                );
                const line = (active: boolean) => (
                  <div
                    className={cn(
                      "h-[2px] w-10",
                      active ? "bg-blue-400" : "bg-slate-300",
                      "transition-all duration-500",
                    )}
                  />
                );
                return (
                  <div className="flex items-center">
                    {node(
                      intentCompleted,
                      activeStage === "intencion",
                      <BrainCircuit className="w-3 h-3" />,
                      "Intención: clasificación y análisis del input",
                    )}
                    {line(activeStage === "busqueda")}
                    {node(
                      searchCompleted,
                      activeStage === "busqueda",
                      <Database className="w-3 h-3" />,
                      "Búsqueda: tiempo en el corpus (RAG)",
                    )}
                    {line(activeStage === "recuperacion")}
                    {node(
                      retrievalCompleted,
                      activeStage === "recuperacion",
                      <Database className="w-3 h-3" />,
                      "Recuperación: selección de fragmentos relevantes",
                    )}
                    {line(activeStage === "razonamiento")}
                    {node(
                      responseCompleted,
                      activeStage === "razonamiento",
                      <Zap className="w-3 h-3" />,
                      "Razonamiento: construcción de respuesta con contexto",
                    )}
                    {line(activeStage === "respuesta")}
                    {node(
                      responseCompleted,
                      activeStage === "respuesta",
                      <MessageSquare className="w-3 h-3" />,
                      "Respuesta: generación de tokens por el modelo",
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
                      "Veredicto: verificación de grounding",
                    )}
                  </div>
                );
              })()}
            </div>
            {(() => {
              const tot =
                (totalTime ?? 0) > 0
                  ? totalTime!
                  : (ragTime ?? 0) + (llmTime ?? 0) || 0;
              const r = ragTime ?? 0;
              const l = llmTime ?? 0;
              const overhead = Math.max(0, tot - (r + l));
              const rPct = tot > 0 ? (r / tot) * 100 : 0;
              const lPct = tot > 0 ? (l / tot) * 100 : 0;
              const oPct = tot > 0 ? (overhead / tot) * 100 : 0;
              return (
                <div className="mt-2 space-y-1">
                  <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden flex">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div
                          className="h-full bg-amber-300 transition-all"
                          style={{
                            width: `${Math.max(0, Math.min(100, rPct))}%`,
                          }}
                        />
                      </TooltipTrigger>
                      <TooltipContent className="text-xs">
                        Búsqueda: tiempo de RAG
                      </TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div
                          className="h-full bg-blue-400 transition-all"
                          style={{
                            width: `${Math.max(0, Math.min(100, lPct))}%`,
                          }}
                        />
                      </TooltipTrigger>
                      <TooltipContent className="text-xs">
                        Generación: tiempo del modelo
                      </TooltipContent>
                    </Tooltip>
                    {oPct > 0 && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div
                            className="h-full bg-slate-300 transition-all"
                            style={{
                              width: `${Math.max(0, Math.min(100, oPct))}%`,
                            }}
                          />
                        </TooltipTrigger>
                        <TooltipContent className="text-xs">
                          Overhead: latencia del sistema
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                  <div className="text-xs text-slate-500">
                    Búsqueda: {fmtSVal(ragTime)}s · Generación:{" "}
                    {fmtSVal(llmTime)}s
                  </div>
                </div>
              );
            })()}
          </section>

          <section className="mt-6">
            <div className="text-sm font-semibold text-slate-900 mb-1">
              Análisis
            </div>
            <div className="text-xs text-slate-500">
              Pipeline de intención y contexto
            </div>
            <div className="rounded-xl border border-slate-200 p-4 bg-white shadow-sm space-y-4 text-[13px] leading-relaxed mt-2">
              <div className="rounded-lg border bg-slate-50 p-4 space-y-1">
                <div className="text-sm font-semibold text-slate-900">
                  {gatingExplain[gr]?.title || gatingText || "Desconocido"}
                </div>
                <div className="text-xs text-slate-500">
                  {gatingExplain[gr]?.subtitle || gatingText || "Desconocido"}
                </div>
                <Badge className="mt-1 text-xs">Estado</Badge>
              </div>
            </div>
          </section>

          <section className="mt-6">
            <div className="text-sm font-semibold text-slate-900 mb-1">
              Fuentes
            </div>
            <div className="text-xs text-slate-500">
              Fragmentos recuperados y similitud
            </div>
            <div className="rounded-xl border border-slate-200 p-4 bg-white shadow-sm space-y-4 text-[13px] leading-relaxed mt-2">
              {docs.length === 0 ? (
                <div className="inline-flex items-center px-3 py-2 rounded-md text-sm bg-slate-100 text-slate-700 border border-slate-200">
                  Salto de Búsqueda
                </div>
              ) : (
                <div>
                  <div className="mt-3 space-y-4">
                    {docs.map((d, idx) => {
                      const score =
                        typeof d.score === "number" ? d.score : undefined;
                      const pct =
                        score !== undefined
                          ? Math.max(0, Math.min(1, score)) * 100
                          : undefined;
                      const contentText = String(
                        d.text ?? d.preview ?? "",
                      ).trim();
                      const src = d.source ?? d.file_path ?? null;
                      const pageNum =
                        typeof d.page_number === "number"
                          ? d.page_number
                          : null;
                      const fileName = src
                        ? String(src).split("/").pop()
                        : undefined;
                      const scoreColorHex =
                        score !== undefined
                          ? score > 0.7
                            ? "#10b981"
                            : score > 0.4
                              ? "#f59e0b"
                              : "#f43f5e"
                          : "#94a3b8";
                      const confidenceLabel =
                        score === undefined
                          ? "Sin score"
                          : score > 0.7
                            ? "High semantic match"
                            : score > 0.4
                              ? "Medium semantic match"
                              : "Low semantic match";
                      const confidenceClass =
                        score === undefined
                          ? "bg-slate-100 text-slate-700 border border-slate-200"
                          : score > 0.7
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            : score > 0.4
                              ? "bg-amber-50 text-amber-700 border border-amber-200"
                              : "bg-rose-50 text-rose-700 border border-rose-200";
                      return (
                        <div
                          key={idx}
                          className="border rounded-lg bg-white shadow-sm overflow-hidden transition ease-out duration-300 hover:shadow-md hover:-translate-y-[1px]"
                        >
                          <div
                            className="h-1 w-full"
                            style={{ backgroundColor: scoreColorHex }}
                          />
                          <div className="flex items-center justify-between px-3 py-2">
                            <div className="text-sm font-medium text-slate-900">
                              {fileName || `Fragmento #${idx + 1}`}
                            </div>
                            <div className="flex items-center gap-2">
                              {pageNum && pageNum > 0 && (
                                <Badge
                                  variant="outline"
                                  className="text-[10px]"
                                >
                                  Pág. {pageNum}
                                </Badge>
                              )}
                              {typeof score === "number" && (
                                <Badge className="text-[10px] bg-slate-100 text-slate-700">
                                  Score {Math.round(score * 100) / 100}
                                </Badge>
                              )}
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Badge
                                    className={cn(
                                      "text-[10px]",
                                      confidenceClass,
                                    )}
                                  >
                                    {confidenceLabel}
                                  </Badge>
                                </TooltipTrigger>
                                <TooltipContent className="text-xs">
                                  Confianza basada en similitud semántica
                                </TooltipContent>
                              </Tooltip>
                              {d.source && (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7"
                                        onClick={async () => {
                                          try {
                                            const url = await (
                                              await import(
                                                "@/app/lib/services/pdfService"
                                              )
                                            ).PDFService.getPDFBlobUrl(
                                              d.source as string,
                                              "view",
                                            );
                                            setPdfUrl(url);
                                            setPdfPage(pageNum);
                                            setPdfOpen(true);
                                          } catch (_) {}
                                        }}
                                      >
                                        <Eye className="w-4 h-4" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      Ver documento original
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              )}
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() =>
                                  setExpandedDocs((s) => ({
                                    ...(s || {}),
                                    [idx]: !s?.[idx],
                                  }))
                                }
                              >
                                <Eye className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                          <div className="px-3 pb-3">
                            {pct !== undefined && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <div className="flex items-center gap-2 mb-2">
                                    <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                                      <div
                                        className="h-full"
                                        style={{
                                          width: `${Math.round(pct)}%`,
                                          backgroundColor: scoreColorHex,
                                        }}
                                      />
                                    </div>
                                    <span className="text-xs text-slate-500">
                                      {Math.round(pct)}%
                                    </span>
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent className="text-xs">
                                  Similitud semántica del fragmento
                                </TooltipContent>
                              </Tooltip>
                            )}
                            <div className="bg-slate-50 text-slate-700 rounded-md px-3 py-2 text-xs font-mono leading-relaxed">
                              {expandedDocs?.[idx]
                                ? contentText
                                : contentText.length > 220
                                  ? contentText.slice(0, 220) + "…"
                                  : contentText}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </section>

          <section className="mt-6">
            <div className="text-sm font-semibold text-slate-900 mb-1 flex items-center gap-2">
              {data?.verification?.is_grounded === true ? (
                <ShieldCheck className="w-5 h-5 text-emerald-600" />
              ) : data?.verification?.is_grounded === false ? (
                <AlertTriangle className="w-5 h-5 text-amber-600" />
              ) : (
                <Shield className="w-5 h-5 text-slate-600" />
              )}
              Veredicto
            </div>
            <div className="w-12 h-[2px] bg-slate-200 mb-2" />
            <div
              className={cn(
                "rounded-xl p-4 shadow-sm border",
                data?.verification?.is_grounded === true &&
                  "bg-emerald-50 border-emerald-200",
                data?.verification?.is_grounded === false &&
                  "bg-amber-50 border-amber-200",
                data?.verification?.is_grounded !== true &&
                  data?.verification?.is_grounded !== false &&
                  "bg-slate-50 border-slate-200",
              )}
            >
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className={cn("flex items-center gap-2")}>
                    {data?.verification?.is_grounded === true ? (
                      <ShieldCheck className="w-6 h-6 text-emerald-600" />
                    ) : data?.verification?.is_grounded === false ? (
                      <AlertTriangle className="w-6 h-6 text-amber-600" />
                    ) : (
                      <Shield className="w-6 h-6 text-slate-600" />
                    )}
                    <div
                      className={cn(
                        "text-base font-semibold",
                        data?.verification?.is_grounded === true
                          ? "text-emerald-700"
                          : data?.verification?.is_grounded === false
                            ? "text-amber-700"
                            : "text-slate-700",
                      )}
                    >
                      {data?.verification?.is_grounded === true
                        ? "Respuesta Verificada"
                        : data?.verification?.is_grounded === false
                          ? "Posible Alucinación"
                          : "Sin verificación"}
                    </div>
                  </div>
                </TooltipTrigger>
                <TooltipContent className="text-xs">
                  Veredicto del pipeline: validación del grounding
                </TooltipContent>
              </Tooltip>
              {data?.verification?.reason && (
                <div className="text-xs text-slate-600 mt-1">
                  {data.verification.reason}
                </div>
              )}
            </div>
          </section>
        </TooltipProvider>
      </div>

      <PdfViewerModal
        isOpen={pdfOpen}
        onClose={setPdfOpen}
        pdfUrl={pdfUrl}
        initialPage={pdfPage ?? null}
      />

      {showPrompt && (
        <div className="fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/20"
            onClick={() => setShowPrompt(false)}
          />
          <div className="absolute inset-y-0 right-0 w-[min(85vw,560px)] bg-white border-l shadow-xl transform transition-transform duration-300 translate-x-0">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-slate-100 border">
                  <MessageSquare className="w-4 h-4 text-slate-600" />
                </span>
                <span className="text-sm font-semibold">
                  Prompt del Sistema
                </span>
              </div>
              <button
                className="inline-flex h-10 w-10 items-center justify-center rounded-md border hover:bg-muted focus:outline-none focus:ring-2 focus:ring-indigo-500"
                onClick={() => setShowPrompt(false)}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4">
              <div className="rounded-md border bg-slate-950 text-slate-100 p-4 max-h-screen overflow-auto">
                <div className="text-[13px] font-mono whitespace-pre-wrap break-words leading-7">
                  {renderPromptWithHighlights(sysPrompt)}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {showJson && (
        <div className="fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/20"
            onClick={() => setShowJson(false)}
          />
          <div className="absolute inset-y-0 right-0 w-[min(85vw,560px)] bg-white border-l shadow-xl transform transition-transform duration-300 translate-x-0">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-slate-100 border">
                  <Info className="w-4 h-4 text-slate-600" />
                </span>
                <span className="text-sm font-semibold">JSON Crudo</span>
              </div>
              <button
                className="inline-flex h-10 w-10 items-center justify-center rounded-md border hover:bg-muted focus:outline-none focus:ring-2 focus:ring-indigo-500"
                onClick={() => setShowJson(false)}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4">
              <div className="rounded-md border bg-zinc-950 text-zinc-100 p-4 max-h-screen overflow-auto">
                <div className="text-[13px] font-mono whitespace-pre-wrap break-words leading-7">
                  {renderJsonWithHighlights(data)}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
