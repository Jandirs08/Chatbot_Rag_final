import React from "react";
import { cn } from "@/lib/utils";
import type { KanbanColumnDef } from "./inboxConfig";

interface MobileColumnTabsProps {
  columns: KanbanColumnDef[];
  counts: Record<string, number>;
  activeKey: string;
  onChange: (key: string) => void;
}

function MobileColumnTabsImpl({
  columns,
  counts,
  activeKey,
  onChange,
}: MobileColumnTabsProps) {
  return (
    <div
      className="flex gap-1.5 overflow-x-auto pb-0.5 md:hidden"
      style={{ scrollbarWidth: "none" }}
    >
      {columns.map((col) => {
        const key = col.key ?? "__null__";
        const isActive = key === activeKey;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            className={cn(
              "flex flex-none items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 font-heading text-[11px] font-semibold transition-all duration-150",
              isActive
                ? cn(col.headerBg, col.headerText, "border-transparent shadow-sm")
                : "border-border/50 bg-background text-muted-foreground hover:bg-muted",
            )}
          >
            <span
              aria-hidden="true"
              className={cn("h-1.5 w-1.5 flex-none rounded-full", col.dotClass)}
            />
            {col.label}
            <span
              className={cn(
                "rounded-full px-1.5 font-mono text-[9px] font-bold",
                isActive
                  ? "bg-black/20 text-white"
                  : "bg-muted text-muted-foreground",
              )}
            >
              {counts[key] ?? 0}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export const MobileColumnTabs = React.memo(MobileColumnTabsImpl);
