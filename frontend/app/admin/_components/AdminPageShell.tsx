"use client";

import type { ReactNode } from "react";
import { FadeIn } from "@/app/_components/motion";
import { cn } from "@/lib/utils";

type Props = {
  /** Optional non-scrolling header row (hero strip, title bar). */
  header?: ReactNode;
  /**
   * Documented exception: opt out of the shared content-width cap and fill
   * edge-to-edge. Reserve for true workspaces (kanban board, canvas) — NOT a
   * per-view width knob. If a capped view feels too narrow, widen the
   * `--content-max-width` token for everyone instead of setting this.
   */
  bleed?: boolean;
  /** Fill-height body. Children own their own internal overflow. */
  children: ReactNode;
};

/**
 * Full-height admin page shell — the single source of truth for admin page
 * width AND height.
 *
 * Height: `-m-8` cancels the `p-8` from RootLayoutClient's
 * `<main class="overflow-y-auto"> → <div class="w-full h-full p-8">`, and
 * `h-[calc(100%+4rem)]` re-adds it, so the shell fills `main` exactly and the
 * page never scrolls — only the regions children mark as scrollable do.
 *
 * Width: caps at the `--content-max-width` token with a fluid
 * `--content-gutter`, so every view shares one width policy. No view hardcodes
 * `max-w-[…]` / `calc(100vh-…)` / `min-h-[640px]` again — that drift is what
 * caused both the height scrollbars and the inconsistent zoom-out gutters.
 */
export function AdminPageShell({ header, bleed = false, children }: Props) {
  return (
    <FadeIn className="-m-8 flex h-[calc(100%+4rem)] flex-col py-4 md:py-6 px-[var(--content-gutter)]">
      <div
        className={cn(
          "mx-auto flex min-h-0 w-full flex-1 flex-col",
          bleed ? "max-w-none" : "max-w-[var(--content-max-width)]",
        )}
      >
        {header ? <div className="mb-4 flex-none">{header}</div> : null}
        <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      </div>
    </FadeIn>
  );
}
