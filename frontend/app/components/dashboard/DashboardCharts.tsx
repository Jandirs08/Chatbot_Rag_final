"use client";
import React, { useEffect, useMemo, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
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
  CartesianGrid,
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
};

function CustomTooltip({ active, payload, label, metricLabel }: TooltipProps) {
  if (!active || !payload || !payload.length) return null;
  const value = payload[0]?.value ?? 0;
  return (
    <div className="rounded-md border bg-white dark:bg-slate-900 shadow-sm px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-medium text-foreground dark:text-white">
        {metricLabel}: {value}
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
    <Card className="border-0 shadow-md">
      <CardHeader className="flex flex-wrap md:flex-nowrap items-start md:items-center justify-between gap-x-4 gap-y-2">
        <CardTitle className="text-xl">Evolución de métricas</CardTitle>
        <div className="flex items-center gap-2 flex-wrap md:flex-nowrap w-full md:w-auto">
          <div className="w-44">
            <Select value={range} onValueChange={(v: any) => setRange(v)}>
              <SelectTrigger aria-label="Rango de tiempo">
                <SelectValue placeholder="Últimos 7 días" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7d">Últimos 7 días</SelectItem>
                <SelectItem value="30d">Últimos 30 días</SelectItem>
                <SelectItem value="3m">Últimos 3 meses</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Tabs value={activeTab} onValueChange={(v: any) => setActiveTab(v)}>
            <TabsList>
              <TabsTrigger value="consultas">Consultas</TabsTrigger>
              <TabsTrigger value="usuarios">Usuarios</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="h-[320px] w-full">
          {loading ? (
            <Skeleton className="w-full h-full" />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} key={`${activeTab}-${range}`} margin={{ top: 16, right: 24, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f97316" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#f97316" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis
                dataKey="name"
                tick={{ fill: "#94a3b8" }}
                axisLine={{ stroke: "#e5e7eb" }}
                tickLine={{ stroke: "#e5e7eb" }}
                minTickGap={10}
                tickMargin={8}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fill: "#94a3b8" }}
                axisLine={false}
                tickLine={{ stroke: "#e5e7eb" }}
              />
              <Tooltip
                content={(props: any) => (
                  <CustomTooltip {...props} metricLabel={activeTab === "consultas" ? "Consultas" : "Usuarios"} />
                )}
              />
              <Area
                type="monotone"
                dataKey={dataKey}
                stroke="#f97316"
                fill="url(#chartGradient)"
                strokeWidth={2}
                dot={{ r: 2 }}
                isAnimationActive
              />
            </AreaChart>
          </ResponsiveContainer>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
