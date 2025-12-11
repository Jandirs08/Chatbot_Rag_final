"use client";

import React, { useEffect, useState, Suspense } from "react";
import useSWR, { mutate } from "swr";
import { useRouter, useSearchParams } from "next/navigation";
import { useRequireAdmin } from "@/app/hooks/useAuthGuard";
import { API_URL } from "@/app/lib/config";
import { authenticatedFetch } from "@/app/lib/services/authService";
import { getPublicBotConfig } from "@/app/lib/services/botConfigService";
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
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationEllipsis,
  PaginationPrevious,
  PaginationNext,
} from "@/app/components/ui/pagination";

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

const fmtDate = (iso?: string) => {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    // Formato corto: "14:30" o "Ayer"
    const now = new Date();
    const isToday =
      d.getDate() === now.getDate() && d.getMonth() === now.getMonth();
    return isToday
      ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      : d.toLocaleDateString();
  } catch {
    return "";
  }
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

  // Configuración del Bot (para colores)
  const { data: botConfig } = useSWR("chat-bot-config", getPublicBotConfig);

  useEffect(() => {
    if (botConfig?.theme_color) {
      document.documentElement.style.setProperty(
        "--brand-color",
        botConfig.theme_color,
      );
    }
  }, [botConfig]);

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

  const conversations = conversationData?.items || [];
  const totalConversations = conversationData?.total || 0;
  const totalPages = Math.max(1, Math.ceil(totalConversations / LIMIT));

  // 2. SWR para el HISTORIAL del chat seleccionado (Polling más rápido: 5s)
  // Esto hace que los mensajes aparezcan solos sin refrescar
  const { data: messages = [], isLoading: loadingHistory } = useSWR<
    HistoryItem[]
  >(
    isAuthorized && chatIdFromUrl
      ? `${API_URL}/chat/history/${chatIdFromUrl}`
      : null,
    fetcher,
    { refreshInterval: 5000, revalidateOnFocus: false },
  );

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

    return list.filter((c) => {
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

  if (!isAuthorized) return null;

  return (
    <div className="flex h-full overflow-hidden bg-white border-t border-slate-200">
      {/* --- COLUMNA IZQUIERDA: LISTA --- */}
      <div className={cn(
        hasChat ? "hidden md:flex" : "flex",
        "w-full md:w-96 flex-none border-r border-slate-200 flex-col bg-slate-50/30",
      )}
      >
        <div className="px-4 py-3 border-b bg-white sticky top-0 z-10 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-slate-800">Buzón</h2>
              <Badge variant="outline" className="text-xs">
                {totalConversations}
              </Badge>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-slate-500 hover:text-blue-600"
              onClick={() => refreshList()}
              title="Actualizar lista"
            >
              <RefreshCw
                className={cn("w-4 h-4", loadingList && "animate-spin")}
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
            />
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="icon" aria-label="Filtros">
                  <ListFilter className="w-4 h-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-80 shadow-lg">
                <div className="space-y-3">
                  <div className="text-xs font-semibold text-slate-700">
                    Fechas
                  </div>
                  <div className="flex items-center gap-2">
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
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {loadingList && conversations.length === 0 ? (
            // Skeletons
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="p-3 rounded-lg border border-transparent">
                <div className="flex gap-3">
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <div className="space-y-2 flex-1">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                </div>
              </div>
            ))
          ) : filteredConversations.length === 0 ? (
            <div className="h-32 flex items-center justify-center text-xs text-slate-400">
              No hay conversaciones recientes
            </div>
          ) : (
            // Lista Real
            filteredConversations.map((c) => {
              const isActive = chatIdFromUrl === c.conversation_id;
              return (
                <div
                  key={c.conversation_id}
                  onClick={() => handleSelectChat(c.conversation_id)}
                  className={cn(
                    "group relative flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-all duration-200 border",
                    isActive
                      ? "bg-white border-blue-200 shadow-sm ring-1 ring-blue-100 z-10"
                      : "bg-transparent border-transparent hover:bg-white hover:border-slate-200 hover:shadow-sm",
                  )}
                >
                  {/* Avatar Humanizado */}
                  <div
                    className="flex-none w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold text-slate-700 shadow-sm border border-black/5"
                    style={{ backgroundColor: colorFromId(c.conversation_id) }}
                  >
                    <UserCircle2 className="w-6 h-6 opacity-50" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <span
                        className={cn(
                          "text-xs font-bold truncate",
                          isActive ? "text-blue-700" : "text-slate-700",
                        )}
                      >
                        {humanizeId(c.conversation_id)}
                      </span>
                      <span className="text-[10px] text-slate-400 whitespace-nowrap ml-2">
                        {fmtDate(c.updated_at)}
                      </span>
                    </div>
                    <p className="text-sm text-slate-600 truncate group-hover:text-slate-900">
                      {c.last_message_preview || (
                        <span className="italic text-slate-400">
                          Sin mensajes
                        </span>
                      )}
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Paginación */}
        <div className="p-2 border-t border-slate-200 bg-white">
          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className={
                    page === 1
                      ? "pointer-events-none opacity-50"
                      : "cursor-pointer"
                  }
                />
              </PaginationItem>

              {(() => {
                const range = [];
                const delta = 1;
                for (let i = 1; i <= totalPages; i++) {
                  if (
                    i === 1 ||
                    i === totalPages ||
                    (i >= page - delta && i <= page + delta)
                  ) {
                    range.push(i);
                  }
                }

                const rangeWithDots = [];
                let l;
                for (let i of range) {
                  if (l) {
                    if (i - l === 2) {
                      rangeWithDots.push(l + 1);
                    } else if (i - l !== 1) {
                      rangeWithDots.push("...");
                    }
                  }
                  rangeWithDots.push(i);
                  l = i;
                }

                return rangeWithDots.map((pageNum, idx) => (
                  <PaginationItem key={idx}>
                    {pageNum === "..." ? (
                      <PaginationEllipsis />
                    ) : (
                      <PaginationLink
                        isActive={page === pageNum}
                        onClick={() => setPage(Number(pageNum))}
                        className="cursor-pointer"
                      >
                        {pageNum}
                      </PaginationLink>
                    )}
                  </PaginationItem>
                ));
              })()}

              <PaginationItem>
                <PaginationNext
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className={
                    page === totalPages
                      ? "pointer-events-none opacity-50"
                      : "cursor-pointer"
                  }
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      </div>

      <div className={cn(
        hasChat ? "flex w-full" : "hidden md:flex",
        "flex-1 md:flex md:flex-col bg-background dark:bg-slate-900",
      )}
      >
        {!chatIdFromUrl ? (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
            <div className="w-16 h-16 rounded-2xl bg-white shadow-sm flex items-center justify-center mb-4">
              <MessageSquare className="w-8 h-8 text-slate-300" />
            </div>
            <p className="text-sm font-medium">
              Selecciona un chat para monitorear
            </p>
          </div>
        ) : (
          <>
            {/* Chat Header */}
            <div className="flex items-center justify-between px-6 py-3 bg-card border-b border-border shadow-md ring-1 ring-white/5 sticky top-0 z-20 dark:bg-slate-900 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <Button
                  variant="ghost"
                  size="icon"
                  className="md:hidden"
                  onClick={clearSelectedChat}
                  aria-label="Volver"
                >
                  <ChevronLeft className="w-5 h-5" />
                </Button>
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border"
                  style={{ backgroundColor: colorFromId(chatIdFromUrl) }}
                >
                  VT
                </div>
                <div>
                  <div className="text-sm font-bold text-foreground flex items-center gap-2">
                    {humanizeId(chatIdFromUrl)}
                    <span className="px-1.5 py-0.5 rounded bg-muted text-[10px] font-mono text-muted-foreground font-normal border border-border dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700">
                      {chatIdFromUrl.slice(0, 8)}...
                    </span>
                  </div>
                  <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Sincronización activa
                  </div>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-2"
                onClick={() => navigator.clipboard.writeText(chatIdFromUrl)}
              >
                <Copy className="w-3 h-3" /> ID
              </Button>
            </div>

            {/* Chat Body */}
            <div
              className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6 bg-background/50 dark:bg-slate-900/60"
              ref={scrollRef}
            >
              {loadingHistory && messages.length === 0 ? (
                // Skeletons Chat
                <div className="space-y-6 opacity-50">
                  <div className="flex justify-end">
                    <Skeleton className="h-10 w-2/3 rounded-xl rounded-tr-none" />
                  </div>
                  <div className="flex justify-start">
                    <Skeleton className="h-16 w-3/4 rounded-xl rounded-tl-none" />
                  </div>
                  <div className="flex justify-end">
                    <Skeleton className="h-8 w-1/2 rounded-xl rounded-tr-none" />
                  </div>
                </div>
              ) : messages.length === 0 ? (
                <div className="text-center py-10 text-sm text-muted-foreground italic">
                  Esta conversación no tiene mensajes visibles.
                </div>
              ) : (
                messages.map((m, idx) => {
                  const isUser = m.role === "user";
                  // Adaptador para tu componente Bubble
                  const bubbleData: BubbleMessage = {
                    id: `${idx}`,
                    role: m.role,
                    content: m.content,
                    createdAt: m.timestamp ? new Date(m.timestamp) : undefined,
                  };

                  return (
                    <div
                      key={idx}
                      className={cn(
                        "flex",
                        isUser ? "justify-end" : "justify-start",
                      )}
                    >
                      <div
                        className={cn(
                          "max-w-[85%] md:max-w-[75%]",
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
                        {m.timestamp && (
                          <div
                            className={cn(
                              "text-[10px] text-muted-foreground mt-1 px-1",
                              isUser ? "text-right" : "text-left",
                            )}
                          >
                            {new Date(m.timestamp).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
              {/* Espaciador final */}
              <div className="h-4" />
            </div>

            <div className="px-6 py-3 bg-muted border-t border-border text-center dark:bg-slate-900 dark:border-slate-800">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted text-muted-foreground text-xs font-medium">
                🔒 Modo Supervisión (Solo Lectura)
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function AdminInboxPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-[calc(100vh-64px)] items-center justify-center">
          Cargando buzón...
        </div>
      }
    >
      <AdminInboxContent />
    </Suspense>
  );
}
