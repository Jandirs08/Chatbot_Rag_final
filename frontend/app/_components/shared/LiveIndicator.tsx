"use client";

import { useState, useEffect } from "react";
import { cn } from "@/app/lib/utils";
import { PulseDot } from "@/app/_components/motion/PulseDot";

interface LiveIndicatorProps {
  lastUpdated: Date | null;
  className?: string;
}

export function LiveIndicator({ lastUpdated, className }: LiveIndicatorProps) {
  const [secondsAgo, setSecondsAgo] = useState<number | null>(null);

  useEffect(() => {
    if (!lastUpdated) {
      setSecondsAgo(null);
      return;
    }

    const tick = () => {
      const diff = Math.floor((Date.now() - lastUpdated.getTime()) / 1000);
      setSecondsAgo(diff);
    };

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [lastUpdated]);

  const label =
    secondsAgo === null ? "Actualizando..." : `Actualizado hace ${secondsAgo}s`;

  return (
    <span className={cn("flex items-center gap-1.5", className)}>
      <PulseDot color="success" size={6} />
      <span className="font-mono text-xs text-muted-foreground">{label}</span>
    </span>
  );
}
