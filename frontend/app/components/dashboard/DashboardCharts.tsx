"use client";
import React, { useEffect, useState } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { statsService } from "@/app/lib/services/statsService";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";

function formatLabel(dateIso: string, range: "7d" | "30d" | "3m"): string {
  const [year, monthNum, dayNum] = dateIso.split("-").map((v) => parseInt(v, 10));
  const dt = new Date(year, (monthNum || 1) - 1, dayNum || 1);
  const days = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
  const months = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  if (range === "7d") return days[dt.getDay()];
  const day = dt.getDate();
  const monthLabel = months[dt.getMonth()];
  return `${day} ${monthLabel}`;
}

type TooltipProps = {
  active?: boolean;
  payload?: any[];
  label?: string;
  metricLabel: string;
  color: string;
};

function CustomTooltip({ active, payload, label, metricLabel, color }: TooltipProps) {
  if (!active || !payload || !payload.length) return null;
  const value = payload[0]?.value ?? 0;
  return (
    <div className="rounded-xl border border-slate-100 bg-white dark:bg-slate-900 dark:border-slate-800 shadow-lg px-4 py-3">
      <div className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</div>
      <div className="mt-1 flex items-center gap-2">
        <div
          className="w-2.5 h-2.5 rounded-full"
          style={{ backgroundColor: color }}
        />
        <span className="text-lg font-semibold text-slate-900 dark:text-white">
          {value.toLocaleString()}
        </span>
        <span className="text-sm text-slate-500 dark:text-slate-400">
          {metricLabel}
        </span>
      </div>
    </div>
  );
}

export default function DashboardCharts() {
  const [activeTab, setActiveTab] = useState<"consultas" | "usuarios">("consultas");
  const [range, setRange] = useState<"7d" | "30d" | "3m">("7d");
  const [loading, setLoading] = useState<boolean>(false);
  const [data, setData] = useState<{ name: string; consultas: number; usuarios: number }[]>([]);
  const dataKey = activeTab === "consultas" ? "consultas" : "usuarios";

  // Color palette for each metric
  const chartColors = {
    consultas: {
      stroke: "#3b82f6", // blue-500
      fill: "#3b82f6",
    },
    usuarios: {
      stroke: "#8b5cf6", // violet-500
      fill: "#8b5cf6",
    },
  };

  const currentColor = chartColors[activeTab];

  useEffect(() => {
    const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;
    setLoading(true);
    statsService
      .getHistory(days)
      .then((points) => {
        const formatted = points.map((p) => ({
          name: formatLabel(p.date, range),
          consultas: p.messages_count,
          usuarios: p.users_count,
        }));
        setData(formatted);
      })
      .catch(() => {
        setData([]);
      })
      .finally(() => setLoading(false));
  }, [range]);

  return (
    <div className="space-y-6">
      {/* Controls bar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
            Evolución de Métricas
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Visualiza el rendimiento de tu asistente
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Tabs value={activeTab} onValueChange={(v: any) => setActiveTab(v)}>
            <TabsList className="h-9 bg-slate-100 dark:bg-slate-800 p-1">
              <TabsTrigger
                value="consultas"
                className="text-xs px-4 h-7 data-[state=active]:bg-white dark:data-[state=active]:bg-slate-900 data-[state=active]:shadow-sm"
              >
                Consultas
              </TabsTrigger>
              <TabsTrigger
                value="usuarios"
                className="text-xs px-4 h-7 data-[state=active]:bg-white dark:data-[state=active]:bg-slate-900 data-[state=active]:shadow-sm"
              >
                Usuarios
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <Select value={range} onValueChange={(v: any) => setRange(v)}>
            <SelectTrigger className="w-40 h-9 text-sm bg-white dark:bg-slate-900" aria-label="Rango de tiempo">
              <SelectValue placeholder="Últimos 7 días" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">Últimos 7 días</SelectItem>
              <SelectItem value="30d">Últimos 30 días</SelectItem>
              <SelectItem value="3m">Últimos 3 meses</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Chart */}
      <div className="h-[320px] w-full">
        {loading ? (
          <Skeleton className="w-full h-full rounded-xl" />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={data}
              key={`${activeTab}-${range}`}
              margin={{ top: 20, right: 20, left: 0, bottom: 10 }}
            >
              <defs>
                <linearGradient id={`gradient-${activeTab}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={currentColor.fill} stopOpacity={0.3} />
                  <stop offset="50%" stopColor={currentColor.fill} stopOpacity={0.1} />
                  <stop offset="100%" stopColor={currentColor.fill} stopOpacity={0} />
                </linearGradient>
              </defs>

              {/* Clean X Axis */}
              <XAxis
                dataKey="name"
                tick={{ fill: "#94a3b8", fontSize: 12 }}
                axisLine={false}
                tickLine={false}
                minTickGap={20}
                tickMargin={12}
                interval="preserveStartEnd"
              />

              {/* Clean Y Axis */}
              <YAxis
                tick={{ fill: "#94a3b8", fontSize: 12 }}
                axisLine={false}
                tickLine={false}
                width={40}
                tickFormatter={(value) => value >= 1000 ? `${(value / 1000).toFixed(0)}k` : value}
              />

              {/* Custom Tooltip */}
              <Tooltip
                content={(props: any) => (
                  <CustomTooltip
                    {...props}
                    metricLabel={activeTab === "consultas" ? "consultas" : "usuarios"}
                    color={currentColor.stroke}
                  />
                )}
                cursor={{ stroke: currentColor.stroke, strokeWidth: 1, strokeDasharray: "4 4", strokeOpacity: 0.3 }}
              />

              {/* Area with smooth curve */}
              <Area
                type="monotone"
                dataKey={dataKey}
                stroke={currentColor.stroke}
                fill={`url(#gradient-${activeTab})`}
                strokeWidth={2.5}
                dot={false}
                activeDot={{
                  r: 6,
                  strokeWidth: 3,
                  fill: "white",
                  stroke: currentColor.stroke,
                  className: "drop-shadow-md"
                }}
                isAnimationActive
                animationDuration={500}
                animationEasing="ease-out"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
