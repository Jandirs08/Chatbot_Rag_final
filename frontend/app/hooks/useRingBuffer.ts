"use client";

import { useEffect, useRef, useState } from "react";

interface Sample {
  t: number;
  v: number | null;
}

interface Options {
  capacity?: number;
  storageKey?: string;
}

/**
 * Append-only ring buffer of numeric samples with optional localStorage persist.
 * Push a new value when fresh data arrives. Reads return current snapshot copy.
 */
export function useRingBuffer(value: number | null | undefined, opts: Options = {}) {
  const { capacity = 60, storageKey } = opts;
  const [samples, setSamples] = useState<Sample[]>(() => {
    if (!storageKey || typeof window === "undefined") return [];
    try {
      const raw = window.localStorage.getItem(`obs:buffer:${storageKey}`);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as Sample[];
      return Array.isArray(parsed) ? parsed.slice(-capacity) : [];
    } catch {
      return [];
    }
  });

  const lastPushRef = useRef<number>(0);

  useEffect(() => {
    if (value == null || !Number.isFinite(value)) return;
    const now = Date.now();
    if (now - lastPushRef.current < 1000) return; // dedupe rapid updates
    lastPushRef.current = now;

    setSamples((prev) => {
      const next = [...prev, { t: now, v: value }].slice(-capacity);
      if (storageKey && typeof window !== "undefined") {
        try {
          window.localStorage.setItem(`obs:buffer:${storageKey}`, JSON.stringify(next));
        } catch {
          /* quota exceeded — ignore */
        }
      }
      return next;
    });
  }, [value, capacity, storageKey]);

  return samples;
}

export type { Sample };
