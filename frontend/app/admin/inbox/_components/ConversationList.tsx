"use client";

import React from "react";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Skeleton } from "@/app/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { MessageSquare, RefreshCw, UserCircle2 } from "lucide-react";
import { ConversationFilters } from "./ConversationFilters";
import {
  type ConversationItem,
  type FilterConfig,
  colorFromId,
  fmtDate,
  getConversationSection,
  humanizeId,
} from "./utils";

interface ConversationListProps {
  conversations: ConversationItem[];
  filtered: ConversationItem[];
  totalConversations: number;
  filterConfig: FilterConfig;
  setFilterConfig: React.Dispatch<React.SetStateAction<FilterConfig>>;
  loading: boolean;
  onRefresh: () => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
  page: number;
  totalPages: number;
  onPrevPage: () => void;
  onNextPage: () => void;
}

export function ConversationList({
  conversations,
  filtered,
  totalConversations,
  filterConfig,
  setFilterConfig,
  loading,
  onRefresh,
  selectedId,
  onSelect,
  page,
  totalPages,
  onPrevPage,
  onNextPage,
}: ConversationListProps) {
  const hasActiveFilters = Boolean(
    filterConfig.search ||
      filterConfig.startDate ||
      filterConfig.endDate ||
      filterConfig.hideTrivial,
  );

  const grouped = React.useMemo(() => {
    return filtered.reduce<{ label: string; items: ConversationItem[] }[]>(
      (sections, conversation) => {
        const label = getConversationSection(conversation.updated_at);
        const lastSection = sections[sections.length - 1];
        if (!lastSection || lastSection.label !== label) {
          sections.push({ label, items: [conversation] });
        } else {
          lastSection.items.push(conversation);
        }
        return sections;
      },
      [],
    );
  }, [filtered]);

  return (
    <>
      <div className="space-y-3 border-b border-border/60 bg-card/80 px-4 py-3.5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2 [&_p]:hidden">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-foreground">
                Conversaciones
              </span>
              <Badge
                variant="outline"
                className="h-5 rounded-full px-2 text-[10px] font-medium"
              >
                {filtered.length}
              </Badge>
            </div>
            <p className="m-0 text-xs text-muted-foreground">
              {hasActiveFilters
                ? `Filtradas sobre ${totalConversations}`
                : "Actualizadas automáticamente"}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-xl text-muted-foreground hover:text-foreground"
            onClick={onRefresh}
            title="Actualizar lista"
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Input
            placeholder="Buscar por texto o ID..."
            value={filterConfig.search}
            onChange={(e) =>
              setFilterConfig((f) => ({ ...f, search: e.target.value }))
            }
            className="h-10 rounded-xl border-border/60 bg-background shadow-none placeholder:text-muted-foreground/60"
          />
          <ConversationFilters
            config={filterConfig}
            onChange={setFilterConfig}
          />
        </div>
        <div className="flex min-h-6 items-center justify-end gap-2 [&>div]:hidden">
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant="secondary"
              className="h-5 rounded-full px-2 text-[10px] font-medium"
            >
              {totalConversations}
            </Badge>
            {filterConfig.hideTrivial && (
              <Badge
                variant="outline"
                className="h-5 rounded-full px-2 text-[10px] font-medium"
              >
                sin triviales
              </Badge>
            )}
          </div>
          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 rounded-lg px-2 text-xs"
              onClick={() =>
                setFilterConfig({
                  search: "",
                  startDate: "",
                  endDate: "",
                  hideTrivial: false,
                })
              }
            >
              Limpiar
            </Button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-2">
        {loading && conversations.length === 0 ? (
          <div className="space-y-1">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-center gap-2.5 px-2.5 py-2">
                <Skeleton className="h-[34px] w-[34px] flex-none rounded-[10px]" />
                <div className="flex-1 space-y-1.5">
                  <div className="flex items-center justify-between gap-3">
                    <Skeleton className="h-3.5 w-28" />
                    <Skeleton className="h-2.5 w-8" />
                  </div>
                  <Skeleton className="h-2.5 w-2/3" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex h-40 flex-col items-center justify-center rounded-2xl border border-dashed border-border/70 bg-background px-6 text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-muted/50 text-muted-foreground">
              <MessageSquare className="h-5 w-5" />
            </div>
            <p className="m-0 text-sm font-medium text-foreground">
              No hay conversaciones recientes
            </p>
            <p className="m-1 text-xs text-muted-foreground">
              Ajusta los filtros o vuelve a cargar la lista.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {grouped.map((section) => (
              <div key={section.label} className="space-y-1">
                <div className="sticky top-0 z-[1] bg-surface/95 px-2 pb-1.5 pt-2 font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground supports-[backdrop-filter]:bg-surface/80 supports-[backdrop-filter]:backdrop-blur-sm">
                  {section.label}
                </div>
                {section.items.map((c) => {
                  const isActive = selectedId === c.conversation_id;
                  const preview = c.last_message_preview;
                  return (
                    <button
                      key={c.conversation_id}
                      type="button"
                      onClick={() => onSelect(c.conversation_id)}
                      className={cn(
                        "group flex w-full items-center gap-2.5 rounded-xl border px-2.5 py-2 text-left transition-colors duration-150",
                        isActive
                          ? "border-primary/25 bg-primary/[0.07] shadow-sm"
                          : "border-transparent hover:border-border/60 hover:bg-background",
                      )}
                    >
                      <span
                        className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-[10px] border border-white/50 text-foreground shadow-sm"
                        style={{
                          backgroundColor: colorFromId(c.conversation_id),
                        }}
                      >
                        <UserCircle2 className="h-4 w-4 opacity-75" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-2">
                          <span
                            className={cn(
                              "truncate text-[13px] font-semibold",
                              isActive ? "text-primary" : "text-foreground",
                            )}
                          >
                            {humanizeId(c.conversation_id)}
                          </span>
                          <span className="flex-none whitespace-nowrap font-mono text-[11px] text-muted-foreground/70">
                            {fmtDate(c.updated_at)}
                          </span>
                        </span>
                        <span className="mt-0.5 flex items-center gap-1.5">
                          <span
                            className={cn(
                              "min-w-0 flex-1 truncate text-[12px] text-muted-foreground",
                              !preview && "italic text-muted-foreground/70",
                            )}
                          >
                            {preview || "Sin mensajes"}
                          </span>
                          <span className="inline-flex flex-none items-center gap-0.5 font-mono text-[11px] text-muted-foreground/70">
                            <MessageSquare
                              className="h-3 w-3"
                              aria-hidden="true"
                            />
                            {c.total_messages}
                            <span className="sr-only"> mensajes</span>
                          </span>
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between border-t border-border/60 bg-card/80 px-4 py-3">
        <div className="text-xs text-muted-foreground">
          Pagina {page} de {totalPages}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8 rounded-lg border-border/60 px-3"
            onClick={onPrevPage}
            disabled={page === 1}
          >
            Anterior
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 rounded-lg border-border/60 px-3"
            onClick={onNextPage}
            disabled={page === totalPages}
          >
            Siguiente
          </Button>
        </div>
      </div>
    </>
  );
}
