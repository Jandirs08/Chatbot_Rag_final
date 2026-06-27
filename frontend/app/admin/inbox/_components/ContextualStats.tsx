"use client";
import React, { useMemo } from "react";
import { cn } from "@/lib/utils";
import type { InboxConversation } from "./InboxConversationCard";
import type { TabKey } from "./inboxConfig";

interface StatTileProps {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "warn" | "success";
}

function StatTile({ label, value, hint, tone = "default" }: StatTileProps) {
  const valueClass =
    tone === "warn"
      ? "text-warning"
      : tone === "success"
        ? "text-success"
        : "text-foreground";
  return (
    <div className="flex min-w-[140px] flex-1 flex-col justify-center rounded-xl border border-border/60 bg-card px-3.5 py-2.5 transition-all duration-150 hover:border-primary/20 hover:shadow-[0_4px_20px_rgb(79_53_204/0.08)]">
      <span className="font-heading text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground/70">
        {label}
      </span>
      <span
        className={cn(
          "mt-1 font-mono text-lg font-bold leading-tight tabular-nums",
          valueClass,
        )}
      >
        {value}
      </span>
      {hint && (
        <span className="mt-0.5 text-[10px] text-muted-foreground/60">
          {hint}
        </span>
      )}
    </div>
  );
}

interface ContextualStatsProps {
  tab: TabKey;
  conversations: InboxConversation[];
  agentId: string;
}

function ContextualStatsImpl({
  tab,
  conversations,
  agentId,
}: ContextualStatsProps) {
  const tiles = useMemo<StatTileProps[]>(() => {
    if (tab === "todos") {
      const total = conversations.length;
      const scored = conversations.filter((c) => c.lead_score != null);
      const avg =
        scored.length > 0
          ? Math.round(
              scored.reduce((acc, c) => acc + (c.lead_score ?? 0), 0) /
                scored.length,
            )
          : null;
      const withLead = conversations.filter((c) => c.lead_email).length;
      return [
        { label: "Conversaciones", value: String(total) },
        {
          label: "Con datos",
          value: String(withLead),
          hint:
            total > 0
              ? `${Math.round((withLead / total) * 100)}% del total`
              : undefined,
        },
        {
          label: "Score promedio",
          value: avg != null ? String(avg) : "—",
          hint: scored.length > 0 ? `${scored.length} con score` : undefined,
        },
      ];
    }

    if (tab === "pendientes") {
      const pending = conversations.filter((c) => c.mode === "pending");
      const waiting = pending
        .map((c) => c.minutes_waiting)
        .filter((v): v is number => v != null);
      const avg =
        waiting.length > 0
          ? Math.round(waiting.reduce((a, b) => a + b, 0) / waiting.length)
          : null;
      const max = waiting.length > 0 ? Math.max(...waiting) : null;
      return [
        {
          label: "Esperando ahora",
          value: String(pending.length),
          tone: pending.length > 0 ? "warn" : "default",
        },
        { label: "Espera promedio", value: avg != null ? `${avg}m` : "—" },
        {
          label: "Más antiguo",
          value: max != null ? `${max}m` : "—",
          tone: max != null && max >= 10 ? "warn" : "default",
        },
      ];
    }

    if (tab === "mias") {
      const mine = conversations.filter(
        (c) => c.mode === "human" && c.assigned_agent_id === agentId,
      );
      const stale = mine.filter((c) => {
        if (!c.updated_at) return false;
        const ageMin = (Date.now() - new Date(c.updated_at).getTime()) / 60000;
        return ageMin > 5;
      });
      const oldestStaleMin = mine.reduce<number | null>((acc, c) => {
        if (!c.updated_at) return acc;
        const ageMin = Math.floor(
          (Date.now() - new Date(c.updated_at).getTime()) / 60000,
        );
        return acc == null || ageMin > acc ? ageMin : acc;
      }, null);
      return [
        { label: "Tus conversaciones", value: String(mine.length) },
        {
          label: "Sin responder >5m",
          value: String(stale.length),
          tone: stale.length > 0 ? "warn" : "default",
        },
        {
          label: "Más antigua",
          value: oldestStaleMin != null ? `${oldestStaleMin}m` : "—",
          tone:
            oldestStaleMin != null && oldestStaleMin >= 10 ? "warn" : "default",
        },
      ];
    }

    // bot
    const bot = conversations.filter((c) => c.mode === "bot");
    const unclassified = bot.filter(
      (c) => !c.category || c.category === "__null__",
    );
    const productCounts = new Map<string, number>();
    for (const c of bot) {
      for (const p of c.product_interests ?? []) {
        productCounts.set(p, (productCounts.get(p) ?? 0) + 1);
      }
    }
    const entries = Array.from(productCounts.entries());
    const top = entries.sort((a, b) => b[1] - a[1])[0];
    return [
      { label: "Total bot", value: String(bot.length) },
      {
        label: "Sin clasificar",
        value: String(unclassified.length),
        tone: unclassified.length > 0 ? "warn" : "default",
      },
      {
        label: "Producto top",
        value: top ? top[0] : "—",
        hint: top ? `${top[1]} menciones` : undefined,
      },
    ];
  }, [tab, conversations, agentId]);

  return (
    <div
      key={tab}
      className="grid grid-cols-1 gap-2 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1 motion-safe:duration-200 sm:grid-cols-3"
    >
      {tiles.map((t) => (
        <StatTile key={t.label} {...t} />
      ))}
    </div>
  );
}

export const ContextualStats = React.memo(ContextualStatsImpl);
