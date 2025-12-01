"use client";

import React, { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/app/components/ui/card";
import { Badge } from "@/app/components/ui/badge";
import { ScrollArea } from "@/app/components/ui/scroll-area";
import { Progress } from "@/app/components/ui/progress";
import { Button } from "@/app/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/app/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { Clock, Zap, MessageSquare, Eye, Info, Shield, ShieldCheck, AlertTriangle, Ticket, Gauge, X, BrainCircuit, Database } from "lucide-react";
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
  const temperature = typeof modelParams.temperature === "number" ? modelParams.temperature : undefined;
  const sysPrompt = (data?.system_prompt_used ?? data?.system_prompt ?? "") as string;
  const ragTime = typeof data?.rag_time === "number" ? data!.rag_time! : null;
  const llmTime = typeof data?.llm_time === "number" ? data!.llm_time! : null;
  const inTok = typeof data?.input_tokens === "number" ? data!.input_tokens! : null;
  const outTok = typeof data?.output_tokens === "number" ? data!.output_tokens! : null;
  const fmtSVal = (v: number | null) => (v === null ? "-" : v.toFixed(2));
  const fmtTokVal = (v: number | null) => (v === null ? "-" : v.toLocaleString());
  const ragColor = ragTime === null ? "text-muted-foreground" : ragTime < 1 ? "text-emerald-500" : ragTime > 3 ? "text-rose-500" : "text-amber-500";
  const totalTime = typeof ragTime === "number" && typeof llmTime === "number" ? ragTime + llmTime : typeof ragTime === "number" ? ragTime : typeof llmTime === "number" ? llmTime : null;
  const totalTokens = typeof inTok === "number" && typeof outTok === "number" ? inTok + outTok : typeof inTok === "number" ? inTok : typeof outTok === "number" ? outTok : null;
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
  const gatingText = data?.gating_reason ? (gatingMap[data.gating_reason] || data.gating_reason) : "-";
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
    semantic_match: { title: "Búsqueda Semántica", subtitle: "Intención informativa detectada" },
    keyword_match: { title: "Búsqueda Directa", subtitle: "Coincidencias por palabras clave" },
    qa: { title: "Pregunta y Respuesta", subtitle: "Consulta compatible con corpus" },
    small_talk: { title: "Charla Casual", subtitle: "Intención social ligera" },
    chatty: { title: "Charla Casual", subtitle: "Intención social ligera" },
    low_intent: { title: "Charla Casual", subtitle: "Baja intención informativa" },
    no_corpus: { title: "Sin Corpus", subtitle: "No hay base documental" },
    too_short: { title: "Consulta Muy Corta", subtitle: "Amplía la pregunta" },
    error: { title: "Error", subtitle: "Gating con fallo" },
    small_corpus: { title: "Búsqueda Directa", subtitle: "Corpus pequeño detectado" },
  };

  const renderPromptWithHighlights = (text: string) => {
    const colors: Record<string, string> = { context: "text-indigo-400", history: "text-violet-400", instructions: "text-emerald-400" };
    const bgColors: Record<string, string> = { context: "bg-indigo-900/20", history: "bg-violet-900/20", instructions: "bg-emerald-900/20" };
    let i = 0;
    const out: React.ReactNode[] = [];
    const src = String(text || "");
    while (i < src.length) {
      const openMatch = src.slice(i).match(/<(context|history|instructions)>/);
      if (!openMatch) {
        const rest = src.slice(i);
        if (rest) out.push(<span key={i} className="text-slate-300 leading-7 break-words">{rest}</span>);
        break;
      }
      const openIdx = i + (openMatch.index || 0);
      const tagName = openMatch[1] as keyof typeof colors;
      const before = src.slice(i, openIdx);
      if (before) out.push(<span key={i} className="text-slate-300 leading-7 break-words">{before}</span>);
      const openTagLen = (`<${tagName}>`).length;
      const afterOpen = openIdx + openTagLen;
      const closeRe = new RegExp(`</${tagName}>`);
      const closeMatch = src.slice(afterOpen).match(closeRe);
      if (!closeMatch) {
        out.push(
          <span key={`open-${openIdx}`} className={cn("px-1 font-semibold", colors[tagName])}>{`<${tagName}>`}</span>
        );
        i = afterOpen;
        continue;
      }
      const closeIdx = afterOpen + (closeMatch.index || 0);
      out.push(
        <span key={`open-${openIdx}`} className={cn("px-1 font-semibold", colors[tagName])}>{`<${tagName}>`}</span>
      );
      const inner = src.slice(afterOpen, closeIdx);
      out.push(
        <span key={`inner-${openIdx}`} className={cn("px-2 py-1 inline-block rounded", bgColors[tagName], "text-slate-300 leading-7 break-words")}>{inner}</span>
      );
      const closeTagLen = (`</${tagName}>`).length;
      out.push(
        <span key={`close-${closeIdx}`} className="px-1 font-semibold text-slate-400">{`</${tagName}>`}</span>
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
      return <span className="text-green-300 break-words">"{value}"</span>;
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
                {i < value.length - 1 && <span className="text-slate-400">,</span>}
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
                <span className="text-sky-300 font-semibold break-words">"{k}"</span>
                <span className="text-slate-400">: </span>
                {renderJsonWithHighlights(v, depth + 1)}
                {i < entries.length - 1 && <span className="text-slate-400">,</span>}
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
          <div className="text-sm text-slate-600">Esperando respuesta...</div>
          <div className="text-xs text-muted-foreground mt-1">Envía un mensaje para inspeccionar el flujo RAG</div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full flex flex-col overflow-hidden bg-transparent">
      <div className="p-4 space-y-4">
        <TooltipProvider delayDuration={0}>
          <Card className="shadow-sm">
            <CardHeader className="pb-0">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold">Performance Monitor</div>
                <Badge variant="outline" className="font-mono text-[10px]">{modelName}</Badge>
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              <div className="grid grid-cols-1 md:grid-cols-3">
                <div className="pr-4 md:border-r">
                  <div className="flex items-center gap-2">
                    <Clock className="w-5 h-5 text-slate-700" />
                    <div className="text-xl font-mono font-bold">{fmtSVal(totalTime)}<span className="text-muted-foreground text-xs ml-1">s</span></div>
                  </div>
                  {typeof ragTime === "number" && typeof llmTime === "number" && (
                    <div className="mt-3">
                      <div className="h-3 w-full rounded bg-slate-100 overflow-hidden flex">
                        <div className="h-full bg-amber-400" style={{ width: `${Math.max(0, Math.min(100, (totalTime ? (ragTime / totalTime) * 100 : 0)))}%` }} />
                        <div className="h-full bg-blue-500" style={{ width: `${Math.max(0, Math.min(100, (totalTime ? (llmTime / totalTime) * 100 : 0)))}%` }} />
                      </div>
                      <div className="mt-1 text-[11px] text-muted-foreground">🔍 RAG: {fmtSVal(ragTime)}s | 🤖 LLM: {fmtSVal(llmTime)}s</div>
                    </div>
                  )}
                </div>
                <div className="px-4 md:border-r">
                  <div className="flex gap-6 md:gap-8">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">📥</span>
                      <div className="text-sm font-semibold text-slate-700">Input: {fmtTokVal(inTok)}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-lg">📤</span>
                      <div className="text-sm font-semibold text-indigo-700">Output: {fmtTokVal(outTok)}</div>
                    </div>
                  </div>
                </div>
                <div className="pl-4">
                  <div className="flex items-center gap-2">
                    <Badge className={cn("text-xs px-3 py-1", data?.is_cached ? "bg-emerald-600 text-white" : "bg-slate-300 text-slate-800")}>{data?.is_cached ? "HIT" : "MISS"}</Badge>
                    <span className="text-[11px] text-muted-foreground">Cache {cacheText}</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="relative mt-6">
            <div className="absolute left-4 top-0 bottom-0 border-l-2 border-slate-200" />

            <div className="relative pl-12">
              <div className="absolute left-0 top-1 w-8 h-8 rounded-full bg-white border flex items-center justify-center">
                <BrainCircuit className={cn(
                  decisionTone === "green" && "w-4 h-4 text-emerald-600",
                  decisionTone === "indigo" && "w-4 h-4 text-indigo-600",
                  decisionTone === "amber" && "w-4 h-4 text-amber-600",
                  decisionTone === "rose" && "w-4 h-4 text-rose-600",
                  !decisionTone && "w-4 h-4 text-slate-500"
                )} />
              </div>
              <div className="mb-6">
                <div className="text-sm font-semibold">Análisis de Intención</div>
                <div className="mt-1 text-[11px] text-muted-foreground">{(gatingExplain[gr]?.title || gatingText || "Desconocido")}</div>
                <div className={cn(
                  "inline-flex items-center px-3 py-2 rounded-md text-sm font-mono mt-2",
                  decisionTone === "green" && "bg-emerald-50 text-emerald-700 border border-emerald-200",
                  decisionTone === "indigo" && "bg-indigo-50 text-indigo-700 border border-indigo-200",
                  decisionTone === "amber" && "bg-amber-50 text-amber-700 border border-amber-200",
                  decisionTone === "rose" && "bg-rose-50 text-rose-700 border border-rose-200",
                  !decisionTone && "bg-slate-100 text-slate-700 border border-slate-200"
                )}>{gatingExplain[gr]?.subtitle || gatingText || "Desconocido"}</div>
              </div>
            </div>

            <div className="relative pl-12">
              <div className="absolute left-0 top-1 w-8 h-8 rounded-full bg-white border flex items-center justify-center">
                <Database className={cn(
                  docs.length > 0 ? "w-4 h-4 text-slate-700" : "w-4 h-4 text-slate-400"
                )} />
              </div>
              <div className="mb-6">
                {docs.length === 0 ? (
                  <div className="inline-flex items-center px-3 py-2 rounded-md text-sm bg-slate-100 text-slate-700 border border-slate-200">Salto de Búsqueda</div>
                ) : (
                  <div>
                    <div className="text-sm font-semibold">Fuentes Recuperadas</div>
                    <div className="mt-3 space-y-3">
                      {docs.map((d, idx) => {
                        const score = typeof d.score === "number" ? d.score : undefined;
                        const pct = score !== undefined ? Math.max(0, Math.min(1, score)) * 100 : undefined;
                        const barClass = score !== undefined
                          ? score > 0.7
                            ? "[&>div]:bg-emerald-500"
                            : score > 0.4
                            ? "[&>div]:bg-amber-500"
                            : "[&>div]:bg-rose-500"
                          : "";
                        const contentText = String(d.text ?? d.preview ?? "").trim();
                        const src = d.source ?? d.file_path ?? null;
                        const pageNum = typeof d.page_number === "number" ? d.page_number : null;
                        const fileName = src ? String(src).split("/").pop() : undefined;
                        const scoreColor = score !== undefined ? (score > 0.7 ? "border-emerald-500" : score > 0.4 ? "border-amber-500" : "border-rose-500") : "border-slate-300";
                        return (
                          <Card key={idx} className="shadow-sm">
                            <CardHeader className="py-3">
                              <div className="flex items-center justify-between">
                                <CardTitle className="text-sm font-medium">{fileName || `Fragmento #${idx + 1}`}</CardTitle>
                                <div className="flex items-center gap-2">
                                  {pageNum && pageNum > 0 && (
                                    <Badge variant="outline" className="text-[10px]">Pág. {pageNum}</Badge>
                                  )}
                                  {d.source && (
                                    <TooltipProvider>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <Button variant="outline" size="sm" onClick={async () => {
                                            try {
                                              const url = await (await import("@/app/lib/services/pdfService")).PDFService.getPDFBlobUrl(d.source as string, "view");
                                              setPdfUrl(url);
                                              setPdfPage(pageNum);
                                              setPdfOpen(true);
                                            } catch (_) {}
                                          }}>
                                            <Eye className="w-4 h-4 mr-1" /> Ver PDF
                                          </Button>
                                        </TooltipTrigger>
                                        <TooltipContent>Ver documento original</TooltipContent>
                                      </Tooltip>
                                    </TooltipProvider>
                                  )}
                                  <Button variant="outline" size="sm" onClick={() => setExpandedDocs((s) => ({ ...(s || {}), [idx]: !s?.[idx] }))}>Preview</Button>
                                </div>
                              </div>
                            </CardHeader>
                            <CardContent className={cn("space-y-2 border-l-[6px]", scoreColor)}>
                              {pct !== undefined && (
                                <div className="flex items-center gap-2">
                                  <Progress value={pct} className={cn("h-2 w-48", barClass)} />
                                  <span className="text-xs text-muted-foreground">Similitud: {Math.round(pct)}%</span>
                                </div>
                              )}
                              {(expandedDocs?.[idx] ?? false) && (
                                <div className="rounded-md border bg-muted/50 p-3 font-mono text-xs text-muted-foreground/90">
                                  <pre className="whitespace-pre-wrap leading-relaxed">{contentText}</pre>
                                </div>
                              )}
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="relative pl-12">
              <div className="absolute left-0 top-1 w-8 h-8 rounded-full bg-white border flex items-center justify-center">
                {data?.verification?.is_grounded === true ? (
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                ) : data?.verification?.is_grounded === false ? (
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                ) : (
                  <Shield className="w-4 h-4 text-slate-500" />
                )}
              </div>
              <div className="mb-6">
                <div className="text-sm font-semibold">Veredicto</div>
                <Card className={cn(data?.verification?.is_grounded === true ? "bg-emerald-50 border-emerald-200" : data?.verification?.is_grounded === false ? "bg-amber-50 border-amber-200" : "bg-slate-50 border-slate-200", "shadow-md mt-2")}> 
                  <CardContent className="pt-4">
                    <div className={cn(
                      "text-sm font-mono font-bold",
                      data?.verification?.is_grounded === true ? "text-emerald-700" : data?.verification?.is_grounded === false ? "text-amber-700" : "text-slate-700"
                    )}>{data?.verification?.is_grounded === true ? "Respuesta Verificada" : data?.verification?.is_grounded === false ? "Posible Alucinación" : "Sin verificación"}</div>
                    {data?.verification?.reason && (
                      <div className="mt-1 text-[11px] text-muted-foreground">{data.verification.reason}</div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>

          <div className="mt-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Button className="w-full h-11" variant="outline" onClick={() => setShowPrompt(true)}>🩻 Prompt X-Ray</Button>
              <Button className="w-full h-11" variant="outline" onClick={() => setShowJson(true)}>💾 JSON Data</Button>
            </div>
          </div>

        </TooltipProvider>
      </div>

      <PdfViewerModal isOpen={pdfOpen} onClose={setPdfOpen} pdfUrl={pdfUrl} initialPage={pdfPage ?? null} />

      {showPrompt && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/20" onClick={() => setShowPrompt(false)} />
          <div className="absolute inset-y-0 right-0 w-[min(85vw,560px)] bg-white border-l shadow-xl transform transition-transform duration-300 translate-x-0">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-slate-100 border">
                  <MessageSquare className="w-4 h-4 text-slate-600" />
                </span>
                <span className="text-sm font-semibold">Prompt del Sistema</span>
              </div>
              <button className="inline-flex h-10 w-10 items-center justify-center rounded-md border hover:bg-muted focus:outline-none focus:ring-2 focus:ring-indigo-500" onClick={() => setShowPrompt(false)}>
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4">
              <div className="rounded-md border bg-slate-950 text-slate-100 p-4 max-h-screen overflow-auto">
                <div className="text-[13px] font-mono whitespace-pre-wrap break-words leading-7">{renderPromptWithHighlights(sysPrompt)}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {showJson && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/20" onClick={() => setShowJson(false)} />
          <div className="absolute inset-y-0 right-0 w-[min(85vw,560px)] bg-white border-l shadow-xl transform transition-transform duration-300 translate-x-0">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-slate-100 border">
                  <Info className="w-4 h-4 text-slate-600" />
                </span>
                <span className="text-sm font-semibold">JSON Crudo</span>
              </div>
              <button className="inline-flex h-10 w-10 items-center justify-center rounded-md border hover:bg-muted focus:outline-none focus:ring-2 focus:ring-indigo-500" onClick={() => setShowJson(false)}>
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
