"use client";

import { useId } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
import { TrendingUp } from "lucide-react";
import { Skeleton } from "@/app/components/ui/skeleton";
import { fmtDateShort } from "@/app/lib/format";
import type { HistoryItem } from "../types";

type Window = "7d" | "30d" | "90d";

const WINDOWS: Window[] = ["7d", "30d", "90d"];

interface TooltipPayloadItem {
  color: string;
  name: string;
  value: number;
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-lg p-2 text-xs">
      <p className="mb-1 font-mono text-muted-foreground">{label}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2 font-mono">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ background: p.color }}
          />
          <span className="text-muted-foreground">{p.name}:</span>
          <span className="text-foreground tabular-nums">{p.value}</span>
        </div>
      ))}
    </div>
  );
}

interface ActivityChartProps {
  data: HistoryItem[] | undefined;
  loading: boolean;
  error: boolean;
  window: Window;
  onWindowChange: (w: Window) => void;
}

export function ActivityChart({
  data,
  loading,
  error,
  window,
  onWindowChange,
}: ActivityChartProps) {
  const rawIdMensajes = useId();
  const rawIdUsuarios = useId();
  const gradMensajes = `grad-mensajes-${rawIdMensajes.replace(/:/g, "")}`;
  const gradUsuarios = `grad-usuarios-${rawIdUsuarios.replace(/:/g, "")}`;

  const chartData = (data ?? []).map((d) => ({
    date: fmtDateShort(d.date),
    Mensajes: d.messages_count,
    Usuarios: d.users_count,
  }));

  return (
    <div>
      {/* Time window pills */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-semibold">
          Tendencia de actividad
        </p>
        <div className="flex items-center gap-1 p-1 rounded-lg bg-muted/50 border border-border">
          {WINDOWS.map((w) => (
            <button
              key={w}
              type="button"
              aria-pressed={window === w}
              onClick={() => onWindowChange(w)}
              className={`text-[11px] font-mono px-2.5 py-1 rounded-md tabular-nums transition-all duration-200 ${
                window === w
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {w}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <Skeleton className="h-40 w-full" />
      ) : error ? (
        <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">
          <TrendingUp className="h-4 w-4 mr-2 opacity-50" />
          No se pudo cargar la actividad.
        </div>
      ) : chartData.length === 0 ? (
        <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">
          <TrendingUp className="h-4 w-4 mr-2 opacity-50" />
          Sin datos para el período
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={160}>
          <AreaChart
            data={chartData}
            margin={{ top: 4, right: 4, left: -16, bottom: 0 }}
          >
            <defs>
              <linearGradient id={gradMensajes} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#6366f1" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
              </linearGradient>
              <linearGradient id={gradUsuarios} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.2} />
                <stop offset="100%" stopColor="#22d3ee" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
            />
            <Tooltip
              content={<ChartTooltip />}
              cursor={{ stroke: "hsl(var(--border))", strokeWidth: 1 }}
            />
            <Area
              type="monotone"
              dataKey="Mensajes"
              stroke="#6366f1"
              fill={`url(#${gradMensajes})`}
              strokeWidth={1.75}
              dot={false}
              activeDot={{ r: 3, strokeWidth: 0 }}
              animationDuration={700}
            />
            <Area
              type="monotone"
              dataKey="Usuarios"
              stroke="#22d3ee"
              strokeDasharray="4 3"
              fill={`url(#${gradUsuarios})`}
              strokeWidth={1.5}
              dot={false}
              activeDot={{ r: 3, strokeWidth: 0 }}
              animationDuration={700}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
