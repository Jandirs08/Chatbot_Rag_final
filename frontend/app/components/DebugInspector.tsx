"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { TooltipProvider } from "@/app/components/ui/tooltip";
import { Activity, Gauge } from "lucide-react";
import { DebugInspectorHeader } from "@/app/components/debug/DebugInspectorHeader";
import { DebugSummaryCard } from "@/app/components/debug/DebugSummaryCard";
import { SourcesList } from "@/app/components/debug/SourcesList";
import type {
  DebugData,
  RetrievedDoc,
} from "@/app/components/debug/utils";

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

export type { DebugData, RetrievedDoc };

interface DebugInspectorProps {
  data?: DebugData | null;
  isLoading?: boolean;
}

export function DebugInspector({ data, isLoading = false }: DebugInspectorProps) {
  const [pdfOpen, setPdfOpen] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfPage, setPdfPage] = useState<number | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [showJson, setShowJson] = useState(false);
  const [animKey, setAnimKey] = useState(0);

  useEffect(() => {
    if (data) setAnimKey((k) => k + 1);
  }, [data]);

  React.useEffect(() => {
    if (!pdfOpen && pdfUrl) {
      URL.revokeObjectURL(pdfUrl);
      setPdfUrl(null);
    }
  }, [pdfOpen, pdfUrl]);

  React.useEffect(() => {
    return () => {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    };
  }, [pdfUrl]);

  const promptText = (data?.prompt_used ?? "") as string;

  const docs = useMemo<RetrievedDoc[]>(
    () =>
      Array.isArray(data?.retrieved_documents)
        ? (data.retrieved_documents as RetrievedDoc[])
        : [],
    [data],
  );

  const handleOpenPdf = useCallback((url: string, page: number | null) => {
    setPdfUrl(url);
    setPdfPage(page);
    setPdfOpen(true);
  }, []);

  if (!data && isLoading) {
    return (
      <div className="flex h-full w-full items-center justify-center p-8">
        <div className="relative w-full max-w-[260px] overflow-hidden rounded-2xl border border-primary/20 bg-card px-6 py-8 text-center">
          <div className="animate-scan-sweep pointer-events-none absolute inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-primary/60 to-transparent" />
          <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <Activity className="h-5 w-5 text-primary motion-safe:animate-status-pulse" />
          </div>
          <div className="font-heading text-sm font-semibold text-foreground">Procesando señal</div>
          <div className="mt-1.5 text-xs text-muted-foreground leading-relaxed">
            Pipeline RAG activado.<br />Los datos aparecerán aquí.
          </div>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex h-full w-full items-center justify-center p-8">
        <div className="w-full max-w-[260px] text-center">
          <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl border border-primary/15 bg-primary/5">
            <Gauge className="h-5 w-5 text-primary/50" />
          </div>
          <div className="font-heading text-sm font-semibold text-foreground">
            Sin señal activa
          </div>
          <div className="mt-1.5 text-xs text-muted-foreground leading-relaxed">
            Escribe un mensaje en el chat para activar el pipeline RAG e inspeccionar los resultados.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div key={animKey} className="flex h-full w-full flex-col overflow-hidden">
      <div className="animate-stagger-in flex-none" style={{ animationDelay: "0ms" }}>
        <DebugInspectorHeader
          data={data}
          onShowPrompt={() => setShowPrompt(true)}
          onShowJson={() => setShowJson(true)}
        />
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="space-y-5">
          <div className="animate-stagger-in" style={{ animationDelay: "60ms" }}>
            <DebugSummaryCard data={data} docs={docs} />
          </div>

          <div className="animate-stagger-in" style={{ animationDelay: "130ms" }}>
            <TooltipProvider delayDuration={0}>
              <SourcesList docs={docs} onOpenPdf={handleOpenPdf} />
            </TooltipProvider>
          </div>
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
