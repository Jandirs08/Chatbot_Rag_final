"use client";

import { HelpTooltip } from "@/app/_components/telemetry";
import { fmtNum, fmtUsd } from "../_utils";
import type { ObservabilityData } from "../_utils";

interface Props {
  tokens: ObservabilityData["tokens"];
}

export function TokensSection({ tokens }: Props) {
  return (
    <section className="t-section-card">
      <div className="flex items-center justify-between gap-2 mb-6">
        <div className="flex items-center gap-2">
          <p className="t-section-title">Tokens</p>
          <HelpTooltip content="Consumo acumulado de LLM tokens. Se reinicia con el servidor." />
        </div>
        <span className="t-mono-sm">se reinicia con el servidor</span>
      </div>
      <div className="flex flex-col sm:flex-row gap-6">
        <div className="flex flex-col gap-1.5 sm:pr-6 sm:border-r" style={{ borderColor: "var(--t-surface-edge)" }}>
          <span className="t-label">Costo aproximado</span>
          <span
            style={{
              fontFamily: "var(--font-telemetry-mono, 'JetBrains Mono', monospace)",
              fontSize: "2.5rem",
              fontWeight: 500,
              letterSpacing: "-0.025em",
              lineHeight: 1,
              color: "var(--t-ink)",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {tokens.pending_token_callback ? "—" : fmtUsd(tokens.estimated_cost_usd)}
          </span>
          {tokens.pending_token_callback && (
            <span className="t-small">esperando primer chat</span>
          )}
        </div>
        <div className="flex gap-8 items-end">
          <div className="flex flex-col gap-1.5">
            <span className="t-label">Tokens entrada</span>
            <span className="t-mono-xl">{fmtNum(tokens.tokens_in)}</span>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="t-label">Tokens salida</span>
            <span className="t-mono-xl">{fmtNum(tokens.tokens_out)}</span>
          </div>
        </div>
      </div>
    </section>
  );
}
