"use client";

import { useState } from "react";
import useSWR from "swr";
import { Download, Search } from "lucide-react";
import { API_URL } from "@/app/lib/config";
import { authenticatedJsonFetcher } from "@/app/lib/services/authService";
import { Skeleton } from "@/app/components/ui/skeleton";
import { fmtRelative } from "@/app/lib/format";

interface GapItem {
  query: string;
  frequency: number;
  category: string | null;
  last_seen: string | null;
}

interface GapsResponse {
  items: GapItem[];
  total: number;
}

interface GapReasonsResponse {
  categories: string[];
}

interface KnowledgeGapsSectionProps {
  isAuthorized: boolean;
}

export function KnowledgeGapsSection({
  isAuthorized,
}: KnowledgeGapsSectionProps) {
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const { data, isLoading } = useSWR<GapsResponse>(
    isAuthorized
      ? `${API_URL}/dashboard/knowledge-gaps?window=24h&limit=50`
      : null,
    authenticatedJsonFetcher,
    { refreshInterval: 0 },
  );

  const { data: reasonsData } = useSWR<GapReasonsResponse>(
    isAuthorized ? `${API_URL}/dashboard/gap-reasons` : null,
    authenticatedJsonFetcher,
    { refreshInterval: 0 },
  );

  const categories = reasonsData?.categories ?? [];
  const allItems = data?.items ?? [];

  const filtered = allItems.filter((item) => {
    const matchSearch =
      search === "" || item.query.toLowerCase().includes(search.toLowerCase());
    const matchCategory =
      activeCategory === null || item.category === activeCategory;
    return matchSearch && matchCategory;
  });

  function handleExportCsv() {
    const rows = [
      ["Query", "Frecuencia", "Categoría", "Última vez"],
      ...filtered.map((item) => [
        item.query,
        String(item.frequency),
        item.category ?? "",
        fmtRelative(item.last_seen),
      ]),
    ];
    const csv = rows
      .map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "knowledge-gaps.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      {/* Eyebrow */}
      <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-semibold mb-3">
        Gaps de conocimiento · 24h
      </p>

      {/* Search bar */}
      <div className="bg-card border border-border rounded-lg px-3 py-2 flex gap-2 focus-within:border-violet-500/40 transition-colors mb-3">
        <Search className="h-3.5 w-3.5 text-muted-foreground self-center flex-shrink-0" />
        <input
          type="text"
          aria-label="Buscar preguntas sin respuesta"
          placeholder="Buscar preguntas sin respuesta…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
        />
      </div>

      {/* Category filter pills */}
      {categories.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          <button
            type="button"
            onClick={() => setActiveCategory(null)}
            className={`text-[11px] font-mono px-2 py-0.5 rounded-full border transition-colors ${
              activeCategory === null
                ? "bg-violet-500/15 border-violet-500/40 text-violet-600 dark:text-violet-300"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            Todos
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() =>
                setActiveCategory(cat === activeCategory ? null : cat)
              }
              className={`text-[11px] font-mono px-2 py-0.5 rounded-full border transition-colors ${
                activeCategory === cat
                  ? "bg-violet-500/15 border-violet-500/40 text-violet-600 dark:text-violet-300"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground italic py-4 text-center">
          Sin gaps para los filtros seleccionados.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/60 bg-muted/30">
                <th className="px-3 py-2 text-left text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-semibold">
                  Pregunta
                </th>
                <th className="px-3 py-2 text-left text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-semibold">
                  Frec.
                </th>
                <th className="px-3 py-2 text-left text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-semibold hidden md:table-cell">
                  Categoría
                </th>
                <th className="px-3 py-2 text-left text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-semibold hidden md:table-cell">
                  Última vez
                </th>
                <th className="px-3 py-2 text-left text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-semibold">
                  Acción
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item, idx) => (
                <tr
                  key={`${item.query}-${idx}`}
                  className="border-b border-border/40 hover:bg-primary/[0.03] transition-colors"
                >
                  <td className="px-3 py-2.5 text-foreground/90 max-w-xs truncate">
                    {item.query}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-rose-500/15 border border-rose-500/25 text-rose-400 tabular-nums">
                      {item.frequency}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 hidden md:table-cell">
                    {item.category ? (
                      <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-muted border border-border text-muted-foreground">
                        {item.category}
                      </span>
                    ) : (
                      <span className="text-muted-foreground/50 text-xs">
                        —
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 hidden md:table-cell font-mono text-xs text-muted-foreground">
                    {fmtRelative(item.last_seen)}
                  </td>
                  <td className="px-3 py-2.5">
                    <button
                      type="button"
                      aria-label={`Añadir "${item.query}" al corpus`}
                      className="text-xs font-mono text-violet-400 hover:text-violet-300 transition-colors whitespace-nowrap"
                    >
                      Añadir al corpus →
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Export CSV */}
      {filtered.length > 0 && (
        <div className="flex justify-end mt-3">
          <button
            type="button"
            onClick={handleExportCsv}
            className="inline-flex items-center gap-1.5 text-xs font-mono text-muted-foreground hover:text-foreground border border-border rounded-lg px-2.5 py-1.5 transition-colors"
          >
            <Download className="h-3 w-3" />
            Exportar CSV
          </button>
        </div>
      )}
    </div>
  );
}
