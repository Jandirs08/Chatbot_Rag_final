import React from "react";

function SkeletonCardImpl() {
  return (
    <div className="w-full animate-pulse rounded-xl border border-border/40 bg-card p-3">
      <div className="flex items-center gap-2">
        <div className="h-8 w-8 flex-none rounded-lg bg-muted/60" />
        <div className="flex-1 space-y-1.5">
          <div className="h-2.5 w-3/4 rounded bg-muted/60" />
          <div className="h-2 w-1/2 rounded bg-muted/40" />
        </div>
        <div className="h-6 w-8 flex-none rounded-md bg-muted/40" />
      </div>
      <div className="mt-2 h-1 w-full rounded-full bg-muted/30" />
      <div className="mt-2 flex gap-1">
        <div className="h-3 w-3 rounded-full bg-muted/50" />
        <div className="h-3 w-14 rounded bg-muted/40" />
      </div>
    </div>
  );
}

export const SkeletonCard = React.memo(SkeletonCardImpl);
