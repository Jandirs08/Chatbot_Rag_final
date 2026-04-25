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
import { Eye } from "lucide-react";
import type { RetrievedDoc } from "./utils";

interface SourcesListProps {
  docs: RetrievedDoc[];
  onOpenPdf: (url: string, page: number | null) => void;
}

export function SourcesList({ docs, onOpenPdf }: SourcesListProps) {
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});

  return (
    <section>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-foreground mb-1">
            Fuentes
          </div>
          <div className="text-xs text-muted-foreground">
            Fragmentos recuperados y similitud
          </div>
        </div>
        <Badge
          variant="outline"
          className="rounded-full px-2.5 py-1 text-[10px] font-medium"
        >
          {docs.length} fragmentos
        </Badge>
      </div>
      <div className="rounded-[24px] border border-border/70 bg-card p-4 text-[13px] leading-relaxed shadow-sm dark:bg-slate-900 dark:border-slate-800">
        {docs.length === 0 ? (
          <div className="inline-flex items-center rounded-xl border border-border bg-muted px-3 py-2 text-sm text-muted-foreground dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700">
            Salto de Búsqueda
          </div>
        ) : (
          <div className="space-y-3">
            {docs.map((d, idx) => {
              const score = typeof d.score === "number" ? d.score : undefined;
              const pct =
                score !== undefined
                  ? Math.max(0, Math.min(1, score)) * 100
                  : undefined;
              const contentText = String(d.text ?? d.preview ?? "").trim();
              const src = d.source ?? d.file_path ?? null;
              const pageNum =
                typeof d.page_number === "number" ? d.page_number : null;
              const fileName = src ? String(src).split("/").pop() : undefined;
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
                "bg-slate-100 text-slate-700 border border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700";
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
                    "overflow-hidden rounded-[20px] border border-border bg-background shadow-sm transition ease-out duration-200 hover:border-border/90 hover:shadow-md dark:bg-slate-900 dark:border-slate-800",
                  )}
                  style={{ borderLeftColor: scoreColorHex }}
                >
                  <div className="flex items-center justify-between px-3 py-2">
                    <div className="text-sm font-medium text-foreground">
                      {fileName || `Fragmento #${idx + 1}`}
                    </div>
                    <div className="flex items-center gap-2">
                      {pageNum && pageNum > 0 && (
                        <Badge variant="outline" className="text-[10px]">
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
                            className={cn("text-[10px]", confidenceClass)}
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
                                    onOpenPdf(url, pageNum);
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
                          setExpanded((s) => ({
                            ...(s || {}),
                            [idx]: !s?.[idx],
                          }))
                        }
                      >
                        {expanded?.[idx] ? "Ver menos" : "Ver más"}
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
                      {expanded?.[idx]
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
        )}
      </div>
    </section>
  );
}
