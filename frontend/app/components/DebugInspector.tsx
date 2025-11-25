"use client";

import React, { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/app/components/ui/card";
import { Badge } from "@/app/components/ui/badge";
import { Separator } from "@/app/components/ui/separator";
import { ScrollArea } from "@/app/components/ui/scroll-area";
import { Progress } from "@/app/components/ui/progress";
import { Clock, Zap, MessageSquare, Eye, Info, ShieldCheck, AlertTriangle, ChevronDown } from "lucide-react";
import PdfViewerModal from "@/app/components/modals/PdfViewerModal";
// Accordion removido: usamos flexbox controlado por estado
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/app/components/ui/tooltip";
import { cn } from "@/lib/utils";
import * as Collapsible from "@radix-ui/react-collapsible";

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
};

export function DebugInspector({ data }: { data?: DebugData | null }) {
  const [pdfOpen, setPdfOpen] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfPage, setPdfPage] = useState<number | null>(null);
  const [isPromptOpen, setIsPromptOpen] = useState(false);
  const [isSourcesOpen, setIsSourcesOpen] = useState(true);
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
  const ragColor = ragTime === null ? "text-muted-foreground" : ragTime < 1 ? "text-emerald-500" : ragTime > 3 ? "text-red-500" : "text-amber-500";
  const totalTime = typeof ragTime === "number" && typeof llmTime === "number" ? ragTime + llmTime : null;
  // costo eliminado

  if (!data || (!docs || docs.length === 0) && !sysPrompt) {
    return (
      <div className="h-full w-full flex items-center justify-center text-sm text-slate-500 dark:text-slate-400">
        Escribe en el chat para ver el razonamiento de la IA
      </div>
    );
  }

  return (
    <div className="h-full w-full flex flex-col overflow-hidden bg-slate-50 dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800">
      <div className="shrink-0 p-4 border-b border-slate-200 dark:border-slate-800">
        <TooltipProvider delayDuration={0}>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-3">
            <div className="bg-card border border-border rounded-md p-3">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-slate-700" />
                <div className="text-xs text-muted-foreground">Total</div>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span>
                      <Info className="w-3.5 h-3.5 text-muted-foreground/70 ml-1.5 cursor-help" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>Tiempo total que el usuario esperó la respuesta.</TooltipContent>
                </Tooltip>
              </div>
              <div className="text-lg font-mono font-bold text-foreground">
                {fmtSVal(totalTime)}
                <span className="text-muted-foreground text-xs ml-1">s</span>
              </div>
            </div>

            <div className="bg-card border border-border rounded-md p-3">
              <div className="flex items-center gap-2">
                <Zap className={`w-4 h-4 ${ragColor}`} />
                <div className="text-xs text-muted-foreground">RAG</div>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span>
                      <Info className="w-3.5 h-3.5 text-muted-foreground/70 ml-1.5 cursor-help" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>Tiempo buscando información en tus documentos PDF.</TooltipContent>
                </Tooltip>
              </div>
              <div className={`text-lg font-mono font-bold ${ragColor}`}>
                {fmtSVal(ragTime)}
                <span className="text-muted-foreground text-xs ml-1">s</span>
              </div>
            </div>

            <div className="bg-card border border-border rounded-md p-3">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-sky-500" />
                <div className="text-xs text-muted-foreground">IA</div>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span>
                      <Info className="w-3.5 h-3.5 text-muted-foreground/70 ml-1.5 cursor-help" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>Tiempo que la Inteligencia Artificial tardó en escribir.</TooltipContent>
                </Tooltip>
              </div>
              <div className="text-lg font-mono font-bold text-foreground">
                {fmtSVal(llmTime)}
                <span className="text-muted-foreground text-xs ml-1">s</span>
              </div>
            </div>
          </div>
        </TooltipProvider>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-2">
            <div className="bg-card border border-border rounded-md p-3">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-indigo-500" />
                <div className="text-xs text-muted-foreground">Entrada</div>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span>
                      <Info className="w-3.5 h-3.5 text-muted-foreground/70 ml-1.5 cursor-help" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>Cantidad de información enviada (Tu pregunta + Contexto PDF).</TooltipContent>
                </Tooltip>
              </div>
              <div className="text-lg font-mono font-bold text-foreground">
                {fmtTokVal(inTok)}
                <span className="text-muted-foreground text-xs ml-1">tokens</span>
              </div>
            </div>

            <div className="bg-card border border-border rounded-md p-3">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-purple-500" />
                <div className="text-xs text-muted-foreground">Salida</div>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span>
                      <Info className="w-3.5 h-3.5 text-muted-foreground/70 ml-1.5 cursor-help" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>Cantidad de texto generado por el bot.</TooltipContent>
                </Tooltip>
              </div>
              <div className="text-lg font-mono font-bold text-foreground">
                {fmtTokVal(outTok)}
                <span className="text-muted-foreground text-xs ml-1">tokens</span>
              </div>
            </div>

            <div
              className={(
                data?.verification?.is_grounded === true
                  ? "rounded-md p-3 bg-green-50 border border-green-200"
                : data?.verification?.is_grounded === false
                  ? "rounded-md p-3 bg-amber-50 border border-amber-200"
                : "bg-card border border-border rounded-md p-3"
              )}
            >
              <div className="flex items-center gap-2">
                {data?.verification?.is_grounded === true ? (
                  <ShieldCheck className="w-4 h-4 text-green-600" />
                ) : data?.verification?.is_grounded === false ? (
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                ) : (
                  <Info className="w-4 h-4 text-muted-foreground" />
                )}
                <div className="text-xs text-muted-foreground">Veredicto</div>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span>
                      <Info className="w-3.5 h-3.5 text-muted-foreground/70 ml-1.5 cursor-help" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    {String(data?.verification?.reason || "")}
                  </TooltipContent>
                </Tooltip>
              </div>
              <div className={(
                data?.verification?.is_grounded === true
                  ? "text-lg font-mono font-bold text-green-700"
                : data?.verification?.is_grounded === false
                  ? "text-lg font-mono font-bold text-amber-700"
                  : "text-lg font-mono font-bold text-foreground"
              )}>
                {data?.verification?.is_grounded === true
                  ? "Verificado"
                  : data?.verification?.is_grounded === false
                  ? "No sustentado"
                  : "---"}
              </div>
            </div>
          </div>
          

          
        

        <div className="flex flex-wrap gap-2 mb-4">
          <div className="bg-secondary/50 text-secondary-foreground hover:bg-secondary/70 border border-border/50 rounded-full px-2.5 py-0.5 text-[10px] font-mono font-medium">
            Modelo: {modelName}
          </div>
          {typeof temperature === "number" && (
            <div className="bg-secondary/50 text-secondary-foreground hover:bg-secondary/70 border border-border/50 rounded-full px-2.5 py-0.5 text-[10px] font-mono font-medium">
              Temp: {temperature}
            </div>
          )}
          {typeof modelParams.max_tokens === "number" && (
            <div className="bg-secondary/50 text-secondary-foreground hover:bg-secondary/70 border border-border/50 rounded-full px-2.5 py-0.5 text-[10px] font-mono font-medium">
              MaxTokens: {modelParams.max_tokens}
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        <Collapsible.Root open={isPromptOpen} onOpenChange={setIsPromptOpen} className="flex-none border-b bg-card">
          <Collapsible.Trigger asChild>
            <div className="flex items-center justify-between w-full p-4 cursor-pointer hover:bg-muted/50 transition-colors border-b">
              <h3 className="text-sm font-semibold">Prompt del Sistema</h3>
              <ChevronDown className={`h-4 w-4 transition-transform ${isPromptOpen ? "" : "-rotate-90"}`} />
            </div>
          </Collapsible.Trigger>
          <Collapsible.Content>
            <div className="max-h-[30vh] overflow-y-auto border-t bg-muted/30 p-3 font-mono text-xs text-muted-foreground/90 leading-relaxed">
              <p className="whitespace-pre-wrap">{sysPrompt}</p>
            </div>
          </Collapsible.Content>
        </Collapsible.Root>

        <Collapsible.Root
          open={isSourcesOpen}
          onOpenChange={setIsSourcesOpen}
          className={cn("flex flex-col overflow-hidden transition-all bg-card", isSourcesOpen ? "flex-1 min-h-0" : "flex-none")}
        >
          <Collapsible.Trigger asChild>
            <div className="flex items-center justify-between w-full p-4 cursor-pointer hover:bg-muted/50 transition-colors border-b">
              <span className="text-sm font-semibold">Fuentes Utilizadas ({docs.length})</span>
              <ChevronDown className={`h-4 w-4 transition-transform ${isSourcesOpen ? "" : "-rotate-90"}`} />
            </div>
          </Collapsible.Trigger>
          <Collapsible.Content className="flex-1 min-h-0 overflow-hidden flex flex-col">
            <ScrollArea className="flex-1 overflow-y-auto">
              <div className="p-4 space-y-3">
                {docs.map((d, idx) => {
              const score = typeof d.score === "number" ? d.score : undefined;
              const pct = score !== undefined ? Math.max(0, Math.min(1, score)) * 100 : undefined;
              const barClass = score !== undefined
                ? score >= 0.8
                  ? "[&>div]:bg-emerald-500"
                  : score < 0.7
                  ? "[&>div]:bg-amber-500"
                  : "[&>div]:bg-orange-500"
                : "";
              const contentText = String(d.text ?? d.preview ?? "").trim();
              const src = d.source ?? d.file_path ?? null;
              const pageNum = typeof d.page_number === "number" ? d.page_number : null;
              return (
                <Card key={idx} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                  <CardHeader className="py-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm">Fragmento #{idx + 1}</CardTitle>
                      <div className="flex items-center gap-2">
                        {src && (
                          <Badge variant="outline" className="font-mono text-[10px] max-w-[50%] truncate">{src}</Badge>
                        )}
                        {pageNum && pageNum > 0 && (
                          <span className="ml-2 inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium">Pág. {pageNum}</span>
                        )}
                        {d.source && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  className="inline-flex items-center rounded-md border border-transparent px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
                                  onClick={async () => {
                                    try {
                                      const url = await (await import("@/app/lib/services/pdfService")).PDFService.getPDFBlobUrl(d.source as string, "view");
                                      setPdfUrl(url);
                                      setPdfPage(pageNum);
                                      setPdfOpen(true);
                                    } catch (_) {}
                                  }}
                                  title="Ver documento original"
                                >
                                  <Eye className="w-4 h-4 mr-1" /> Ver PDF
                                </button>
                              </TooltipTrigger>
                              <TooltipContent>Ver documento original</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div>
                      {pct !== undefined && (
                        <div className="flex items-center gap-2">
                          <Progress value={pct} className={"w-48 " + barClass} />
                          <span className="text-xs text-slate-600 dark:text-slate-300">{Math.round(pct)}% Similitud</span>
                        </div>
                      )}
                    </div>
                    <div className="p-3 rounded-r-md border-l-4 border-amber-400 bg-amber-50 dark:bg-amber-950/20 font-mono text-xs text-muted-foreground/90 overflow-x-auto">
                      <pre className="whitespace-pre-wrap leading-relaxed">
{contentText}
                      </pre>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
              </div>
            </ScrollArea>
          </Collapsible.Content>
        </Collapsible.Root>
      </div>
      <PdfViewerModal isOpen={pdfOpen} onClose={setPdfOpen} pdfUrl={pdfUrl} initialPage={pdfPage ?? null} />
    </div>
  );
}

