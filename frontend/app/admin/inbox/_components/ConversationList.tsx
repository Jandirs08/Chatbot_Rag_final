"use client";

import React from "react";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { EmptyState } from "@/app/components/ui/empty-state";
import { Skeleton } from "@/app/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { CalendarDays, MessageSquare, RefreshCw, UserCircle2 } from "lucide-react";
import { ConversationFilters } from "./ConversationFilters";
import {
  type ConversationItem,
  type FilterConfig,
  colorFromId,
  fmtConversationMeta,
  fmtDate,
  getConversationSection,
  humanizeId,
  previewClampClass,
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

      <div className="flex-1 overflow-y-auto px-3 py-3">
        {loading && conversations.length === 0 ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="rounded-2xl border border-border/50 bg-background px-4 py-3"
            >
              <div className="flex gap-3">
                <Skeleton className="h-11 w-11 rounded-2xl" />
                <div className="space-y-2 flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <Skeleton className="h-4 w-28" />
                    <Skeleton className="h-3 w-10" />
                  </div>
                  <Skeleton className="h-3 w-2/3" />
                  <Skeleton className="h-5 w-24 rounded-full" />
                </div>
              </div>
            </div>
          ))
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<MessageSquare className="h-5 w-5" />}
            title="No hay conversaciones recientes"
            description="Ajusta los filtros o vuelve a cargar la lista."
          />
        ) : (
          <div className="space-y-4">
            {grouped.map((section) => (
              <div key={section.label} className="space-y-2">
                <div className="px-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  {section.label}
                </div>
                <div className="space-y-2">
                  {section.items.map((c) => {
                    const isActive = selectedId === c.conversation_id;
                    return (
                      <button
                        key={c.conversation_id}
                        type="button"
                        onClick={() => onSelect(c.conversation_id)}
                        className={cn(
                          "group w-full rounded-2xl border px-4 py-3 text-left transition-all duration-200",
                          isActive
                            ? "border-primary/20 bg-primary/10 shadow-sm"
                            : "border-transparent bg-background hover:border-border/70 hover:bg-muted/60",
                        )}
                      >
                        <div className="flex items-start gap-3">
                          <div
                            className="flex h-11 w-11 flex-none items-center justify-center rounded-2xl border border-white/50 text-slate-700 shadow-sm"
                            style={{
                              backgroundColor: colorFromId(c.conversation_id),
                            }}
                          >
                            <UserCircle2 className="h-5 w-5 opacity-80" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="mb-1 flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <span
                                  className={cn(
                                    "block truncate text-sm font-semibold",
                                    isActive
                                      ? "text-primary"
                                      : "text-foreground",
                                  )}
                                >
                                  {humanizeId(c.conversation_id)}
                                </span>
                                <span className="block truncate font-mono text-[11px] text-muted-foreground/70">
                                  {c.conversation_id.slice(0, 10)}...
                                </span>
                              </div>
                              <span className="ml-2 whitespace-nowrap text-[11px] font-medium text-muted-foreground">
                                {fmtDate(c.updated_at)}
                              </span>
                            </div>
                            <p
                              className={cn(
                                "text-[13px] leading-5 text-muted-foreground",
                                previewClampClass,
                              )}
                            >
                              {c.last_message_preview || (
                                <span className="italic text-muted-foreground/70">
                                  Sin mensajes
                                </span>
                              )}
                            </p>
                            <div className="mt-3 flex flex-wrap items-center gap-2">
                              <Badge
                                variant={isActive ? "default" : "secondary"}
                                className="h-5 rounded-full px-2 text-[10px] font-medium"
                              >
                                {c.total_messages} mensajes
                              </Badge>
                              <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                                <CalendarDays className="h-3.5 w-3.5" />
                                {fmtConversationMeta(c.updated_at)}
                              </span>
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
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
