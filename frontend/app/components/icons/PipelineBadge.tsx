"use client";

import React from "react";
import { cn } from "@/lib/utils";

export type PipelineBadgeName =
  | "embed"
  | "dense"
  | "lexical"
  | "hydrate"
  | "rerank"
  | "llm";

const BADGE_SRC: Record<PipelineBadgeName, string> = {
  embed: "/assets/observability/pipeline/obs-stage-embed.svg",
  dense: "/assets/observability/pipeline/obs-stage-dense.svg",
  lexical: "/assets/observability/pipeline/obs-stage-lexical.svg",
  hydrate: "/assets/observability/pipeline/obs-stage-hydrate.svg",
  rerank: "/assets/observability/pipeline/obs-stage-rerank.svg",
  llm: "/assets/observability/pipeline/obs-stage-llm.svg",
};

export function PipelineBadge({
  name,
  className,
}: {
  name: PipelineBadgeName;
  className?: string;
}) {
  const mask = `url("${BADGE_SRC[name]}") center / contain no-repeat`;

  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-current/20 bg-current/10",
        className,
      )}
    >
      <span className="block h-4 w-4 bg-current" style={{ WebkitMask: mask, mask }} />
    </span>
  );
}
