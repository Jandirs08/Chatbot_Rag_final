import React from "react";
import { useDroppable } from "@dnd-kit/core";
import { cn } from "@/lib/utils";
import { KanbanCard } from "./KanbanCard";
import { SkeletonCard } from "./SkeletonCard";
import type { InboxConversation } from "./InboxConversationCard";
import {
  COMPLETED_KEY,
  COLUMN_WIDTH_PX,
  type KanbanColumnDef,
} from "./inboxConfig";

interface KanbanColumnProps {
  col: KanbanColumnDef;
  conversations: InboxConversation[];
  loading: boolean;
  selectedId: string | null;
  mutatingId: string | null;
  agentId: string;
  onSelect: (id: string) => void;
  onTakeover: (id: string) => void;
  onRelease: (id: string) => void;
  onMarkViewed: (id: string) => void;
  // Drag-drop coordination from parent
  isDragActive: boolean;
  draggedFromCompleted: boolean;
  // When true, the column flexes to fill available width (used when the board
  // has ≤ 4 columns and we don't want empty space on wide screens). When
  // false, the column uses a fixed width and the board scrolls horizontally.
  expand?: boolean;
}

function KanbanColumnImpl({
  col,
  conversations,
  loading,
  selectedId,
  mutatingId,
  agentId,
  onSelect,
  onTakeover,
  onRelease,
  onMarkViewed,
  isDragActive,
  draggedFromCompleted,
  expand = false,
}: KanbanColumnProps) {
  const colKey = col.key ?? "__null__";
  const isCompletedCol = col.key === COMPLETED_KEY;
  // Drop target accepts:
  //  - dragged from AI category → Completed column
  //  - dragged from Completed → any AI category column
  const canAcceptDrop = isDragActive
    ? draggedFromCompleted
      ? !isCompletedCol
      : isCompletedCol
    : false;
  const { setNodeRef, isOver } = useDroppable({
    id: `col-${colKey}`,
    data: { columnKey: col.key },
    disabled: !canAcceptDrop,
  });

  return (
    <div
      ref={setNodeRef}
      role="list"
      aria-label={`${col.label}, ${conversations.length} ${
        conversations.length === 1 ? "conversación" : "conversaciones"
      }`}
      style={expand ? undefined : { width: `${COLUMN_WIDTH_PX}px` }}
      className={cn(
        // Two layout modes:
        //  - expand=false (5+ cols): fixed width, board scrolls horizontally.
        //    Width stays stable across pagination/filter ticks.
        //  - expand=true  (≤4 cols): flex-1 so columns fill the board width;
        //    a min-width keeps the layout sane on narrow desktops.
        expand
          ? "flex flex-1 min-w-[260px] flex-col overflow-hidden rounded-xl border transition-[border-color,background-color] duration-200 ease-out"
          : "flex flex-none flex-col overflow-hidden rounded-xl border transition-[border-color,background-color] duration-200 ease-out",
        col.colBg,
        canAcceptDrop && isOver
          ? "border-dashed border-primary/70 bg-primary/[0.08]"
          : canAcceptDrop
            ? "border-dashed border-primary/40"
            : "border-border/40",
      )}
    >
      <div
        className={cn(
          "flex flex-none items-center justify-between px-3 py-2.5",
          col.headerBg,
          col.headerText,
        )}
      >
        <span className="font-heading text-[10px] font-semibold uppercase tracking-[0.14em]">
          {col.label}
        </span>
        <span className="font-mono text-lg font-bold leading-none tabular-nums">
          {conversations.length}
        </span>
      </div>

      <div
        className="flex-1 space-y-2 overflow-y-auto overscroll-contain p-2"
        style={{ scrollbarGutter: "stable" }}
      >
        {loading && conversations.length === 0 ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : conversations.length === 0 ? (
          <div className="flex min-h-[120px] flex-col items-center justify-center rounded-xl border border-dashed border-black/10 px-3 py-6 text-center dark:border-white/10">
            <p className="text-[11px] font-medium text-muted-foreground/50">
              {col.emptyLabel}
            </p>
          </div>
        ) : (
          conversations.map((c) => (
            <KanbanCard
              key={c.conversation_id}
              conversation={c}
              isActive={selectedId === c.conversation_id}
              isMutating={mutatingId === c.conversation_id}
              agentId={agentId}
              onSelect={onSelect}
              onTakeover={onTakeover}
              onRelease={onRelease}
              onMarkViewed={onMarkViewed}
            />
          ))
        )}
      </div>
    </div>
  );
}

// Memoized: with a 5s SWR poll, unchanged columns must NOT re-render.
// Stable handler refs (useCallback in parent) make this effective.
export const KanbanColumn = React.memo(KanbanColumnImpl);
