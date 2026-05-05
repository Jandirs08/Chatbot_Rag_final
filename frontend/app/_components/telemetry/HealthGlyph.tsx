"use client";

import React from "react";

export type Severity = "ok" | "warn" | "crit" | "info";

export function HealthGlyph({ severity }: { severity: Severity }) {
  return <span className="t-glyph" data-severity={severity} aria-hidden="true" />;
}

export function HealthLabel({ severity }: { severity: Severity }) {
  const text: Record<Severity, string> = {
    ok: "Saludable",
    warn: "Atención",
    crit: "Crítico",
    info: "Sin datos",
  };
  return (
    <span className="inline-flex items-center gap-2">
      <HealthGlyph severity={severity} />
      <span className="t-mono-sm" data-severity={severity}>
        {text[severity]}
      </span>
    </span>
  );
}
