"use client";

import { AnimatePresence, motion } from "framer-motion";
import { PulseDot } from "@/app/_components/motion";

type AlertSeverity = "ok" | "warn" | "crit" | "info";

interface Alert {
  severity: AlertSeverity;
  message: string;
}

interface Props {
  alerts: Alert[];
  onDismiss: (index: number) => void;
}

const SEVERITY_ORDER: AlertSeverity[] = ["crit", "warn", "info", "ok"];

const severityStyle: Record<
  AlertSeverity,
  {
    container: string;
    dotColor: "error" | "warning" | "cyan" | "success";
    label: string;
  }
> = {
  crit: {
    container: "bg-rose-500/[0.08] border-rose-500/30 text-rose-400",
    dotColor: "error",
    label: "CRÍTICO",
  },
  warn: {
    container: "bg-amber-500/[0.08] border-amber-500/30 text-amber-400",
    dotColor: "warning",
    label: "ALERTA",
  },
  info: {
    container: "bg-cyan-500/[0.08] border-cyan-500/30 text-cyan-400",
    dotColor: "cyan",
    label: "INFO",
  },
  ok: {
    container: "bg-emerald-500/[0.08] border-emerald-500/20 text-emerald-400",
    dotColor: "success",
    label: "OK",
  },
};

function pickHighestSeverity(
  alerts: Alert[],
): { alert: Alert; index: number } | null {
  for (const sev of SEVERITY_ORDER) {
    const idx = alerts.findIndex((a) => a.severity === sev);
    if (idx !== -1) return { alert: alerts[idx], index: idx };
  }
  return null;
}

export function FloatingAlert({ alerts, onDismiss }: Props) {
  const picked = pickHighestSeverity(alerts);

  return (
    <AnimatePresence>
      {picked !== null && (
        <motion.div
          key={picked.alert.message}
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="fixed z-50"
          style={{ top: 58, right: 20 }}
          role="alert"
          aria-live="assertive"
        >
          <div
            className={`flex items-center gap-2 px-4 py-2 rounded-full backdrop-blur-md border text-sm font-medium ${severityStyle[picked.alert.severity].container}`}
            style={{ boxShadow: "0 4px 24px rgba(0,0,0,0.4)" }}
          >
            <PulseDot
              color={severityStyle[picked.alert.severity].dotColor}
              size={7}
            />
            <span className="text-[10px] font-bold mr-1">
              {severityStyle[picked.alert.severity].label}
            </span>
            <span className="text-[13px]">{picked.alert.message}</span>
            <button
              type="button"
              onClick={() => onDismiss(picked.index)}
              aria-label="Cerrar alerta"
              className="ml-2 opacity-60 hover:opacity-100 transition-opacity text-base leading-none"
            >
              ×
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
