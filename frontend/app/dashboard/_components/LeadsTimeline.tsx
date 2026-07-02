"use client";

import { Stagger, StaggerItem } from "@/app/_components/motion/Stagger";
import { fmtDate } from "@/app/lib/format";
import type { LeadItem } from "../types";

const DOT_COLORS = [
  "bg-success border-background",
  "bg-accent-cyan border-background",
  "bg-success/60 border-background",
  "bg-muted-foreground border-background",
];

const MAX_VISIBLE = 4;

interface LeadsTimelineProps {
  leads: LeadItem[];
  total: number;
  onViewAll: () => void;
}

export function LeadsTimeline({ leads, total, onViewAll }: LeadsTimelineProps) {
  const visible = leads.slice(0, MAX_VISIBLE);
  const remaining = total - visible.length;

  return (
    <div>
      <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-semibold mb-3">
        Leads recientes
      </p>

      <div className="relative">
        {/* Timeline line */}
        <div className="absolute left-[7px] top-2 bottom-0 w-px bg-gradient-to-b from-success/50 to-transparent pointer-events-none" />

        <Stagger className="space-y-0">
          {visible.map((lead, idx) => (
            <StaggerItem key={lead.conversation_id}>
              <div className="relative flex gap-3 mb-3">
                {/* Dot */}
                <div
                  className={`mt-1.5 w-3.5 h-3.5 flex-shrink-0 rounded-full border-2 z-10 ${DOT_COLORS[idx % DOT_COLORS.length]}`}
                />
                {/* Card */}
                <div className="flex-1 bg-card/60 rounded-lg border border-border p-2.5 hover:border-primary/25 transition-colors">
                  <p className="text-sm font-semibold leading-tight">
                    {lead.lead_name ?? (
                      <span className="text-muted-foreground italic font-normal text-xs">
                        sin nombre
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {lead.lead_email}
                  </p>
                  <p className="text-[10px] font-mono text-muted-foreground mt-1">
                    {fmtDate(lead.captured_at)}
                  </p>
                </div>
              </div>
            </StaggerItem>
          ))}
        </Stagger>

        {remaining > 0 && (
          <button
            type="button"
            onClick={onViewAll}
            className="text-primary text-xs font-mono ml-6 hover:opacity-80 transition-opacity"
          >
            Ver {remaining} leads más →
          </button>
        )}

        {visible.length === 0 && (
          <p className="text-xs text-muted-foreground ml-6 italic">
            Sin leads capturados aún.
          </p>
        )}
      </div>
    </div>
  );
}
