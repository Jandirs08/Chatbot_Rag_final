"use client";

import React from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/app/components/ui/card";
import { Badge } from "@/app/components/ui/badge";
import { Separator } from "@/app/components/ui/separator";
import { ScrollArea } from "@/app/components/ui/scroll-area";
import { Progress } from "@/app/components/ui/progress";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/app/components/ui/accordion";

type RetrievedDoc = {
  text?: string;
  preview?: string;
  source?: string | null;
  file_path?: string | null;
  score?: number | null;
};

type DebugData = {
  retrieved_documents?: RetrievedDoc[];
  retrieved?: RetrievedDoc[];
  system_prompt_used?: string;
  system_prompt?: string;
  model_params?: Record<string, any>;
};

export function DebugInspector({ data }: { data?: DebugData | null }) {
  const docs: RetrievedDoc[] = Array.isArray(data?.retrieved_documents)
    ? (data?.retrieved_documents as RetrievedDoc[])
    : Array.isArray(data?.retrieved)
    ? (data?.retrieved as RetrievedDoc[])
    : [];

  const modelParams = data?.model_params || {};
  const modelName = String(modelParams.model_name ?? modelParams.model ?? "-");
  const temperature = typeof modelParams.temperature === "number" ? modelParams.temperature : undefined;
  const sysPrompt = (data?.system_prompt_used ?? data?.system_prompt ?? "") as string;

  if (!data || (!docs || docs.length === 0) && !sysPrompt) {
    return (
      <div className="h-full w-full flex items-center justify-center text-sm text-slate-500 dark:text-slate-400">
        Escribe en el chat para ver el razonamiento de la IA
      </div>
    );
  }

  return (
    <div className="h-full w-full p-4 bg-slate-50 dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800">
      <div className="flex items-center gap-2 mb-3">
        <Badge variant="outline" className="font-mono text-xs">Modelo: {modelName}</Badge>
        {typeof temperature === "number" && (
          <Badge variant="outline" className="font-mono text-xs">Temp: {temperature}</Badge>
        )}
        {typeof modelParams.max_tokens === "number" && (
          <Badge variant="outline" className="font-mono text-xs">MaxTokens: {modelParams.max_tokens}</Badge>
        )}
      </div>

      <Accordion type="single" collapsible className="mb-4">
        <AccordionItem value="system-prompt">
          <AccordionTrigger>Prompt del Sistema</AccordionTrigger>
          <AccordionContent>
            <Card className="bg-white dark:bg-slate-800">
              <CardContent>
                <pre className="font-mono text-xs whitespace-pre-wrap leading-relaxed p-2">
{sysPrompt}
                </pre>
              </CardContent>
            </Card>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      <div className="mb-2">
        <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">
          Fuentes Utilizadas ({docs.length})
        </div>
        <Separator className="my-2" />
      </div>

      <ScrollArea className="h-[calc(100%-160px)] pr-2">
        <div className="grid grid-cols-1 gap-3">
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
            return (
              <Card key={idx} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                <CardHeader className="py-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm">Fragmento #{idx + 1}</CardTitle>
                    {src && (
                      <Badge variant="outline" className="font-mono text-[10px] max-w-[50%] truncate">{src}</Badge>
                    )}
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
                  <div className="border rounded-md p-2 bg-slate-50 dark:bg-slate-900/50 max-h-48 overflow-y-auto">
                    <pre className="font-mono text-xs whitespace-pre-wrap leading-relaxed">
{contentText}
                    </pre>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}

