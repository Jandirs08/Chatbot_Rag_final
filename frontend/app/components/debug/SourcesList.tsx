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
import { Eye, Minus } from "lucide-react";
import type { RetrievedDoc } from "./utils";

interface SourcesListProps {
  docs: RetrievedDoc[];
  onOpenPdf: (url: string, page: number | null) => void;
}

function getScoreTone(score: number | undefined): {
  badge: string;
  bar: string;
  label: string;
} {
  if (score === undefined)
    return {
      badge: "bg-muted text-muted-foreground border-border",
      bar: "bg-muted-foreground/40",
      label: "Sin score",
    };
  if (score > 0.7)
    return {
      badge: "bg-success/10 text-success border-success/25",
      bar: "bg-success",
      label: "High match",
    };
  if (score > 0.4)
    return {
      badge: "bg-amber/10 text-amber border-amber/25",
      bar: "bg-amber",
      label: "Medium match",
    };
  return {
    badge: "bg-error/10 text-error border-error/25",
    bar: "bg-error",
    label: "Low match",
  };
}

export function SourcesList({ docs, onOpenPdf }: SourcesListProps) {
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});

  return (
    <section>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-primary mb-1">
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
      <div className="rounded-[24px] border border-border bg-card p-4 text-[13px] leading-relaxed shadow-sm">
        {docs.length === 0 ? (
          <div className="inline-flex items-center gap-2 rounded-xl border border-warning/20 bg-warning/8 px-3 py-2 text-sm text-warning">
            <Minus className="h-4 w-4 flex-shrink-0" />
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
              const tone = getScoreTone(score);

              return (
                <div
                  key={idx}
                  className="overflow-hidden rounded-[20px] border border-border bg-background transition ease-out duration-200 hover:border-primary/30 hover:shadow-sm"
                >
                  <div className="flex items-center justify-between px-3 py-2">
                    <div className="text-sm font-medium text-foreground">
                      {fileName || `Fragmento #${idx + 1}`}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap justify-end">
                      {pageNum && pageNum > 0 && (
                        <Badge variant="outline" className="text-[10px]">
                          Pág. {pageNum}
                        </Badge>
                      )}
                      {typeof score === "number" && (
                        <Badge className={cn("text-[10px] border font-data", tone.badge)}>
                          {Math.round(score * 100) / 100}
                        </Badge>
                      )}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Badge
                            className={cn("text-[10px] border", tone.badge)}
                          >
                            {tone.label}
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
                        className="border-border text-muted-foreground hover:border-primary/30 hover:bg-primary/5 hover:text-primary transition-colors"
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
                            <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                              <div
                                className={cn("h-full transition-all duration-500", tone.bar)}
                                style={{ width: `${Math.round(pct)}%` }}
                              />
                            </div>
                            <span className="font-data text-xs text-muted-foreground">
                              {Math.round(pct)}%
                            </span>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent className="text-xs">
                          Similitud semántica del fragmento
                        </TooltipContent>
                      </Tooltip>
                    )}
                    <div className="surface-inset font-mono text-muted-foreground rounded-md px-3 py-2 text-xs leading-relaxed">
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
