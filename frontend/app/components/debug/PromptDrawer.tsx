"use client";

import React, { useState } from "react";
import { Button } from "@/app/components/ui/button";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronRight, Copy, MessageSquare, X } from "lucide-react";
import {
  ORDERED_PROMPT_SEGMENTS,
  PROMPT_SEGMENTS,
  emphasize,
  extractInner,
  formatGeneral,
  segRegex,
  splitInstructions,
} from "./utils";

interface PromptDrawerProps {
  open: boolean;
  onClose: () => void;
  promptText: string;
}

export function PromptDrawer({ open, onClose, promptText }: PromptDrawerProps) {
  const [rawMode, setRawMode] = useState(false);
  const [fold, setFold] = useState<Record<string, boolean>>({
    context: false,
    history: false,
    instructions: true,
  });

  if (!open) return null;

  const promptCharCount = String(promptText || "").length;
  const promptSegmentsCount = PROMPT_SEGMENTS.reduce(
    (acc, s) => (segRegex(s).test(String(promptText)) ? acc + 1 : acc),
    0,
  );

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />
      <div className="absolute inset-y-0 right-0 w-[min(85vw,680px)] h-full bg-card border-l border-border shadow-xl transform transition-transform duration-300 translate-x-0 flex flex-col dark:bg-slate-900 dark:border-slate-800">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border dark:border-slate-800">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-muted border border-border dark:bg-slate-800 dark:border-slate-700">
              <MessageSquare className="w-4 h-4 text-muted-foreground" />
            </span>
            <span className="text-sm font-semibold text-foreground">
              Prompt Efectivo
            </span>
          </div>
          <button
            className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-border hover:bg-muted focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-700"
            onClick={onClose}
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
            <Button
              variant="outline"
              className="h-8"
              onClick={() =>
                navigator.clipboard?.writeText(String(promptText || ""))
              }
            >
              <Copy className="w-4 h-4 mr-2" />
              Copiar
            </Button>
            <Button
              variant="outline"
              className="h-8"
              onClick={() => setRawMode((v) => !v)}
            >
              {rawMode ? "Ver highlight" : "Limpiar highlight"}
            </Button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {rawMode ? (
            <div className="rounded-md border bg-[#0F1115] text-slate-100 p-4 max-h-screen overflow-auto">
              <div
                className="text-[13px] font-mono whitespace-pre-line break-words leading-7"
                style={{ overflowWrap: "anywhere" }}
              >
                {String(promptText || "")}
              </div>
            </div>
          ) : (
            <div className="rounded-md border bg-[#0F1115] text-slate-100 p-4 max-h-[calc(100vh-65px)] overflow-y-auto space-y-2">
              {ORDERED_PROMPT_SEGMENTS.map((name) => {
                const inner = extractInner(promptText, name);
                const isOpen = Boolean(fold[name]);
                const title =
                  name === "context"
                    ? "CONTEXTO"
                    : name === "history"
                      ? "HISTORIAL"
                      : "INSTRUCCIONES";
                return (
                  <div
                    key={name}
                    className="rounded-md bg-[#0F1115] border border-white/10"
                  >
                    <button
                      className="w-full flex items-center justify-between px-4 py-3 text-sm hover:bg-slate-800/30 transition-colors font-mono text-[14px] text-slate-100"
                      onClick={() =>
                        setFold((s) => ({ ...(s || {}), [name]: !s?.[name] }))
                      }
                    >
                      <div className="flex items-center gap-2">
                        {isOpen ? (
                          <ChevronDown className="w-4 h-4 transition-transform duration-200" />
                        ) : (
                          <ChevronRight className="w-4 h-4 transition-transform duration-200" />
                        )}
                        <span>{title}</span>
                      </div>
                      <span className="text-xs text-slate-200">
                        {inner.length} chars
                      </span>
                    </button>
                    <div
                      className={cn(
                        "px-4 pb-4 transition-opacity duration-150",
                        isOpen ? "opacity-100" : "opacity-0 hidden",
                      )}
                    >
                      <div
                        className="text-slate-100 font-mono text-[14px]"
                        style={{ overflowWrap: "anywhere" }}
                      >
                        <div className="text-slate-300 mb-2">
                          ────────────────────────────────────────────────
                        </div>
                        {name === "instructions" ? (
                          <div
                            className={cn(
                              "px-4 py-3 inline-block rounded leading-7 break-words",
                              "bg-emerald-500/15",
                            )}
                          >
                            {splitInstructions(inner).map((item, idx) => {
                              const m = item.match(/^\s*(\d+)\.\s*([\s\S]*)$/);
                              const number = m ? m[1] : String(idx + 1);
                              const rest = m ? m[2] : item;
                              return (
                                <div
                                  key={idx}
                                  className="mb-3 whitespace-pre-wrap break-words"
                                >
                                  <div className="mb-1">
                                    <span className="inline-block w-full break-words">
                                      [{number}] {emphasize(rest)}
                                    </span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <pre
                            className={cn(
                              "px-4 py-3 inline-block rounded leading-7 whitespace-pre-wrap break-words",
                              name === "context"
                                ? "bg-indigo-500/15"
                                : "bg-violet-500/15",
                            )}
                          >
                            {formatGeneral(inner)}
                          </pre>
                        )}
                      </div>
                    </div>
                    <div className="px-4">
                      <div className="h-px bg-white/10" />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
