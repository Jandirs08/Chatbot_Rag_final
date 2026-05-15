"use client";

import React, { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  Search,
  X as XIcon,
} from "lucide-react";
import { API_URL } from "@/app/lib/config";
import { authenticatedJsonFetcher } from "@/app/lib/services/authService";
import { type Severity } from "@/app/_components/telemetry";

type Window = "24h" | "7d" | "30d";
const WINDOW_OPTIONS: Window[] = ["24h", "7d", "30d"];
const ROWS_PER_PAGE = 25;

interface GapReasonMeta {
  reason: string;
  label: string;
  severity: Severity;
}
interface GapReasonsResponse {
  items: GapReasonMeta[];
}
interface KnowledgeGapItem {
  query: string;
  gating_reason: string;
  top_score: number | null;
  chunk_count: number;
  conversation_id: string;
  logged_at: string;
}
interface GapReasonCount {
  reason: string;
  count: number;
}
interface KnowledgeGapsResponse {
  window: string;
  total: number;
  by_reason: GapReasonCount[];
  items: KnowledgeGapItem[];
}

interface AggregatedGap {
  query: string;
  occurrences: number;
  latest: KnowledgeGapItem;
  bucket: BucketKey;
}

type BucketKey = "urgent" | "review" | "noise";
type BucketFilter = BucketKey | "all";

const BUCKET_FOR_SEVERITY: Record<Severity, BucketKey> = {
  crit: "urgent",
  warn: "review",
  info: "noise",
  ok: "noise",
};

const BUCKET_ORDER: BucketKey[] = ["urgent", "review", "noise"];
const FILTER_ORDER: BucketFilter[] = ["all", "urgent", "review", "noise"];

interface BucketMeta {
  label: string;
  action: string;
  /** Solid accent — used for active tab fill, marker dots, chip text. */
  accent: string;
  /** Tint used for chip backgrounds + hovered row tint. */
  accentSoft: string;
  /** Even softer, used as a hover/idle layer on inactive tab. */
  accentFaint: string;
  /** Foreground color when the accent is the background (active state). */
  accentInk: string;
  emptyHint: string;
}

// Ink colors for active state — chosen for WCAG-passing contrast against
// each accent. Red/teal (dark-ish accents) pair with near-white; yellow
// (bright) and gray (mid) pair with petroleum-dark. Tinted slightly toward
// the brand hue per the "no pure #fff/#000" rule in DESIGN.md.
const INK_LIGHT = "hsl(210 20% 98%)";
const INK_DARK = "hsl(218 32% 10%)";

const BUCKET_META: Record<BucketKey, BucketMeta> = {
  urgent: {
    label: "Agregar",
    action: "El bot no tiene esta información. Súbela al material del chatbot.",
    accent: "var(--t-signal-deep)",
    accentSoft: "color-mix(in oklab, var(--t-signal-deep) 18%, transparent)",
    accentFaint: "color-mix(in oklab, var(--t-signal-deep) 8%, transparent)",
    accentInk: INK_LIGHT,
    emptyHint: "Sin temas por agregar en esta ventana.",
  },
  review: {
    label: "Revisar",
    action: "La información existe pero el bot no la encuentra. Revisa el documento.",
    accent: "var(--t-signal)",
    accentSoft: "color-mix(in oklab, var(--t-signal) 18%, transparent)",
    accentFaint: "color-mix(in oklab, var(--t-signal) 8%, transparent)",
    accentInk: INK_DARK,
    emptyHint: "Sin documentos por revisar en esta ventana.",
  },
  noise: {
    label: "Fuera de tema",
    action: "Preguntas que no son de tu negocio. Puedes ignorarlas.",
    accent: "var(--t-ink-soft)",
    accentSoft: "color-mix(in oklab, var(--t-ink-soft) 18%, transparent)",
    accentFaint: "color-mix(in oklab, var(--t-ink-soft) 10%, transparent)",
    accentInk: INK_DARK,
    emptyHint: "Sin preguntas fuera de tema en esta ventana.",
  },
};

const ALL_META = {
  label: "Todas",
  action: "Todo lo que el bot no pudo responder en la ventana seleccionada.",
  accent: "var(--t-data)",
  accentSoft: "color-mix(in oklab, var(--t-data) 18%, transparent)",
  accentFaint: "color-mix(in oklab, var(--t-data) 8%, transparent)",
  accentInk: INK_LIGHT,
};

function fmtRelativeShort(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  const diffMs = Math.max(0, Date.now() - d.getTime());
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  return `${Math.floor(hr / 24)}d`;
}

function normalizeForDedupe(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

function aggregate(items: KnowledgeGapItem[], reasonMap: Record<string, GapReasonMeta>): AggregatedGap[] {
  const map = new Map<string, AggregatedGap>();
  for (const it of items) {
    const key = normalizeForDedupe(it.query);
    const sev: Severity = reasonMap[it.gating_reason]?.severity ?? "info";
    const bucket = BUCKET_FOR_SEVERITY[sev] ?? "noise";
    const existing = map.get(key);
    if (existing) {
      existing.occurrences += 1;
      if (new Date(it.logged_at) > new Date(existing.latest.logged_at)) {
        existing.latest = it;
        existing.bucket = bucket;
      }
    } else {
      map.set(key, { query: it.query, occurrences: 1, latest: it, bucket });
    }
  }
  return Array.from(map.values()).sort((a, b) => {
    const bucketRank = (b_: BucketKey) => BUCKET_ORDER.indexOf(b_);
    if (a.bucket !== b.bucket) return bucketRank(a.bucket) - bucketRank(b.bucket);
    if (b.occurrences !== a.occurrences) return b.occurrences - a.occurrences;
    return new Date(b.latest.logged_at).getTime() - new Date(a.latest.logged_at).getTime();
  });
}

function toCSV(rows: AggregatedGap[], reasonMap: Record<string, GapReasonMeta>): string {
  const header = ["query", "veces", "categoria", "razon", "ultima_vez", "conversation_id"];
  const escape = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = rows.map((r) => {
    const reason = reasonMap[r.latest.gating_reason]?.label ?? r.latest.gating_reason;
    return [
      r.query,
      r.occurrences,
      BUCKET_META[r.bucket].label,
      reason,
      r.latest.logged_at,
      r.latest.conversation_id,
    ]
      .map(escape)
      .join(",");
  });
  return [header.join(","), ...lines].join("\n");
}

function downloadCSV(rows: AggregatedGap[], reasonMap: Record<string, GapReasonMeta>, win: string) {
  const blob = new Blob([toCSV(rows, reasonMap)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `vacios-conocimiento-${win}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─── Component ───────────────────────────────────────────────────────────────

export function KnowledgeGapsTab({ isAuthorized }: { isAuthorized: boolean }) {
  const [win, setWin] = useState<Window>("7d");
  const [search, setSearch] = useState<string>("");
  const [bucketFilter, setBucketFilter] = useState<BucketFilter>("all");
  const [page, setPage] = useState<number>(1);

  const url = isAuthorized
    ? `${API_URL}/dashboard/knowledge-gaps?window=${win}&limit=500`
    : null;
  const { data, isLoading, error } = useSWR<KnowledgeGapsResponse>(
    url,
    authenticatedJsonFetcher,
    { refreshInterval: 60000 },
  );

  const { data: reasonsData } = useSWR<GapReasonsResponse>(
    isAuthorized ? `${API_URL}/dashboard/gap-reasons` : null,
    authenticatedJsonFetcher,
    { revalidateOnFocus: false, dedupingInterval: 5 * 60 * 1000 },
  );

  const reasonMap = useMemo(() => {
    const m: Record<string, GapReasonMeta> = {};
    for (const r of reasonsData?.items ?? []) m[r.reason] = r;
    return m;
  }, [reasonsData]);

  const allAggregated = useMemo(() => {
    if (!data) return [] as AggregatedGap[];
    return aggregate(data.items, reasonMap);
  }, [data, reasonMap]);

  const bucketCounts = useMemo(() => {
    const c: Record<BucketKey, number> = { urgent: 0, review: 0, noise: 0 };
    for (const r of allAggregated) c[r.bucket] += 1;
    return c;
  }, [allAggregated]);

  const visibleRows = useMemo(() => {
    let rows = allAggregated;
    if (bucketFilter !== "all") rows = rows.filter((r) => r.bucket === bucketFilter);
    const q = search.trim().toLowerCase();
    if (q) rows = rows.filter((r) => r.query.toLowerCase().includes(q));
    return rows;
  }, [allAggregated, bucketFilter, search]);

  useEffect(() => {
    setPage(1);
  }, [bucketFilter, search, win]);

  const totalPages = Math.max(1, Math.ceil(visibleRows.length / ROWS_PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const pageStart = (safePage - 1) * ROWS_PER_PAGE;
  const pageRows = visibleRows.slice(pageStart, pageStart + ROWS_PER_PAGE);

  if (!isAuthorized) return null;

  const isEmptyAll = !!data && data.total === 0;
  const activeMeta = bucketFilter === "all" ? null : BUCKET_META[bucketFilter];

  return (
    <div className="t-gaps">
      {/* ── Title block + window selector ─────────────────────────────── */}
      <header className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between mb-8">
        <div className="min-w-0">
          <h2 className="t-heading">Vacíos de conocimiento</h2>
          <p
            className="t-body mt-2 max-w-2xl"
            style={{ color: "var(--t-ink-mid)" }}
          >
            Lo que le preguntaron al bot y no pudo responder. Agrupado por la
            acción que toca tomar.
          </p>
        </div>

        <div
          role="tablist"
          aria-label="Ventana temporal"
          className="t-window-group flex items-center gap-0 shrink-0 rounded-md p-1"
          style={{
            background: "var(--t-surface)",
            border: "1px solid var(--t-surface-edge)",
          }}
        >
          {WINDOW_OPTIONS.map((w) => {
            const active = win === w;
            return (
              <button
                key={w}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setWin(w)}
                className="t-mono-sm rounded-sm transition-all"
                style={{
                  padding: "5px 12px",
                  background: active ? "var(--t-data)" : "transparent",
                  color: active ? INK_LIGHT : "var(--t-ink-mid)",
                  fontWeight: active ? 600 : 500,
                }}
              >
                {w}
              </button>
            );
          })}
        </div>
      </header>

      {/* ── Search bar (TOP — primary action) ─────────────────────────── */}
      <div className="flex items-stretch gap-3 mb-6">
        <label
          className="t-search flex flex-1 items-center gap-3 rounded-md border px-4 transition-all"
          style={{
            borderColor: "var(--t-surface-edge)",
            background: "var(--t-surface)",
            minHeight: 44,
          }}
        >
          <Search
            className="h-4 w-4 shrink-0"
            style={{ color: "var(--t-ink-mute)" }}
            aria-hidden
          />
          <input
            type="text"
            placeholder="Buscar consultas que el bot no pudo responder"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 bg-transparent outline-none placeholder:opacity-60 t-body"
            style={{ color: "var(--t-ink)" }}
            aria-label="Filtrar consultas"
          />
          {search ? (
            <button
              type="button"
              onClick={() => setSearch("")}
              aria-label="Limpiar búsqueda"
              className="rounded-sm p-1 transition-colors hover:bg-[var(--t-surface-deep)]"
              style={{ color: "var(--t-ink-mute)" }}
            >
              <XIcon className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </label>

        <button
          type="button"
          onClick={() => data && downloadCSV(visibleRows, reasonMap, win)}
          disabled={!data || visibleRows.length === 0}
          className="t-mono-sm inline-flex items-center gap-2 rounded-md border px-4 transition-colors hover:bg-[var(--t-surface-deep)] disabled:opacity-30 disabled:hover:bg-transparent"
          style={{
            borderColor: "var(--t-surface-edge)",
            background: "var(--t-surface)",
            color: "var(--t-ink)",
            minHeight: 44,
          }}
          aria-label="Exportar lista a CSV"
        >
          <Download className="h-4 w-4" aria-hidden />
          <span>Exportar</span>
        </button>
      </div>

      {/* ── Bucket pills (colored, wrap, no overflow scroll) ──────────── */}
      <div
        role="group"
        aria-label="Filtrar por categoría"
        className="flex flex-wrap gap-2 mb-6"
      >
        {FILTER_ORDER.map((key) => {
          const active = bucketFilter === key;
          const isAll = key === "all";
          const meta = isAll ? ALL_META : BUCKET_META[key as BucketKey];
          const count = isAll ? allAggregated.length : bucketCounts[key as BucketKey];
          return (
            <BucketPill
              key={key}
              active={active}
              isAll={isAll}
              label={meta.label}
              count={count}
              accent={meta.accent}
              accentSoft={meta.accentSoft}
              accentFaint={meta.accentFaint}
              accentInk={meta.accentInk}
              onClick={() => setBucketFilter(key)}
            />
          );
        })}
      </div>

      {/* ── Action banner (contextual, single-bucket only) ────────────── */}
      {activeMeta ? (
        <div
          role="status"
          className="t-action-banner flex items-start gap-3 rounded-md px-4 py-3 mb-6"
          style={{
            background: activeMeta.accentFaint,
            border: `1px solid ${activeMeta.accentSoft}`,
          }}
        >
          <span
            aria-hidden
            className="t-bucket-marker mt-1.5"
            style={{ background: activeMeta.accent, boxShadow: `0 0 0 3px ${activeMeta.accentFaint}` }}
          />
          <p className="t-body" style={{ color: "var(--t-ink)" }}>
            {activeMeta.action}
          </p>
        </div>
      ) : null}

      {/* ── States ───────────────────────────────────────────────────── */}
      {error ? <ErrorState /> : null}
      {isLoading && !data ? <LoadingState /> : null}
      {isEmptyAll && !search ? <AllResolvedState window={win} /> : null}

      {/* ── List (paginated, contained) ──────────────────────────────── */}
      {data && !isEmptyAll ? (
        visibleRows.length === 0 ? (
          <EmptyFilterState
            bucketFilter={bucketFilter}
            search={search}
            onClearSearch={() => setSearch("")}
          />
        ) : (
          <div
            className="t-gap-card rounded-md overflow-hidden"
            style={{
              border: "1px solid var(--t-surface-edge)",
              background: "var(--t-surface)",
            }}
          >
            <ul role="list" className="t-gap-list">
              {pageRows.map((row) => (
                <GapRow
                  key={normalizeForDedupe(row.query) + "|" + row.bucket}
                  row={row}
                  reasonMap={reasonMap}
                  showBucketChip={bucketFilter === "all"}
                />
              ))}
            </ul>

            {totalPages > 1 ? (
              <Pagination
                page={safePage}
                totalPages={totalPages}
                totalRows={visibleRows.length}
                pageStart={pageStart}
                pageEnd={Math.min(pageStart + ROWS_PER_PAGE, visibleRows.length)}
                onPrev={() => setPage((p) => Math.max(1, p - 1))}
                onNext={() => setPage((p) => Math.min(totalPages, p + 1))}
              />
            ) : null}
          </div>
        )
      ) : null}
    </div>
  );
}

// ─── Bucket pill ─────────────────────────────────────────────────────────────

function BucketPill({
  active,
  isAll,
  label,
  count,
  accent,
  accentSoft,
  accentFaint,
  accentInk,
  onClick,
}: {
  active: boolean;
  isAll: boolean;
  label: string;
  count: number;
  accent: string;
  accentSoft: string;
  accentFaint: string;
  accentInk: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      data-active={active ? "true" : "false"}
      className="t-bucket-pill group inline-flex items-center gap-2.5 rounded-md transition-all"
      style={{
        padding: "9px 14px",
        background: active ? accent : accentFaint,
        border: `1px solid ${active ? accent : accentSoft}`,
        color: active ? accentInk : accent,
        fontWeight: active ? 600 : 500,
        // Stash the inactive hover bg as a CSS var so the stylesheet can
        // reach into it without a JS hover handler.
        // (See telemetry.css → .t-bucket-pill[data-active="false"]:hover)
        ["--t-pill-hover-bg" as string]: accentSoft,
      }}
    >
      {!isAll ? (
        <span
          aria-hidden
          className="t-bucket-marker"
          style={{
            background: active ? accentInk : accent,
            opacity: active ? 0.9 : 1,
          }}
        />
      ) : null}
      <span className="t-body" style={{ fontSize: "0.875rem", fontWeight: active ? 600 : 500 }}>
        {label}
      </span>
      <span
        className="t-mono-sm tabular-nums rounded-sm px-1.5 py-0.5"
        style={{
          background: active
            ? "color-mix(in oklab, var(--t-canvas) 18%, transparent)"
            : accentSoft,
          color: active ? accentInk : accent,
          minWidth: "2ch",
          textAlign: "center",
          fontWeight: 600,
        }}
      >
        {count}
      </span>
    </button>
  );
}

// ─── Gap row ─────────────────────────────────────────────────────────────────

function GapRow({
  row,
  reasonMap,
  showBucketChip,
}: {
  row: AggregatedGap;
  reasonMap: Record<string, GapReasonMeta>;
  showBucketChip: boolean;
}) {
  const meta = BUCKET_META[row.bucket];
  const reasonLabel = reasonMap[row.latest.gating_reason]?.label ?? row.latest.gating_reason;
  // In single-bucket view show the specific reason (granular detail beyond
  // the bucket dot). In "Todas" view, drop the bucket-label chip — the dot
  // already carries the same categorical signal, and the chip would just
  // restate it. Color-blind users still get the bucket name via row title.
  const chipText = showBucketChip ? null : reasonLabel;
  const scoreNote = row.latest.top_score != null ? ` · relevancia ${row.latest.top_score.toFixed(2)}` : "";
  const ariaLabel = showBucketChip
    ? `${row.query}. Categoría ${meta.label}.${scoreNote}`
    : row.query;
  return (
    <li>
      <a
        href={`/admin/inbox?conv=${encodeURIComponent(row.latest.conversation_id)}`}
        className="t-gap-row group flex items-center gap-4 px-4 py-3 transition-colors"
        title={`Abrir conversación${scoreNote}`}
        aria-label={ariaLabel}
      >
        <span
          aria-hidden
          className="t-bucket-marker"
          style={{ background: meta.accent }}
        />
        <span
          className="flex-1 truncate t-body"
          style={{ color: "var(--t-ink)" }}
        >
          {row.query}
        </span>

        {row.occurrences > 1 ? (
          <span
            className="t-mono-sm tabular-nums shrink-0"
            style={{ color: "var(--t-ink-mute)" }}
            aria-label={`Preguntada ${row.occurrences} veces`}
            title={`Preguntada ${row.occurrences} veces`}
          >
            × {row.occurrences}
          </span>
        ) : null}

        {chipText ? (
          <span
            className="t-mono-sm shrink-0 rounded-sm px-2 py-0.5 whitespace-nowrap"
            style={{
              background: meta.accentSoft,
              color: meta.accent,
            }}
          >
            {chipText}
          </span>
        ) : null}

        <span
          className="t-mono-sm shrink-0 tabular-nums text-right"
          style={{ color: "var(--t-ink-soft)", minWidth: "2.5rem" }}
        >
          {fmtRelativeShort(row.latest.logged_at)}
        </span>

        <ExternalLink
          aria-hidden
          className="h-3.5 w-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
          style={{ color: meta.accent }}
        />
      </a>
    </li>
  );
}

// ─── Pagination ──────────────────────────────────────────────────────────────

function Pagination({
  page,
  totalPages,
  totalRows,
  pageStart,
  pageEnd,
  onPrev,
  onNext,
}: {
  page: number;
  totalPages: number;
  totalRows: number;
  pageStart: number;
  pageEnd: number;
  onPrev: () => void;
  onNext: () => void;
}) {
  const atStart = page <= 1;
  const atEnd = page >= totalPages;
  return (
    <div
      className="flex items-center justify-between gap-4 px-4 py-3"
      style={{
        borderTop: "1px solid var(--t-surface-edge)",
        background: "var(--t-surface-deep)",
      }}
    >
      <span
        className="t-mono-sm tabular-nums"
        style={{ color: "var(--t-ink-mid)" }}
        aria-live="polite"
      >
        {totalRows === 0
          ? "0 resultados"
          : `${pageStart + 1}–${pageEnd} de ${totalRows}`}
      </span>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onPrev}
          disabled={atStart}
          aria-label="Página anterior"
          className="inline-flex items-center justify-center rounded-sm border transition-colors hover:bg-[var(--t-surface)] disabled:opacity-30 disabled:hover:bg-transparent"
          style={{
            borderColor: atStart ? "var(--t-surface-edge)" : "var(--t-data)",
            color: atStart ? "var(--t-ink-mid)" : "var(--t-data)",
            background: "var(--t-canvas)",
            width: 32,
            height: 32,
          }}
        >
          <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
        </button>

        <span
          className="t-mono-sm tabular-nums"
          style={{ color: "var(--t-ink)", minWidth: "7ch", textAlign: "center" }}
        >
          {page} <span style={{ color: "var(--t-ink-mute)" }}>de</span> {totalPages}
        </span>

        <button
          type="button"
          onClick={onNext}
          disabled={atEnd}
          aria-label="Página siguiente"
          className="inline-flex items-center justify-center rounded-sm border transition-colors hover:bg-[var(--t-surface)] disabled:opacity-30 disabled:hover:bg-transparent"
          style={{
            borderColor: atEnd ? "var(--t-surface-edge)" : "var(--t-data)",
            color: atEnd ? "var(--t-ink-mid)" : "var(--t-data)",
            background: "var(--t-canvas)",
            width: 32,
            height: 32,
          }}
        >
          <ChevronRight className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>
    </div>
  );
}

// ─── States ──────────────────────────────────────────────────────────────────

function EmptyFilterState({
  bucketFilter,
  search,
  onClearSearch,
}: {
  bucketFilter: BucketFilter;
  search: string;
  onClearSearch: () => void;
}) {
  if (search) {
    return (
      <div
        className="flex items-center gap-3 rounded-md px-5 py-10"
        style={{
          background: "var(--t-surface)",
          border: "1px solid var(--t-surface-edge)",
        }}
      >
        <p className="t-body" style={{ color: "var(--t-ink-mid)" }}>
          Ninguna consulta coincide con tu búsqueda.
        </p>
        <button
          type="button"
          onClick={onClearSearch}
          className="t-mono-sm underline-offset-2 hover:underline"
          style={{ color: "var(--t-data)" }}
        >
          Limpiar filtro
        </button>
      </div>
    );
  }
  const hint =
    bucketFilter === "all"
      ? "Sin consultas en esta ventana."
      : BUCKET_META[bucketFilter as BucketKey].emptyHint;
  return (
    <div
      className="flex items-center gap-4 rounded-md px-5 py-8"
      style={{
        background: "color-mix(in oklab, var(--t-data) 6%, var(--t-surface))",
        border: "1px solid color-mix(in oklab, var(--t-data) 25%, var(--t-surface-edge))",
      }}
    >
      <span
        aria-hidden
        className="t-mono shrink-0 inline-flex items-center justify-center rounded-full"
        style={{
          fontSize: "1.25rem",
          color: "var(--t-canvas)",
          background: "var(--t-data)",
          width: 36,
          height: 36,
          lineHeight: 1,
        }}
      >
        ✓
      </span>
      <p className="t-body" style={{ color: "var(--t-ink)" }}>
        {hint}
      </p>
    </div>
  );
}

function AllResolvedState({ window }: { window: string }) {
  return (
    <div
      className="flex items-center gap-5 rounded-md px-6 py-8"
      style={{
        background: "color-mix(in oklab, var(--t-data) 8%, var(--t-surface))",
        border: "1px solid color-mix(in oklab, var(--t-data) 30%, var(--t-surface-edge))",
      }}
    >
      <span
        aria-hidden
        className="inline-flex items-center justify-center rounded-full shrink-0"
        style={{
          fontSize: "1.5rem",
          color: "var(--t-canvas)",
          background: "var(--t-data)",
          width: 48,
          height: 48,
          lineHeight: 1,
        }}
      >
        ✓
      </span>
      <div>
        <p className="t-heading" style={{ color: "var(--t-ink)" }}>
          Sin vacíos en los últimos {window}.
        </p>
        <p className="t-small mt-1" style={{ color: "var(--t-ink-mid)" }}>
          Todo lo que preguntaron tus usuarios, el bot lo pudo responder con la
          información cargada.
        </p>
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="space-y-2" aria-busy="true" aria-live="polite">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="h-12 w-full rounded-md t-skeleton"
          style={{ background: "var(--t-surface-deep)" }}
        />
      ))}
    </div>
  );
}

function ErrorState() {
  return (
    <div
      className="flex items-start gap-3 rounded-md px-4 py-3"
      style={{
        border: "1px solid color-mix(in oklab, var(--t-signal-deep) 35%, var(--t-surface-edge))",
        background: "color-mix(in oklab, var(--t-signal-deep) 8%, transparent)",
      }}
      role="alert"
    >
      <span
        className="t-label shrink-0"
        style={{ color: "var(--t-signal-deep)", paddingTop: "1px" }}
      >
        Error
      </span>
      <p className="t-small" style={{ color: "var(--t-ink-mid)" }}>
        No se pudieron cargar los vacíos. Refresca la página o inténtalo de nuevo
        en unos segundos.
      </p>
    </div>
  );
}
