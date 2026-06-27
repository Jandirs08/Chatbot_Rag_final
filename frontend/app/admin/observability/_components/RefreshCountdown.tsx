"use client";

import { useEffect, useState } from "react";

interface Props {
  intervalMs: number;
  isRefreshing: boolean;
}

export function RefreshCountdown({ intervalMs, isRefreshing }: Props) {
  const totalSeconds = Math.round(intervalMs / 1000);
  const [secondsLeft, setSecondsLeft] = useState(totalSeconds);

  useEffect(() => {
    // Reset countdown whenever a refresh completes
    setSecondsLeft(totalSeconds);
  }, [isRefreshing, totalSeconds]);

  useEffect(() => {
    const id = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) return totalSeconds;
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [totalSeconds]);

  const pct = isRefreshing
    ? 100
    : ((totalSeconds - secondsLeft) / totalSeconds) * 100;

  return (
    <div
      className="flex items-center gap-2"
      aria-label={`Actualización en ${secondsLeft}s`}
    >
      {/* Progress track */}
      <div
        className="rounded-full overflow-hidden"
        style={{ width: 64, height: 2, background: "hsl(var(--muted))" }}
        aria-hidden="true"
      >
        <div
          className="h-full rounded-full"
          style={{
            width: `${pct}%`,
            background: "linear-gradient(to right, #22d3ee, #60a5fa)",
            transition: isRefreshing ? "none" : "width 1s linear",
          }}
        />
      </div>
      <span className="text-[11px] font-mono text-muted-foreground tabular-nums">
        {isRefreshing ? "..." : `Refresh en ${secondsLeft}s`}
      </span>
    </div>
  );
}
