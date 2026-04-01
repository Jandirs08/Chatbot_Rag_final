"use client";

import React, { useEffect, useState, Suspense } from "react";
import useSWR from "swr";
import { useRouter, useSearchParams } from "next/navigation";
import { useRequireAdmin } from "@/app/hooks/useAuthGuard";
import { API_URL } from "@/app/lib/config";
import { authenticatedFetch } from "@/app/lib/services/authService";
import {
  ChatMessageBubble,
  Message as BubbleMessage,
} from "@/features/chat/components/ChatMessageBubble";
import { Button } from "@/app/components/ui/button";
import { Skeleton } from "@/app/components/ui/skeleton";
import {
  RefreshCw,
  MessageSquare,
  Copy,
  UserCircle2,
  ListFilter,
  ChevronLeft,
  CalendarDays,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/app/components/ui/input";
import { Badge } from "@/app/components/ui/badge";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/app/components/ui/popover";
import { Switch } from "@/app/components/ui/switch";
const previewClampClass =
  "overflow-hidden [display:-webkit-box] [-webkit-line-clamp:2] [-webkit-box-orient:vertical]";

// --- Tipos ---
type ConversationItem = {
  conversation_id: string;
  last_message_preview: string;
  total_messages: number;
  updated_at: string;
};

type ConversationResponse = {
  items: ConversationItem[];
  total: number;
};

type HistoryItem = {
  role: "user" | "assistant" | "system" | "function";
  content: string;
  timestamp?: string;
  source?: string | null;
};

const EMPTY_CONVERSATIONS: ConversationItem[] = [];
const EMPTY_HISTORY: HistoryItem[] = [];

// --- Fetcher para SWR (Usa tu servicio autenticado) ---
const fetcher = async (url: string) => {
  const res = await authenticatedFetch(url, { method: "GET" });
  if (!res.ok) throw new Error("Error fetching data");
  return res.json();
};

// --- Helpers Visuales (Humanización de IDs) ---
const colorFromId = (id: string) => {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360;
  return `hsl(${h}deg 65% 85%)`; // Colores pastel
};

const humanizeId = (id?: string | null) => {
  if (!id) return "Usuario Desconocido";
  // Toma los últimos 4 caracteres hexadecimales para crear un "Tag"
  const clean = id.replace(/[^a-fA-F0-9]/g, "");
  const tag = clean.slice(-4).toUpperCase();
  return `Visitante #${tag || "0000"}`;
};

const isSameDay = (left: Date, right: Date) =>
  left.getFullYear() === right.getFullYear() &&
  left.getMonth() === right.getMonth() &&
  left.getDate() === right.getDate();

const fmtDate = (iso?: string) => {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);

    if (isSameDay(d, now)) {
      return d.toLocaleTimeString("es-PE", {
        hour: "numeric",
        minute: "2-digit",
      });
    }

    if (isSameDay(d, yesterday)) {
      return "Ayer";
    }

    return d.toLocaleDateString("es-PE", {
      day: "2-digit",
      month: "short",
    });
  } catch {
    return "";
  }
};

const fmtConversationMeta = (iso?: string) => {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("es-PE", {
      day: "2-digit",
      month: "short",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
};

const getConversationSection = (iso?: string) => {
  if (!iso) return "Sin fecha";

  const d = new Date(iso);
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const diffInDays =
    (new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() -
      new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) /
    (1000 * 60 * 60 * 24);

  if (isSameDay(d, now)) return "Hoy";
  if (isSameDay(d, yesterday)) return "Ayer";
  if (diffInDays < 7) return "Esta semana";
  return "Anteriores";
};

function AdminInboxContent() {
  const { isAuthorized } = useRequireAdmin();
  const router = useRouter();
  const searchParams = useSearchParams();

  // Estado local solo para la selección visual inmediata
  const chatIdFromUrl = searchParams.get("chatId");
  const hasChat = Boolean(chatIdFromUrl);
  const [filterConfig, setFilterConfig] = useState({
    search: "",
    startDate: "",
    endDate: "",
    hideTrivial: false,
  });

  // Paginación
  const [page, setPage] = useState(1);
  const LIMIT = 50;

  const scrollRef = React.useRef<HTMLDivElement | null>(null);

  // 1. SWR para la LISTA de conversaciones (Polling cada 10s)
  const skip = (page - 1) * LIMIT;
  const {
    data: conversationData,
    isLoading: loadingList,
    mutate: refreshList,
  } = useSWR<ConversationResponse>(
    isAuthorized
      ? `${API_URL}/chat/conversations?limit=${LIMIT}&skip=${skip}`
      : null,
    fetcher,
    { refreshInterval: 10000, revalidateOnFocus: true },
  );

  const conversations = conversationData?.items ?? EMPTY_CONVERSATIONS;
  const totalConversations = conversationData?.total || 0;
  const totalPages = Math.max(1, Math.ceil(totalConversations / LIMIT));

  // 2. SWR para el HISTORIAL del chat seleccionado (Polling más rápido: 5s)
  // Esto hace que los mensajes aparezcan solos sin refrescar
  const { data: messages = EMPTY_HISTORY, isLoading: loadingHistory } = useSWR<
    HistoryItem[]
  >(
    isAuthorized && chatIdFromUrl
      ? `${API_URL}/chat/history/${chatIdFromUrl}`
      : null,
    fetcher,
    { refreshInterval: 5000, revalidateOnFocus: false },
  );

  const getMessageKey = (m: HistoryItem, idx: number): string => {
    const maybeId = (m as unknown as { id?: string | number }).id;
    if (maybeId != null && String(maybeId).trim().length > 0) {
      return String(maybeId);
    }
    const ts = m.timestamp ? new Date(m.timestamp).getTime() : 0;
    const contentSlice = (m.content ?? "").slice(0, 24).replace(/\s+/g, " ");
    if (ts) {
      return `${m.role}-${ts}-${contentSlice}`;
    }
    const base = `${m.role}-${m.content ?? ""}`;
    let hash = 0;
    for (let i = 0; i < base.length; i++) {
      hash = (hash << 5) - hash + base.charCodeAt(i);
      hash |= 0;
    }
    return `${m.role}-${hash}-${idx}`;
  };

  // Filtrado client-side
  const filteredConversations = React.useMemo(() => {
    const list = conversations || [];
    const text = filterConfig.search.trim().toLowerCase();
    const toStart = (s: string) => {
      const [y, m, d] = s.split("-");
      return new Date(Number(y), Number(m) - 1, Number(d), 0, 0, 0, 0);
    };
    const toEnd = (s: string) => {
      const [y, m, d] = s.split("-");
      return new Date(Number(y), Number(m) - 1, Number(d), 23, 59, 59, 999);
    };
    const hasStart = !!filterConfig.startDate;
    const hasEnd = !!filterConfig.endDate;
    const start = hasStart ? toStart(filterConfig.startDate) : null;
    const end = hasEnd ? toEnd(filterConfig.endDate) : null;

    return [...list]
      .sort(
        (left, right) =>
          new Date(right.updated_at).getTime() -
          new Date(left.updated_at).getTime(),
      )
      .filter((c) => {
        const updated = new Date(c.updated_at);
        if (start && updated < start) return false;
        if (end && updated > end) return false;
        if (filterConfig.hideTrivial && !(c.total_messages > 2)) return false;
        if (text) {
          const hay =
            `${c.conversation_id} ${c.last_message_preview}`.toLowerCase();
          if (!hay.includes(text)) return false;
        }
        return true;
      });
  }, [conversations, filterConfig]);

  const groupedConversations = React.useMemo(() => {
    return filteredConversations.reduce<
      { label: string; items: ConversationItem[] }[]
    >((sections, conversation) => {
      const label = getConversationSection(conversation.updated_at);
      const lastSection = sections[sections.length - 1];

      if (!lastSection || lastSection.label !== label) {
        sections.push({ label, items: [conversation] });
      } else {
        lastSection.items.push(conversation);
      }

      return sections;
    }, []);
  }, [filteredConversations]);

  const selectedConversation = React.useMemo(
    () =>
      conversations.find(
        (conversation: ConversationItem) =>
          conversation.conversation_id === chatIdFromUrl,
      ),
    [chatIdFromUrl, conversations],
  );

  const hasActiveFilters = Boolean(
    filterConfig.search ||
      filterConfig.startDate ||
      filterConfig.endDate ||
      filterConfig.hideTrivial,
  );

  useEffect(() => {
    if (scrollRef.current) {
      setTimeout(() => {
        const el = scrollRef.current!;
        el.scrollTop = el.scrollHeight;
      }, 100);
    }
  }, [messages, chatIdFromUrl]);

  // Manejo de selección
  const handleSelectChat = (id: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("chatId", id);
    router.replace(`?${params.toString()}`);
  };

  const clearSelectedChat = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("chatId");
    router.replace(`?${params.toString()}`);
  };

  if (!isAuthorized) {
    return null;
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] min-h-[640px] flex-col overflow-hidden rounded-[28px] border border-border/60 bg-card shadow-[0_1px_2px_rgba(15,23,42,0.04),0_18px_48px_rgba(15,23,42,0.08)]">
      <div className="border-b border-border/60 bg-card/95 px-6 py-4 supports-[backdrop-filter]:bg-card/85">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap items-center gap-2 [&_h1]:hidden [&_p]:hidden">
            <div className="flex items-center gap-2">
              <Badge
                variant="secondary"
                className="rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em]"
              >
                Inbox
              </Badge>
              <span className="text-sm font-medium text-foreground">
                {totalConversations} conversaciones
              </span>
            </div>
            <h1 className="text-base font-semibold text-foreground">Buzón</h1>
            <p className="m-0 text-sm text-muted-foreground">
              Lista compacta, estados claros y lectura enfocada.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-400">
              <span className="h-2 w-2 rounded-full bg-current animate-pulse" />
              En vivo
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refreshList()}
              className="h-9 rounded-xl border-border/60 px-3"
            >
              <RefreshCw
                className={cn("mr-2 h-4 w-4", loadingList && "animate-spin")}
              />
              Actualizar
            </Button>
          </div>
        </div>
      </div>
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <div
          className={cn(
            hasChat ? "hidden md:flex" : "flex",
            "w-full md:w-[400px] flex-none border-r border-border/60 flex flex-col min-h-0 bg-surface",
          )}
        >
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
                    {filteredConversations.length}
                  </Badge>
                </div>
                <p className="m-0 text-xs text-muted-foreground">
                  {hasActiveFilters
                    ? `Filtradas sobre ${totalConversations}`
                    : "Actualizadas automÃ¡ticamente"}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 rounded-xl text-muted-foreground hover:text-foreground"
                onClick={() => refreshList()}
                title="Actualizar lista"
              >
                <RefreshCw
                  className={cn("h-4 w-4", loadingList && "animate-spin")}
                />
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <Input
                placeholder="Buscar por texto o ID…"
                value={filterConfig.search}
                onChange={(e) =>
                  setFilterConfig((f) => ({ ...f, search: e.target.value }))
                }
                className="h-10 rounded-xl border-border/60 bg-background shadow-none placeholder:text-muted-foreground/60"
              />
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label="Filtros"
                    className="h-10 w-10 rounded-xl border-border/60 bg-background text-muted-foreground hover:bg-muted"
                  >
                    <ListFilter className="w-4 h-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  align="end"
                  className="w-80 rounded-2xl border-border/60 p-4 shadow-xl"
                >
                  <div className="space-y-4">
                    <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                      Fechas
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant={
                          !filterConfig.startDate && !filterConfig.endDate
                            ? "default"
                            : "outline"
                        }
                        size="sm"
                        onClick={() =>
                          setFilterConfig((f) => ({
                            ...f,
                            startDate: "",
                            endDate: "",
                          }))
                        }
                      >
                        Todo
                      </Button>
                      <Button
                        variant={(() => {
                          const t = new Date();
                          const y = t.getFullYear(),
                            m = t.getMonth() + 1,
                            d = t.getDate();
                          const s = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
                          return filterConfig.startDate === s &&
                            filterConfig.endDate === s
                            ? "default"
                            : "outline";
                        })()}
                        size="sm"
                        onClick={() => {
                          const t = new Date();
                          const y = t.getFullYear(),
                            m = t.getMonth() + 1,
                            d = t.getDate();
                          const s = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
                          setFilterConfig((f) => ({
                            ...f,
                            startDate: s,
                            endDate: s,
                          }));
                        }}
                      >
                        Hoy
                      </Button>
                      <Button
                        variant={(() => {
                          const t = new Date();
                          const end = new Date(
                            t.getFullYear(),
                            t.getMonth(),
                            t.getDate(),
                          );
                          const start = new Date(end);
                          start.setDate(end.getDate() - 7);
                          const s = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(start.getDate()).padStart(2, "0")}`;
                          const e = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}-${String(end.getDate()).padStart(2, "0")}`;
                          return filterConfig.startDate === s &&
                            filterConfig.endDate === e
                            ? "default"
                            : "outline";
                        })()}
                        size="sm"
                        onClick={() => {
                          const t = new Date();
                          const end = new Date(
                            t.getFullYear(),
                            t.getMonth(),
                            t.getDate(),
                          );
                          const start = new Date(end);
                          start.setDate(end.getDate() - 7);
                          const s = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(start.getDate()).padStart(2, "0")}`;
                          const e = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}-${String(end.getDate()).padStart(2, "0")}`;
                          setFilterConfig((f) => ({
                            ...f,
                            startDate: s,
                            endDate: e,
                          }));
                        }}
                      >
                        Última Semana
                      </Button>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1">
                        <Input
                          type="date"
                          value={filterConfig.startDate}
                          onChange={(e) =>
                            setFilterConfig((f) => ({
                              ...f,
                              startDate: e.target.value,
                            }))
                          }
                          placeholder="Desde"
                        />
                      </div>
                      <div className="flex-1">
                        <Input
                          type="date"
                          value={filterConfig.endDate}
                          onChange={(e) =>
                            setFilterConfig((f) => ({
                              ...f,
                              endDate: e.target.value,
                            }))
                          }
                          placeholder="Hasta"
                        />
                      </div>
                    </div>
                    <div className="pt-2 space-y-2">
                      <div className="text-xs font-semibold text-slate-700">
                        Calidad
                      </div>
                      <label className="flex items-center gap-2 text-sm">
                        <Switch
                          checked={filterConfig.hideTrivial}
                          onCheckedChange={(v) =>
                            setFilterConfig((f) => ({ ...f, hideTrivial: !!v }))
                          }
                        />
                        <span>Ocultar conversaciones cortas/vacías</span>
                      </label>
                    </div>
                    <div className="pt-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setFilterConfig({
                            search: "",
                            startDate: "",
                            endDate: "",
                            hideTrivial: false,
                          })
                        }
                      >
                        Limpiar Filtros
                      </Button>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
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
            {loadingList && conversations.length === 0 ? (
              // Skeletons
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
            ) : filteredConversations.length === 0 ? (
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
              <div className="space-y-4">
                {groupedConversations.map((section) => (
                  <div key={section.label} className="space-y-2">
                    <div className="px-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                      {section.label}
                    </div>
                    <div className="space-y-2">
                      {section.items.map((c) => {
                        const isActive = chatIdFromUrl === c.conversation_id;
                        return (
                          <button
                            key={c.conversation_id}
                            type="button"
                            onClick={() => handleSelectChat(c.conversation_id)}
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
                                        isActive ? "text-primary" : "text-foreground",
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

          {/* Paginación */}
          <div className="flex items-center justify-between border-t border-border/60 bg-card/80 px-4 py-3">
            <div className="text-xs text-muted-foreground">
              Pagina {page} de {totalPages}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-8 rounded-lg border-border/60 px-3"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                Anterior
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 rounded-lg border-border/60 px-3"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
              >
                Siguiente
              </Button>
            </div>
          </div>
        </div>

        <div className={cn(
          hasChat ? "flex w-full" : "hidden md:flex",
          "flex-1 flex flex-col min-h-0 bg-card",
        )}>
          {!chatIdFromUrl ? (
            <div className="hidden md:flex flex-1 flex-col items-center justify-center px-6 text-center text-muted-foreground/60">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-border/60 bg-muted/40">
                <MessageSquare className="w-5 h-5" />
              </div>
              <p className="text-[13px] font-medium">Selecciona una conversación</p>
              <p className="mt-2 max-w-sm text-sm text-muted-foreground">
                La lista mantiene contexto y estados; el detalle aparece aquÃ­ sin competir con el resto de la interfaz.
              </p>
            </div>
          ) : (
            <>
              {/* Chat Header - with shadow for depth */}
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/60 bg-card/95 px-5 py-4 supports-[backdrop-filter]:bg-card/85">
                <div className="flex min-w-0 items-center gap-3">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="md:hidden h-9 w-9 rounded-xl"
                    onClick={clearSelectedChat}
                    aria-label="Volver"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </Button>
                  <div
                    className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/60 text-sm font-semibold text-slate-700 shadow-sm"
                    style={{ backgroundColor: colorFromId(chatIdFromUrl) }}
                  >
                    VT
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-foreground">
                      {humanizeId(chatIdFromUrl)}
                      <Badge
                        variant="secondary"
                        className="h-5 rounded-full px-2 text-[10px] font-medium"
                      >
                        {selectedConversation?.total_messages ?? messages.length} mensajes
                      </Badge>
                      <span className="rounded-md bg-muted px-2 py-0.5 text-[10px] font-mono text-muted-foreground">
                        {chatIdFromUrl.slice(0, 8)}…
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                        En vivo
                      </span>
                      {selectedConversation?.updated_at && (
                        <span>Actualizado {fmtConversationMeta(selectedConversation.updated_at)}</span>
                      )}
                    </div>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 rounded-xl border-border/60 px-3"
                  onClick={() => navigator.clipboard.writeText(chatIdFromUrl)}
                >
                  <Copy className="mr-2 h-4 w-4" />
                  Copiar ID
                </Button>
              </div>

              {/* Chat Body - with generous spacing */}
              <div
                className="flex-1 overflow-y-auto bg-surface px-4 py-5 md:px-6"
                ref={scrollRef}
              >
                {loadingHistory && messages.length === 0 ? (
                  // Skeletons Chat
                  <div className="mx-auto max-w-4xl space-y-6 opacity-60">
                    <div className="flex justify-end">
                      <Skeleton className="h-12 w-[min(70%,420px)] rounded-2xl rounded-tr-none" />
                    </div>
                    <div className="flex justify-start">
                      <Skeleton className="h-20 w-[min(78%,520px)] rounded-2xl rounded-tl-none" />
                    </div>
                    <div className="flex justify-end">
                      <Skeleton className="h-10 w-[min(52%,320px)] rounded-2xl rounded-tr-none" />
                    </div>
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex h-full min-h-[260px] flex-col items-center justify-center rounded-2xl border border-dashed border-border/70 bg-background px-6 text-center">
                    Esta conversación no tiene mensajes visibles.
                  </div>
                ) : (
                  <div className="mx-auto max-w-4xl space-y-5">
                    {messages.map((m: HistoryItem, idx: number) => {
                    const isUser = m.role === "user";
                    const stableKey = getMessageKey(m, idx);
                    const bubbleData: BubbleMessage = {
                      id: stableKey,
                      role: m.role,
                      content: m.content,
                      createdAt: m.timestamp ? new Date(m.timestamp) : undefined,
                    };

                    return (
                      <div
                        key={stableKey}
                        className={cn(
                          "flex",
                          isUser ? "justify-end" : "justify-start",
                        )}
                      >
                        <div
                          className={cn(
                            "max-w-[85%] md:max-w-[70%]",
                            isUser ? "items-end" : "items-start",
                          )}
                        >
                          <ChatMessageBubble
                            message={bubbleData}
                            isMostRecent={false}
                            messageCompleted={true}
                            aiEmoji="🤖"
                            botName="Asistente IA"
                          />
                        </div>
                      </div>
                    );
                    })}
                  </div>
                )}
              </div>

              <div className="border-t border-border/60 bg-card/90 px-5 py-3">
                <div className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-muted/40 px-3 py-1.5 text-[11px] font-medium text-muted-foreground">
                  🔒 Solo lectura
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AdminInboxPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center">
          Cargando buzón...
        </div>
      }
    >
      <AdminInboxContent />
    </Suspense>
  );
}
