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
  Ban,
} from "lucide-react";
import PdfViewerModal from "@/app/components/modals/PdfViewerModal";
import { ChevronRight, ChevronDown, Copy, Terminal, Braces } from "lucide-react";

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
  const [activeTab, setActiveTab] = useState<string>("veredicto");
  const [promptRawMode, setPromptRawMode] = useState(false);
  const [promptFold, setPromptFold] = useState<Record<string, boolean>>({
    context: false,
    history: false,
    instructions: true,
  });
  const [jsonCollapsed, setJsonCollapsed] = useState<Record<string, boolean>>({});
  const SEGMENTS = ["context", "history", "instructions"] as const;
  const ORDERED_SEGMENTS = ["instructions", "context", "history"] as const;
  const sysPrompt = (data?.system_prompt_used ?? data?.system_prompt ?? "") as string;

  const promptText = sysPrompt;
  const segRegex = (name: string) => new RegExp(`<${name}>[\s\S]*?<\/${name}>`);
  const extractInner = (name: string) => {
    const regex = new RegExp(`<${name}>[\\s\\S]*?<\/${name}>`, "i");
    const match = String(promptText || "").match(regex);
    if (!match) return "";
    return match[0].replace(new RegExp(`</?${name}>`, "gi"), "").trim();
  };
  const promptSegmentsCount = SEGMENTS.reduce((acc, s) => (segRegex(s).test(String(promptText)) ? acc + 1 : acc), 0);
  const promptCharCount = String(promptText || "").length;
  const formatGeneral = (s: string) => {
    let t = String(s || "");
    t = t.replace(/\s{2,}/g, " ");
    t = t.replace(/([\.;:])\s+/g, "$1\n\n");
    t = t.replace(/\n{3,}/g, "\n\n");
    t = t.replace(/(^|\n)\s+/g, "$1");
    t = t.replace(/^\s*•\s+/gm, "    - ");
    t = t.replace(/^\s*-\s+/gm, "    - ");
    t = t.replace(/^\s*(\d+)\.\s*\n\s*/gm, "$1. ");
    return t;
  };
  const splitInstructions = (s: string) => {
    const t = formatGeneral(s);
    const parts = t.split(/(?=\n?\s*\d+\.)/g).filter((x) => x.trim().length > 0);
    return parts;
  };
  const emphasize = (s: string) => {
    const re = /(PRIORIDAD MÁXIMA|MANEJO DE VACÍOS|FORMATO)/g;
    const chunks = String(s).split(re);
    return (
      <>
        {chunks.map((c, i) =>
          re.test(c) ? (
            <span key={i} className="font-semibold">
              {c}
            </span>
          ) : (
            <span key={i}>{c}</span>
          ),
        )}
      </>
    );
  };

  const jsonStats = (v: any): { keys: number; arrays: number; objects: number } => {
    if (v === null || typeof v !== "object") return { keys: 0, arrays: 0, objects: 0 };
    if (Array.isArray(v)) {
      const inner = v.map(jsonStats).reduce((a, b) => ({ keys: a.keys + b.keys, arrays: a.arrays + b.arrays, objects: a.objects + b.objects }), { keys: 0, arrays: 0, objects: 0 });
      return { keys: inner.keys, arrays: inner.arrays + 1, objects: inner.objects };
    }
    const entries = Object.entries(v);
    const inner = entries.map(([, val]) => jsonStats(val)).reduce((a, b) => ({ keys: a.keys + b.keys, arrays: a.arrays + b.arrays, objects: a.objects + b.objects }), { keys: 0, arrays: 0, objects: 0 });
    return { keys: inner.keys + entries.length, arrays: inner.arrays, objects: inner.objects + 1 };
  };
  const rootStats = jsonStats(data);
  const isCollapsed = (path: string, value: any) => {
    if (path === "root") return false;
    if (Array.isArray(value) && (path.endsWith("retrieved") || path.endsWith("retrieved_documents"))) return true;
    if (path.includes("verification")) return false;
    return Boolean(jsonCollapsed[path]);
  };
  const toggleCollapsed = (path: string) => setJsonCollapsed((s) => ({ ...(s || {}), [path]: !s?.[path] }));
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
  const cacheText = data?.is_cached ? "Cache: ON" : "Cache: OFF";
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
    <div className="h-full w-full flex flex-col overflow-visible md:overflow-hidden bg-transparent">
      <div className="flex-none border-b bg-card p-3 dark:bg-slate-900 dark:border-slate-800">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="text-sm font-semibold text-foreground">Monitor RAG</div>
            <Tooltip>
              <TooltipTrigger asChild>
                <div
                  className={cn(
                    "inline-flex items-center gap-2 rounded-full px-3 py-1 border text-xs",
                    data?.verification?.is_grounded === false
                      ? "bg-amber-50 border-amber-200 text-amber-700"
                      : data?.verification?.is_grounded === true
                      ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                      : "bg-slate-50 border-slate-200 text-slate-700 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300",
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
              className="h-8 gap-2 text-xs font-medium text-muted-foreground border-border hover:border-indigo-300 hover:text-indigo-600 hover:bg-indigo-50/50 transition-all dark:border-slate-700"
              onClick={() => setShowPrompt(true)}
            >
              <Terminal className="w-3.5 h-3.5" />
              Prompt
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-2 text-xs font-medium text-muted-foreground border-border hover:border-indigo-300 hover:text-indigo-600 hover:bg-indigo-50/50 transition-all dark:border-slate-700"
              onClick={() => setShowJson(true)}
            >
              <Braces className="w-3.5 h-3.5" />
              JSON
            </Button>
          </div>
        </div>
      </div>
      <div className="flex-1 overflow-visible md:overflow-y-auto p-3 space-y-8">
        <div className="space-y-6">
          <section>
            <div className="rounded-xl border border-border bg-card shadow-md ring-1 ring-white/5 p-6 dark:bg-slate-900 dark:border-slate-800">
              <div className="text-sm font-semibold text-foreground mb-3">Resumen del Flujo RAG</div>
              <div className="space-y-4">
                {Boolean(data?.is_cached) ? (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-100 px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Zap className="w-5 h-5 text-emerald-700" />
                      <div className="text-sm font-medium text-emerald-800">Respuesta Instantánea (Caché)</div>
                    </div>
                    <div className="text-xs text-emerald-800">{fmtSVal(totalTime)}s</div>
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
                    return (
                      <div className="relative space-y-5">
                        <div className="flex items-center justify-center gap-3">
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
                                  "h-[2px] w-12",
                                  active ? "bg-blue-400" : "bg-slate-300",
                                  "transition-all duration-500",
                                )}
                              />
                            );
                            return (
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
                            );
                          })()}
                        </div>
                        <div className="absolute top-0 right-0">
                          <span className="inline-flex items-center px-2 py-1 rounded-md bg-muted text-foreground text-xs dark:bg-slate-800 dark:text-slate-200">Total: {fmtSVal(tot)}s</span>
                        </div>
                        <div className="w-full">
                          <div className="flex mb-2 text-xs text-slate-800">
                            <div style={{ width: `${Math.max(0, Math.min(100, rPct))}%` }} className="relative">
                            <div className="flex justify-center">
                              {typeof ragTime === "number" && ragTime >= 0.01 && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="px-2 py-[2px] rounded bg-amber-200 text-slate-900">RAG {fmtSVal(ragTime)}s</span>
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
                                    <span className="px-2 py-[2px] rounded bg-blue-200 text-slate-900">LLM {fmtSVal(llmTime)}s</span>
                                  </TooltipTrigger>
                                  <TooltipContent className="text-xs">Tiempo de generación del modelo</TooltipContent>
                                </Tooltip>
                              </div>
                            </div>
                            {oPct > 0 && <div style={{ width: `${Math.max(0, Math.min(100, oPct))}%` }} />}
                          </div>
                          <div className="h-8 rounded-full bg-slate-100 overflow-hidden flex">
                            <div className="h-full bg-amber-300 transition-all" style={{ width: `${Math.max(0, Math.min(100, rPct))}%` }} />
                            <div className="h-full bg-blue-400 transition-all" style={{ width: `${Math.max(0, Math.min(100, lPct))}%` }} />
                            {oPct > 0 && (
                              <div className="h-full bg-slate-300 transition-all" style={{ width: `${Math.max(0, Math.min(100, oPct))}%` }} />
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })()
                )}
                <div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 rounded-xl border border-border bg-card shadow-md ring-1 ring-white/5 p-4 dark:bg-slate-900 dark:border-slate-800">
                      <div className="flex flex-col gap-2">
                      <div className="text-xs font-semibold text-foreground">Motor</div>
                      <div className="flex flex-wrap items-center gap-3">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="inline-flex items-center gap-2">
                              <Info className="w-4 h-4 text-muted-foreground" />
                              <Badge variant="outline" className="px-2 py-[3px] text-[11px] font-mono text-slate-800 dark:text-slate-200 dark:bg-slate-800/60 dark:border-slate-700">{modelName}</Badge>
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
                                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                  : "bg-slate-100 text-slate-700 border border-slate-200 dark:bg-slate-800/70 dark:text-slate-300 dark:border-slate-700"
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
                          <span className="font-semibold">{gatingExplain[gr]?.title || gatingText}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>
          
          <TooltipProvider delayDuration={0}>
          

          
        
          
        
          <section className="mt-6 pl-6">
            <div className="text-sm font-semibold text-foreground mb-1">
              Fuentes
            </div>
            <div className="text-xs text-muted-foreground">
              Fragmentos recuperados y similitud
            </div>
            <div className="rounded-xl border border-border p-4 bg-card shadow-md ring-1 ring-white/5 space-y-4 text-[13px] leading-relaxed mt-2 dark:bg-slate-900 dark:border-slate-800">
              {docs.length === 0 ? (
                <div className="inline-flex items-center px-3 py-2 rounded-md text-sm bg-muted text-muted-foreground border border-border dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700">
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
                      const confidenceClass = "bg-slate-100 text-slate-700 border border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700";
                      const scoreToneClass =
                        score === undefined
                          ? "bg-slate-100 text-slate-700 border border-slate-200"
                          : score > 0.7
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                            : score > 0.4
                              ? "bg-amber-50 text-amber-700 border-amber-200"
                              : "bg-rose-50 text-rose-700 border-rose-200";
                      return (
                        <div
                          key={idx}
                          className={cn(
                            "rounded-lg shadow-md ring-1 ring-white/5 border border-border border-l-4 overflow-hidden transition ease-out duration-300 hover:shadow-lg bg-card dark:bg-slate-900 dark:border-slate-800",
                          )}
                          style={{ borderLeftColor: scoreColorHex }}
                        >
                          <div className="flex items-center justify-between px-3 py-2">
                            <div className="text-sm font-medium text-foreground">
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
                                <Badge className={cn("text-[10px]", scoreToneClass)}>
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
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                  setExpandedDocs((s) => ({
                                    ...(s || {}),
                                    [idx]: !s?.[idx],
                                  }))
                                }
                              >
                                {expandedDocs?.[idx] ? "Ver menos" : "Ver más"}
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
                            <div className="bg-slate-50 text-slate-500 rounded-md px-3 py-2 text-xs font-mono leading-relaxed">
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

          
        </TooltipProvider>
        </div>
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
          <div className="absolute inset-y-0 right-0 w-[min(85vw,680px)] h-full bg-card border-l border-border shadow-xl transform transition-transform duration-300 translate-x-0 flex flex-col dark:bg-slate-900 dark:border-slate-800">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border dark:border-slate-800">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-muted border border-border dark:bg-slate-800 dark:border-slate-700">
                  <MessageSquare className="w-4 h-4 text-muted-foreground" />
                </span>
                <span className="text-sm font-semibold text-foreground">
                  Prompt del Sistema
                </span>
              </div>
              <button
                className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-border hover:bg-muted focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-700"
                onClick={() => setShowPrompt(false)}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-4 py-2 border-b border-border flex items-center justify-between text-xs text-muted-foreground dark:border-slate-800">
              <div className="flex items-center gap-3">
                <span>{promptCharCount} caracteres</span>
                <span>{promptSegmentsCount} segmentos</span>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" className="h-8" onClick={() => navigator.clipboard?.writeText(String(promptText || ""))}>
                  <Copy className="w-4 h-4 mr-2" />
                  Copiar
                </Button>
                <Button variant="outline" className="h-8" onClick={() => setPromptRawMode((v) => !v)}>
                  {promptRawMode ? "Ver highlight" : "Limpiar highlight"}
                </Button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {promptRawMode ? (
                <div className="rounded-md border bg-[#0F1115] text-slate-100 p-4 max-h-screen overflow-auto">
                  <div className="text-[13px] font-mono whitespace-pre-line break-words leading-7" style={{ overflowWrap: "anywhere" }}>
                    {String(promptText || "")}
                  </div>
                </div>
              ) : (
                <div className="rounded-md border bg-[#0F1115] text-slate-100 p-4 max-h-[calc(100vh-65px)] overflow-y-auto space-y-2">
                  {ORDERED_SEGMENTS.map((name) => {
                    const inner = extractInner(name);
                    const open = Boolean(promptFold[name]);
                    const title = name === "context" ? "CONTEXTO" : name === "history" ? "HISTORIAL" : "INSTRUCCIONES";
                    return (
                      <div key={name} className="rounded-md bg-[#0F1115] border border-white/10">
                        <button
                          className="w-full flex items-center justify-between px-4 py-3 text-sm hover:bg-slate-800/30 transition-colors font-mono text-[14px] text-slate-100"
                          onClick={() => setPromptFold((s) => ({ ...(s || {}), [name]: !s?.[name] }))}
                        >
                          <div className="flex items-center gap-2">
                            {open ? (
                              <ChevronDown className="w-4 h-4 transition-transform duration-200" />
                            ) : (
                              <ChevronRight className="w-4 h-4 transition-transform duration-200" />
                            )}
                            <span>{title}</span>
                          </div>
                          <span className="text-xs text-slate-200">{inner.length} chars</span>
                        </button>
                        <div className={cn("px-4 pb-4 transition-opacity duration-150", open ? "opacity-100" : "opacity-0 hidden") }>
                  <div className="text-slate-100 font-mono text-[14px]" style={{ overflowWrap: "anywhere" }}>
                            <div className="text-slate-300 mb-2">────────────────────────────────────────────────</div>
                            {name === "instructions" ? (
                              <div className={cn("px-4 py-3 inline-block rounded leading-7 break-words", "bg-emerald-500/15") }>
                                {splitInstructions(inner).map((item, idx) => {
                                  const m = item.match(/^\s*(\d+)\.\s*([\s\S]*)$/);
                                  const number = m ? m[1] : String(idx + 1);
                                  const rest = m ? m[2] : item;
                                  return (
                                    <div key={idx} className="mb-3 whitespace-pre-wrap break-words">
                                      <div className="mb-1"><span className="inline-block w-full break-words">[{number}] {emphasize(rest)}</span></div>
                                      </div>
                                    );
                                })}
                              </div>
                            ) : (
                              <pre className={cn("px-4 py-3 inline-block rounded leading-7 whitespace-pre-wrap break-words", name === "context" ? "bg-indigo-500/15" : "bg-violet-500/15") }>
                                {formatGeneral(inner)}
                              </pre>
                            )}
                          </div>
                        </div>
                        <div className="px-4"><div className="h-px bg-white/10" /></div>
                      </div>
                    );
                  })}
                </div>
              )}
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
          <div className="absolute inset-y-0 right-0 w-[min(85vw,560px)] bg-card border-l border-border shadow-xl transform transition-transform duration-300 translate-x-0 dark:bg-slate-900 dark:border-slate-800">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border dark:border-slate-800">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-muted border border-border dark:bg-slate-800 dark:border-slate-700">
                  <Info className="w-4 h-4 text-muted-foreground" />
                </span>
                <span className="text-sm font-semibold text-foreground">JSON Crudo</span>
              </div>
              <button
                className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-border hover:bg-muted focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-700"
                onClick={() => setShowJson(false)}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-4 py-2 border-b border-border flex items-center justify-between text-xs text-muted-foreground dark:border-slate-800">
              <div className="flex items-center gap-3">
                <span>{rootStats.keys} claves</span>
                <span>{rootStats.arrays} arrays</span>
                <span>{rootStats.objects} objetos</span>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" className="h-8" onClick={() => navigator.clipboard?.writeText(JSON.stringify(data, null, 2))}>
                  <Copy className="w-4 h-4 mr-2" />
                  Copiar
                </Button>
              </div>
            </div>
            <div className="p-4">
              <div className="rounded-md border bg-zinc-950 text-zinc-100 p-4 max-h-screen overflow-auto">
                <div className="text-[13px] font-mono leading-7" style={{ overflowWrap: "anywhere" }}>
                  {(function renderNode(value: any, path: string, depth: number): React.ReactNode {
                    if (value === null) return <span className="text-slate-400">null</span>;
                    if (typeof value === "string") return <span className="text-green-300 break-words">&quot;{value}&quot;</span>;
                    if (typeof value === "number") return <span className="text-amber-300">{String(value)}</span>;
                    if (typeof value === "boolean") return <span className="text-violet-300">{String(value)}</span>;
                    const pad = `pl-${Math.min(depth * 4, 24)}`;
                    if (Array.isArray(value)) {
                      const collapsed = isCollapsed(path, value);
                      return (
                        <div className={cn(pad)}>
                          <button className="flex items-center gap-2 cursor-pointer text-zinc-100 hover:text-white transition-colors" onClick={() => toggleCollapsed(path)}>
                            {collapsed ? (
                              <ChevronRight className="w-4 h-4 transition-transform duration-200" />
                            ) : (
                              <ChevronDown className="w-4 h-4 transition-transform duration-200" />
                            )}
                            <span className="text-slate-300">[</span>
                            <span className="text-slate-400">{value.length} items</span>
                            <span className="text-slate-300">]</span>
                          </button>
                          <div className={cn("transition-opacity duration-150", collapsed ? "opacity-0 hidden" : "opacity-100") }>
                            {value.map((v, i) => (
                              <div key={`${path}|${i}`} className="leading-7">
                                {renderNode(v, `${path}|${i}`, depth + 1)}
                                {i < value.length - 1 && <span className="text-slate-400">,</span>}
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    }
                    const entries = Object.entries(value);
                    const collapsed = isCollapsed(path, value);
                    return (
                      <div className={cn(pad)}>
                        <button className="flex items-center gap-2 cursor-pointer text-zinc-100 hover:text-white transition-colors" onClick={() => toggleCollapsed(path)}>
                          {collapsed ? (
                            <ChevronRight className="w-4 h-4 transition-transform duration-200" />
                          ) : (
                            <ChevronDown className="w-4 h-4 transition-transform duration-200" />
                          )}
                          <span className="text-slate-300">{`{`}</span>
                          <span className="text-slate-400">{entries.length} keys</span>
                          <span className="text-slate-300">{`}`}</span>
                        </button>
                        <div className={cn("transition-opacity duration-150", collapsed ? "opacity-0 hidden" : "opacity-100") }>
                          {entries.map(([k, v], i) => (
                            <div key={`${path}|${k}`} className="leading-7">
                              <span className="text-sky-300 font-semibold break-words">&quot;{k}&quot;</span>
                              <span className="text-slate-400">: </span>
                              {renderNode(v, `${path}|${k}`, depth + 1)}
                              {i < entries.length - 1 && <span className="text-slate-400">,</span>}
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })(data, "root", 0)}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
