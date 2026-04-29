"use client";

import React, { useCallback, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { TooltipProvider } from "@/app/components/ui/tooltip";
import { Gauge } from "lucide-react";
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

export function DebugInspector({ data }: { data?: DebugData | null }) {
  const [pdfOpen, setPdfOpen] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfPage, setPdfPage] = useState<number | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [showJson, setShowJson] = useState(false);

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

  if (!data) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-gradient-to-b from-background via-background to-surface/70 p-6">
        <div className="w-full max-w-sm rounded-[24px] border border-border/60 bg-card px-6 py-8 text-center shadow-sm">
          <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-border/60 bg-surface shadow-sm">
            <Gauge className="w-5 h-5 text-slate-500" />
          </div>
          <div className="text-sm font-semibold text-foreground">
            Esperando datos
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            Envía un mensaje para inspeccionar el flujo RAG
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-gradient-to-b from-background via-background to-surface/60">
      <DebugInspectorHeader
        data={data}
        onShowPrompt={() => setShowPrompt(true)}
        onShowJson={() => setShowJson(true)}
      />

      <div className="flex-1 overflow-visible px-4 py-4 md:overflow-y-auto">
        <div className="space-y-5">
          <DebugSummaryCard data={data} docs={docs} />

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
