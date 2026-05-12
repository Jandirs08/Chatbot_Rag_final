"use client";

import React, {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import useSWR from "swr";
import { useRequireAdmin } from "@/app/hooks/useAuthGuard";
import { useAuth } from "@/app/hooks/useAuth";
import { useToast } from "@/app/hooks/use-toast";
import * as inboxService from "@/app/lib/services/inboxService";
import {
  RateLimitError,
  inboxJsonFetcher,
  type InboxListResponse,
} from "@/app/lib/services/inboxService";
import { Button } from "@/app/components/ui/button";
import { cn } from "@/lib/utils";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  InboxConversationCard,
  type InboxConversation,
} from "./_components/InboxConversationCard";
import { KanbanColumn } from "./_components/KanbanColumn";
import { KanbanCard } from "./_components/KanbanCard";
import { SkeletonCard } from "./_components/SkeletonCard";
import { EmptyState } from "./_components/EmptyState";
import { ContextualStats } from "./_components/ContextualStats";
import { InboxToolbar } from "./_components/InboxToolbar";
import { MobileColumnTabs } from "./_components/MobileColumnTabs";
import { ConversationDialog } from "./_components/ConversationDialog";
import {
  COMPLETED_KEY,
  isChannelKey,
  isDatosKey,
  isTabKey,
  parseExtras,
  resolveColumns,
  serializeExtras,
  type ChannelKey,
  type DatosKey,
  type ExtraColumnKey,
  type TabKey,
} from "./_components/inboxConfig";

const EMPTY_LIST: InboxConversation[] = [];

// ─── Main ─────────────────────────────────────────────────────────────────────

function InboxContent() {
  const { isAuthorized } = useRequireAdmin();
  const { user } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const agentId = user?.id ?? "";

  // ─ URL-driven state
  const tabParam = searchParams.get("tab");
  const channelParam = searchParams.get("canal");
  const datosParam = searchParams.get("datos");
  const extraParam = searchParams.get("extra");
  const convParam = searchParams.get("conv");
  const activeTab: TabKey = isTabKey(tabParam) ? tabParam : "todos";
  const activeChannel: ChannelKey = isChannelKey(channelParam)
    ? channelParam
    : "todos";
  const activeDatos: DatosKey = isDatosKey(datosParam) ? datosParam : "todos";
  const extras = useMemo(() => parseExtras(extraParam), [extraParam]);

  const [onlyUnseen, setOnlyUnseen] = useState(false);
  const [page, setPage] = useState(1);
  const limit = 50;

  const updateParams = useCallback(
    (next: {
      tab?: TabKey;
      canal?: ChannelKey;
      datos?: DatosKey;
      extra?: Set<ExtraColumnKey>;
      conv?: string | null;
    }) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next.tab !== undefined) {
        if (next.tab === "todos") params.delete("tab");
        else params.set("tab", next.tab);
      }
      if (next.canal !== undefined) {
        if (next.canal === "todos") params.delete("canal");
        else params.set("canal", next.canal);
      }
      if (next.datos !== undefined) {
        if (next.datos === "todos") params.delete("datos");
        else params.set("datos", next.datos);
      }
      if (next.extra !== undefined) {
        const serialized = serializeExtras(next.extra);
        if (serialized) params.set("extra", serialized);
        else params.delete("extra");
      }
      if (next.conv !== undefined) {
        if (!next.conv) params.delete("conv");
        else params.set("conv", next.conv);
      }
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  const setActiveTab = useCallback(
    (tab: TabKey) => updateParams({ tab }),
    [updateParams],
  );
  const setActiveChannel = useCallback(
    (canal: ChannelKey) => updateParams({ canal }),
    [updateParams],
  );
  const setActiveDatos = useCallback(
    (datos: DatosKey) => updateParams({ datos }),
    [updateParams],
  );
  const toggleExtra = useCallback(
    (key: ExtraColumnKey) => {
      const next = new Set(extras);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      updateParams({ extra: next });
    },
    [extras, updateParams],
  );

  // The currently open conversation lives on its own route now; we keep a
  // local `selectedId` purely so the clicked card can render `aria-current`
  // until the route transition completes.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mutatingId, setMutatingId] = useState<string | null>(null);
  const [mobileColumnKey, setMobileColumnKey] = useState<string>("__null__");

  const skip = (page - 1) * limit;

  const {
    data: listData,
    isLoading: loadingList,
    mutate: refreshList,
  } = useSWR<InboxListResponse>(
    isAuthorized
      ? inboxService.buildInboxUrl({
          limit,
          skip,
          tab: activeTab,
          channel: activeChannel,
          datos: activeDatos,
          only_unseen: onlyUnseen,
        })
      : null,
    inboxJsonFetcher,
    {
      refreshInterval: 5000,
      revalidateOnFocus: true,
      dedupingInterval: 3000,
      shouldRetryOnError: (err) => !(err instanceof RateLimitError),
      onError: (err) => {
        if (err instanceof RateLimitError) {
          toast({
            title: "Demasiadas solicitudes",
            description: `Esperando ${err.retryAfterSeconds}s antes de reintentar.`,
            variant: "destructive",
          });
        }
      },
    },
  );

  const conversations = listData?.items ?? EMPTY_LIST;

  // Tab counts (chip badges) come embedded in the inbox response so they
  // reflect the WHOLE inbox, not just the currently visible page.
  const tabCountsData = listData?.counts?.tabs;

  const handlePrevPage = useCallback(() => {
    setPage((p) => Math.max(1, p - 1));
  }, []);

  const handleNextPage = useCallback(() => {
    if (listData) {
      setPage((p) => Math.min(p + 1, listData.total_pages));
    }
  }, [listData]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [activeTab, activeChannel, activeDatos, onlyUnseen]);

  // Server-side filtering: conversations is already filtered.
  const filteredConversations = conversations;

  const tabCounts: Record<TabKey, number> = useMemo(
    () => ({
      todos: tabCountsData?.todos ?? 0,
      pendientes: tabCountsData?.pendientes ?? 0,
      mias: tabCountsData?.mias ?? 0,
      bot: tabCountsData?.bot ?? 0,
    }),
    [tabCountsData],
  );


  // Columns visible right now (base 4 ± opt-ins).
  const visibleColumns = useMemo(() => resolveColumns(extras), [extras]);

  // ≤4 columns → expand each column to fill the board (no empty right gutter
  // on wide screens). 5–6 → keep fixed widths and horizontal scroll.
  const expandColumns = visibleColumns.length <= 4;

  // Group conversations into all columns we KNOW about (including hidden
  // extras) — easy to display counts later. But mainly we route into the
  // visible buckets; everything else is silently dropped from the board.
  const columnedConversations = useMemo(() => {
    const map: Record<string, InboxConversation[]> = {};
    for (const col of visibleColumns) {
      map[col.key ?? "__null__"] = [];
    }
    const visibleKeys = new Set(Object.keys(map));
    const completedVisible = visibleKeys.has(COMPLETED_KEY);
    const unclassifiedKey = "__null__";

    for (const c of filteredConversations) {
      // stage="completed" wins over AI category — lands in dedicated column
      // when visible; otherwise filtered out of the board.
      if (c.stage === "completed") {
        if (completedVisible) map[COMPLETED_KEY].push(c);
        continue;
      }
      const key = c.category ?? unclassifiedKey;
      if (visibleKeys.has(key)) {
        map[key].push(c);
      } else if (key === "sin_valor" && !visibleKeys.has("sin_valor")) {
        // sin_valor toggle off — hide the card entirely (don't fall into
        // "Sin clasificar"; that would be misleading).
        continue;
      } else {
        // Unknown category → fall back to Sin clasificar.
        map[unclassifiedKey].push(c);
      }
    }
    return map;
  }, [filteredConversations, visibleColumns]);

  const columnCounts = useMemo(() => {
    const out: Record<string, number> = {};
    for (const [k, arr] of Object.entries(columnedConversations)) {
      out[k] = arr.length;
    }
    return out;
  }, [columnedConversations]);

  // Sum of currently-visible column buckets. Conversations bound for hidden
  // columns (sin_valor / completed when their toggle is off) are excluded.
  const visibleCardCount = useMemo(
    () => Object.values(columnCounts).reduce((a, b) => a + b, 0),
    [columnCounts],
  );

  const allColumnsEmpty = visibleCardCount === 0 && !loadingList;

  const handleSelect = useCallback(
    (id: string) => {
      setSelectedId(id);
      // Optimistically mark as viewed so the unseen dot disappears.
      if (agentId) {
        inboxService
          .markViewed(id)
          .catch((err) => {
            console.warn("[markViewed] failed:", err);
          });
      }
      updateParams({ conv: id });
    },
    [agentId, updateParams],
  );

  const handleDialogClose = useCallback(() => {
    updateParams({ conv: null });
  }, [updateParams]);

  // Bridge: when the dialog patches a conversation (takeover, release, complete,
  // refresh-summary), reflect it in the kanban list without a refetch.
  const patchListItem = useCallback(
    (updated: InboxConversation) => {
      refreshList(
        (prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            items: prev.items.map((c) =>
              c.conversation_id === updated.conversation_id
                ? { ...c, ...updated }
                : c,
            ),
          };
        },
        { revalidate: false },
      );
    },
    [refreshList],
  );

  const handleTakeover = useCallback(
    async (conversationId: string) => {
      if (!agentId) return;
      setMutatingId(conversationId);
      // Truly optimistic: flip the card before the request lands.
      refreshList(
        (prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            items: prev.items.map((c) =>
              c.conversation_id === conversationId
                ? { ...c, mode: "human" as const, assigned_agent_id: agentId }
                : c,
            ),
          };
        },
        { revalidate: false },
      );
      try {
        const patch = await inboxService.takeover(conversationId);
        // Reconcile with server truth (e.g. an admin reassigning agent).
        refreshList(
          (prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              items: prev.items.map((c) =>
                c.conversation_id === conversationId
                  ? {
                      ...c,
                      mode: patch.mode,
                      assigned_agent_id: patch.assigned_agent_id,
                    }
                  : c,
              ),
            };
          },
          { revalidate: false },
        );
      } catch (err) {
        if (err instanceof RateLimitError) {
          toast({
            title: "Demasiadas solicitudes",
            description: `Espera ${err.retryAfterSeconds}s e intenta de nuevo.`,
            variant: "destructive",
          });
          await refreshList();
        } else {
          const isConflict =
            err instanceof Error && err.message === "ALREADY_TAKEN";
          toast({
            title: isConflict ? "Conversación no disponible" : "Error",
            description: isConflict
              ? "Otro agente ya tomó esta conversación."
              : "No se pudo tomar la conversación.",
            variant: "destructive",
          });
          // Revert from server.
          await refreshList();
        }
      } finally {
        setMutatingId(null);
      }
    },
    [agentId, refreshList, toast],
  );

  const handleRelease = useCallback(
    async (conversationId: string) => {
      if (!agentId) return;
      setMutatingId(conversationId);
      try {
        await inboxService.release(conversationId);
        await refreshList();
      } catch (err) {
        if (err instanceof RateLimitError) {
          toast({
            title: "Demasiadas solicitudes",
            description: `Espera ${err.retryAfterSeconds}s e intenta de nuevo.`,
            variant: "destructive",
          });
        } else {
          toast({
            title: "Error",
            description: "No se pudo liberar la conversación.",
            variant: "destructive",
          });
        }
      } finally {
        setMutatingId(null);
      }
    },
    [agentId, refreshList, toast],
  );

  const handleMarkViewed = useCallback(
    async (conversationId: string) => {
      if (!agentId) return;
      try {
        await inboxService.markViewed(conversationId);
        await refreshList();
      } catch (err) {
        if (err instanceof RateLimitError) {
          toast({
            title: "Demasiadas solicitudes",
            description: `Espera ${err.retryAfterSeconds}s.`,
            variant: "destructive",
          });
        } else {
          toast({
            title: "Error",
            description: "No se pudo marcar como visto.",
            variant: "destructive",
          });
        }
      }
    },
    [agentId, refreshList, toast],
  );

  // Reset mobile column tab when filters change so the user lands on a non-empty col.
  useEffect(() => {
    const firstNonEmpty = visibleColumns.find(
      (c) => (columnedConversations[c.key ?? "__null__"]?.length ?? 0) > 0,
    );
    if (firstNonEmpty) {
      const key = firstNonEmpty.key ?? "__null__";
      setMobileColumnKey((prev) =>
        (columnedConversations[prev]?.length ?? 0) > 0 ? prev : key,
      );
    }
  }, [columnedConversations, visibleColumns]);

  // ─ Drag-drop state
  const [draggedConv, setDraggedConv] = useState<InboxConversation | null>(
    null,
  );
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor),
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const conv = event.active.data.current?.conversation as
      | InboxConversation
      | undefined;
    if (conv) setDraggedConv(conv);
  }, []);

  const handleDragCancel = useCallback(() => {
    setDraggedConv(null);
  }, []);

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const conv = event.active.data.current?.conversation as
        | InboxConversation
        | undefined;
      const targetKey = event.over?.data.current?.columnKey as
        | string
        | null
        | undefined;
      setDraggedConv(null);
      if (!conv || targetKey === undefined) return;

      const fromCompleted = conv.stage === "completed";
      const toCompleted = targetKey === COMPLETED_KEY;
      // No-op: same column or disallowed (AI ↔ AI)
      if (fromCompleted === toCompleted) return;

      const id = conv.conversation_id;
      const action = toCompleted ? "complete" : "reopen";

      // Optimistic update — flip stage immediately
      const optimisticPatch: Partial<InboxConversation> = toCompleted
        ? { stage: "completed", completed_at: new Date().toISOString() }
        : { stage: "active", completed_at: null };

      refreshList(
        (prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            items: prev.items.map((c) =>
              c.conversation_id === id ? { ...c, ...optimisticPatch } : c,
            ),
          };
        },
        { revalidate: false },
      );

      try {
        const updated =
          action === "complete"
            ? await inboxService.complete(id)
            : await inboxService.reopen(id);
        // Reconcile with server truth
        refreshList(
          (prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              items: prev.items.map((c) =>
                c.conversation_id === id ? { ...c, ...updated } : c,
              ),
            };
          },
          { revalidate: false },
        );
        toast({
          title: toCompleted ? "Marcada como completada" : "Reabierta",
        });
      } catch (err) {
        // Revert
        await refreshList();
        if (err instanceof RateLimitError) {
          toast({
            title: "Demasiadas solicitudes",
            description: `Espera ${err.retryAfterSeconds}s e intenta de nuevo.`,
            variant: "destructive",
          });
        } else {
          toast({
            title: "Error",
            description: toCompleted
              ? "No se pudo completar la conversación."
              : "No se pudo reabrir la conversación.",
            variant: "destructive",
          });
        }
      }
    },
    [refreshList, toast],
  );

  const draggedFromCompleted = draggedConv?.stage === "completed";

  // Seed the dialog's SWR cache from the list so it opens with no flicker.
  const dialogFallback = useMemo(
    () =>
      convParam
        ? conversations.find((c) => c.conversation_id === convParam)
        : undefined,
    [convParam, conversations],
  );

  if (!isAuthorized) return null;

  return (
    <div className="flex h-[calc(100vh-4rem)] min-h-[640px] flex-col overflow-hidden rounded-2xl border border-border/60 bg-card shadow-md">
        {/* ── Top bar ── */}
        <div className="flex-none border-b border-border/60 bg-card px-6 py-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="font-heading text-xl font-bold leading-tight tracking-tight text-foreground">
                Inbox
              </h1>
              <p
                className="mt-0.5 text-[12px] text-muted-foreground"
                aria-live="polite"
                aria-atomic="true"
              >
                <span className="font-mono font-semibold tabular-nums text-foreground">
                  {visibleCardCount}
                </span>{" "}
                {visibleCardCount === 1
                  ? "conversación visible"
                  : "conversaciones visibles"}
              </p>
            </div>
            <div className="flex flex-none items-center gap-2">
              <div className="inline-flex items-center gap-1.5 rounded-full border border-success/25 bg-success/10 px-3 py-1.5 text-[11px] font-semibold text-success">
                <span
                  aria-hidden="true"
                  className="h-1.5 w-1.5 animate-pulse rounded-full bg-success"
                />
                En vivo
              </div>
            </div>
          </div>

          {/* Single dense filter row — replaces the prior 2-3 stacked rows. */}
          <div className="mt-3">
            <InboxToolbar
              activeTab={activeTab}
              tabCounts={tabCounts}
              onTabChange={setActiveTab}
              activeChannel={activeChannel}
              onChannelChange={setActiveChannel}
              activeDatos={activeDatos}
              onDatosChange={setActiveDatos}
              onlyUnseen={onlyUnseen}
              onOnlyUnseenChange={setOnlyUnseen}
              extras={extras}
              onExtraToggle={toggleExtra}
              refreshing={loadingList}
              onRefresh={() => refreshList()}
            />
          </div>

          {/* Contextual stats per tab */}
          <div className="mt-3">
            <ContextualStats
              tab={activeTab}
              conversations={filteredConversations}
              agentId={agentId}
            />
          </div>

          {/* Mobile column tabs */}
          <div className="mt-3">
            <MobileColumnTabs
              columns={visibleColumns}
              counts={columnCounts}
              activeKey={mobileColumnKey}
              onChange={setMobileColumnKey}
            />
          </div>
        </div>

        {/* ── Board ── */}
        <DndContext
          sensors={sensors}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
        >
          <div className="flex min-h-0 flex-1 overflow-hidden bg-muted/30">
            {allColumnsEmpty ? (
              <EmptyState tab={activeTab} datos={activeDatos} />
            ) : (
              <>
                {/* Desktop: visible columns.
                    ≤4 cols → fill the board width (no horizontal scroll).
                    5+ cols → fixed widths + horizontal scroll. */}
                <div
                  className={cn(
                    "hidden min-h-0 flex-1 overflow-y-hidden md:flex",
                    expandColumns ? "overflow-x-hidden" : "overflow-x-auto",
                  )}
                >
                  <div
                    className={cn(
                      "flex h-full gap-3 p-4",
                      expandColumns ? "w-full" : "",
                    )}
                  >
                    {visibleColumns.map((col) => {
                      const key = col.key ?? "__null__";
                      return (
                        <KanbanColumn
                          key={key}
                          col={col}
                          conversations={columnedConversations[key] ?? []}
                          loading={loadingList}
                          selectedId={selectedId}
                          mutatingId={mutatingId}
                          agentId={agentId}
                          onSelect={handleSelect}
                          onTakeover={handleTakeover}
                          onRelease={handleRelease}
                          onMarkViewed={handleMarkViewed}
                          isDragActive={draggedConv != null}
                          draggedFromCompleted={draggedFromCompleted}
                          expand={expandColumns}
                        />
                      );
                    })}
                  </div>
                </div>

                {/* Mobile: single active column */}
                <div className="flex min-h-0 w-full flex-col overflow-y-auto p-3 md:hidden">
                  {(() => {
                    const col = visibleColumns.find(
                      (c) => (c.key ?? "__null__") === mobileColumnKey,
                    );
                    if (!col) return null;
                    const key = col.key ?? "__null__";
                    const colConvs = columnedConversations[key] ?? [];
                    return (
                      <div className="flex flex-col gap-2">
                        {loadingList && colConvs.length === 0 ? (
                          <>
                            <SkeletonCard />
                            <SkeletonCard />
                          </>
                        ) : colConvs.length === 0 ? (
                          <div className="flex min-h-[160px] items-center justify-center rounded-xl border border-dashed border-border/60 bg-background px-4 text-center">
                            <p className="text-[12px] text-muted-foreground/50">
                              {col.emptyLabel}
                            </p>
                          </div>
                        ) : (
                          colConvs.map((c) => (
                            <KanbanCard
                              key={c.conversation_id}
                              conversation={c}
                              isActive={selectedId === c.conversation_id}
                              isMutating={mutatingId === c.conversation_id}
                              agentId={agentId}
                              onSelect={handleSelect}
                              onTakeover={handleTakeover}
                              onRelease={handleRelease}
                              onMarkViewed={handleMarkViewed}
                            />
                          ))
                        )}
                      </div>
                    );
                  })()}
                </div>
              </>
            )}
          </div>
          <DragOverlay
            dropAnimation={{
              duration: 200,
              easing: "cubic-bezier(0.22, 1, 0.36, 1)",
            }}
          >
            {draggedConv ? (
              <div className="pointer-events-none rotate-1 opacity-95 shadow-2xl">
                <InboxConversationCard
                  conversation={draggedConv}
                  isActive={false}
                  isMutating={false}
                  agentId={agentId}
                  onSelect={() => {}}
                  onTakeover={() => {}}
                  onRelease={() => {}}
                  onMarkViewed={() => {}}
                />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>

        {/* Conversation dialog — URL-driven (?conv=<id>). */}
        <ConversationDialog
          conversationId={convParam || null}
          onClose={handleDialogClose}
          fallbackData={dialogFallback}
          agentId={agentId}
          onConversationUpdate={patchListItem}
        />

        {/* Pagination — inside the bordered container, only shown when paging is meaningful */}
        {listData && listData.total_pages > 1 && (
          <div className="flex flex-none items-center justify-between border-t border-border/60 bg-card px-4 py-2.5">
            <div className="font-mono text-[11px] tabular-nums text-muted-foreground">
              Página{" "}
              <span className="font-semibold text-foreground">
                {listData.page}
              </span>{" "}
              de {listData.total_pages}
              <span className="ml-2 text-muted-foreground/60">
                ({listData.total} en total)
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handlePrevPage}
                disabled={page === 1}
                className="h-8 rounded-lg"
              >
                Anterior
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleNextPage}
                disabled={!listData.has_next}
                className="h-8 rounded-lg"
              >
                Siguiente
              </Button>
            </div>
          </div>
        )}
    </div>
  );
}

export default function AdminInboxPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center">
          <span className="text-sm text-muted-foreground">Cargando inbox…</span>
        </div>
      }
    >
      <InboxContent />
    </Suspense>
  );
}
