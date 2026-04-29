"use client";

import { Button } from "@/app/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/app/components/ui/tooltip";
import { cn } from "@/app/lib/utils";
import {
  AlertTriangle,
  Braces,
  Shield,
  ShieldCheck,
  Terminal,
} from "lucide-react";
import type { DebugData } from "@/app/components/debug/utils";

interface DebugInspectorHeaderProps {
  data: DebugData;
  onShowPrompt: () => void;
  onShowJson: () => void;
}

export function DebugInspectorHeader({
  data,
  onShowPrompt,
  onShowJson,
}: DebugInspectorHeaderProps) {
  const verificationState = data.verification?.is_grounded;

  return (
    <div className="flex-none border-b border-border/60 bg-background/95 px-4 py-3 supports-[backdrop-filter]:bg-background/90 dark:bg-slate-900 dark:border-slate-800">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="text-sm font-semibold text-foreground">
            Monitor RAG
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className={cn(
                  "inline-flex items-center gap-2 rounded-full px-3 py-1 border text-xs",
                  verificationState === false
                    ? "bg-warning/10 border-warning/20 text-warning"
                    : verificationState === true
                      ? "bg-success/10 border-success/20 text-success"
                      : "bg-muted border-border text-muted-foreground",
                )}
              >
                {verificationState === false ? (
                  <AlertTriangle className="w-3.5 h-3.5" />
                ) : verificationState === true ? (
                  <ShieldCheck className="w-3.5 h-3.5" />
                ) : (
                  <Shield className="w-3.5 h-3.5" />
                )}
                <span className="font-semibold">
                  {verificationState === false
                    ? "Posible Alucinación"
                    : verificationState === true
                      ? "Verificado"
                      : "Sin verificación"}
                </span>
              </div>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs text-xs">
              {data.verification?.reason || "Veredicto del pipeline"}
            </TooltipContent>
          </Tooltip>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8 rounded-full gap-2 border-border bg-card px-3 text-xs font-medium text-muted-foreground transition-all hover:border-primary/30 hover:bg-primary/5 hover:text-primary dark:border-slate-700"
            onClick={onShowPrompt}
          >
            <Terminal className="w-3.5 h-3.5" />
            Prompt
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 rounded-full gap-2 border-border bg-card px-3 text-xs font-medium text-muted-foreground transition-all hover:border-primary/30 hover:bg-primary/5 hover:text-primary dark:border-slate-700"
            onClick={onShowJson}
          >
            <Braces className="w-3.5 h-3.5" />
            JSON
          </Button>
        </div>
      </div>
    </div>
  );
}
