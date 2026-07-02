"use client";

import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, XCircle, X } from "lucide-react";

export type BannerSeverity = "warn" | "crit";

export interface BannerAlert {
  severity: BannerSeverity;
  message: string;
}

interface Props {
  alerts: BannerAlert[];
  onDismiss: (message: string) => void;
}

const severityStyle: Record<
  BannerSeverity,
  { container: string; icon: string; label: string }
> = {
  crit: {
    container: "bg-error/[0.08] border-error/30 text-error",
    icon: "text-error",
    label: "INCIDENTE",
  },
  warn: {
    container: "bg-warning/[0.08] border-warning/30 text-warning",
    icon: "text-warning",
    label: "DEGRADADO",
  },
};

function pickHighest(alerts: BannerAlert[]): BannerAlert | null {
  return (
    alerts.find((a) => a.severity === "crit") ??
    alerts.find((a) => a.severity === "warn") ??
    null
  );
}

export function StatusBanner({ alerts, onDismiss }: Props) {
  const top = pickHighest(alerts);
  const others = top ? alerts.length - 1 : 0;
  const style = top ? severityStyle[top.severity] : null;
  const Icon = top?.severity === "crit" ? XCircle : AlertTriangle;

  return (
    <AnimatePresence initial={false}>
      {top && style && (
        <motion.div
          key={top.message}
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
          className="overflow-hidden border-b border-border"
          role="alert"
          aria-live="assertive"
        >
          <div
            className={`flex items-center gap-3 px-6 py-2.5 border-l-2 ${style.container}`}
          >
            <Icon
              className={`h-4 w-4 flex-shrink-0 ${style.icon}`}
              aria-hidden="true"
            />
            <span className="text-[10px] font-bold tracking-[0.14em] uppercase flex-shrink-0">
              {style.label}
            </span>
            <span className="text-[13px] font-medium text-foreground leading-tight">
              {top.message}
            </span>
            {others > 0 && (
              <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-foreground/5 text-muted-foreground flex-shrink-0">
                +{others} {others === 1 ? "incidencia" : "incidencias"}
              </span>
            )}
            <button
              type="button"
              onClick={() => onDismiss(top.message)}
              aria-label="Descartar alerta"
              className="ml-auto opacity-60 hover:opacity-100 transition-opacity flex-shrink-0"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
