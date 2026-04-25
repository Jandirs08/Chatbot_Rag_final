"use client";

import React, { useState } from "react";
import { Button } from "@/app/components/ui/button";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronRight, Copy, Info, X } from "lucide-react";
import { jsonStats } from "./utils";

interface JsonDrawerProps {
  open: boolean;
  onClose: () => void;
  data: unknown;
}

export function JsonDrawer({ open, onClose, data }: JsonDrawerProps) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  if (!open) return null;

  const rootStats = jsonStats(data);

  const isCollapsed = (path: string, value: unknown) => {
    if (path === "root") return false;
    if (
      Array.isArray(value) &&
      (path.endsWith("retrieved") || path.endsWith("retrieved_documents"))
    )
      return true;
    if (path.includes("verification")) return false;
    return Boolean(collapsed[path]);
  };

  const toggleCollapsed = (path: string) =>
    setCollapsed((s) => ({ ...(s || {}), [path]: !s?.[path] }));

  const renderNode = (
    value: unknown,
    path: string,
    depth: number,
  ): React.ReactNode => {
    if (value === null) return <span className="text-slate-400">null</span>;
    if (typeof value === "string")
      return (
        <span className="text-green-300 break-words">
          &quot;{value}&quot;
        </span>
      );
    if (typeof value === "number")
      return <span className="text-amber-300">{String(value)}</span>;
    if (typeof value === "boolean")
      return <span className="text-violet-300">{String(value)}</span>;
    const pad = `pl-${Math.min(depth * 4, 24)}`;
    if (Array.isArray(value)) {
      const isCol = isCollapsed(path, value);
      return (
        <div className={cn(pad)}>
          <button
            className="flex items-center gap-2 cursor-pointer text-zinc-100 hover:text-white transition-colors"
            onClick={() => toggleCollapsed(path)}
          >
            {isCol ? (
              <ChevronRight className="w-4 h-4 transition-transform duration-200" />
            ) : (
              <ChevronDown className="w-4 h-4 transition-transform duration-200" />
            )}
            <span className="text-slate-300">[</span>
            <span className="text-slate-400">{value.length} items</span>
            <span className="text-slate-300">]</span>
          </button>
          <div
            className={cn(
              "transition-opacity duration-150",
              isCol ? "opacity-0 hidden" : "opacity-100",
            )}
          >
            {value.map((v, i) => (
              <div key={`${path}|${i}`} className="leading-7">
                {renderNode(v, `${path}|${i}`, depth + 1)}
                {i < value.length - 1 && (
                  <span className="text-slate-400">,</span>
                )}
              </div>
            ))}
          </div>
        </div>
      );
    }
    const entries = Object.entries(value as Record<string, unknown>);
    const isCol = isCollapsed(path, value);
    return (
      <div className={cn(pad)}>
        <button
          className="flex items-center gap-2 cursor-pointer text-zinc-100 hover:text-white transition-colors"
          onClick={() => toggleCollapsed(path)}
        >
          {isCol ? (
            <ChevronRight className="w-4 h-4 transition-transform duration-200" />
          ) : (
            <ChevronDown className="w-4 h-4 transition-transform duration-200" />
          )}
          <span className="text-slate-300">{`{`}</span>
          <span className="text-slate-400">{entries.length} keys</span>
          <span className="text-slate-300">{`}`}</span>
        </button>
        <div
          className={cn(
            "transition-opacity duration-150",
            isCol ? "opacity-0 hidden" : "opacity-100",
          )}
        >
          {entries.map(([k, v], i) => (
            <div key={`${path}|${k}`} className="leading-7">
              <span className="text-sky-300 font-semibold break-words">
                &quot;{k}&quot;
              </span>
              <span className="text-slate-400">: </span>
              {renderNode(v, `${path}|${k}`, depth + 1)}
              {i < entries.length - 1 && (
                <span className="text-slate-400">,</span>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />
      <div className="absolute inset-y-0 right-0 w-[min(85vw,560px)] bg-card border-l border-border shadow-xl transform transition-transform duration-300 translate-x-0 dark:bg-slate-900 dark:border-slate-800">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border dark:border-slate-800">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-muted border border-border dark:bg-slate-800 dark:border-slate-700">
              <Info className="w-4 h-4 text-muted-foreground" />
            </span>
            <span className="text-sm font-semibold text-foreground">
              JSON Crudo
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
            <span>{rootStats.keys} claves</span>
            <span>{rootStats.arrays} arrays</span>
            <span>{rootStats.objects} objetos</span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              className="h-8"
              onClick={() =>
                navigator.clipboard?.writeText(JSON.stringify(data, null, 2))
              }
            >
              <Copy className="w-4 h-4 mr-2" />
              Copiar
            </Button>
          </div>
        </div>
        <div className="p-4">
          <div className="rounded-md border bg-zinc-950 text-zinc-100 p-4 max-h-screen overflow-auto">
            <div
              className="text-[13px] font-mono leading-7"
              style={{ overflowWrap: "anywhere" }}
            >
              {renderNode(data, "root", 0)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
