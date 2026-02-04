"use client";

import { Card, CardContent } from "@/app/components/ui/card";
import { FileText, MessageCircle, Users, TrendingUp, TrendingDown } from "lucide-react";

interface DashboardStatsProps {
  stats: {
    total_queries: number;
    total_users: number;
    total_pdfs: number;
  };
  isLoading: boolean;
}

export default function DashboardStats({ stats, isLoading }: DashboardStatsProps) {
  const items = [
    {
      title: "Base de Conocimiento",
      value: stats.total_pdfs,
      icon: FileText,
      href: "/docs",
      color: "blue",
      trend: { value: 2, isUp: true, label: "esta semana" },
    },
    {
      title: "Mensajes Totales",
      value: stats.total_queries,
      icon: MessageCircle,
      href: "/chat",
      color: "emerald",
      trend: { value: 12, isUp: true, label: "vs ayer" },
    },
    {
      title: "Usuarios Únicos",
      value: stats.total_users,
      icon: Users,
      color: "violet",
      trend: { value: 5, isUp: true, label: "este mes" },
    },
  ];

  const colorClasses = {
    blue: {
      iconBg: "bg-blue-50 dark:bg-blue-950/50",
      iconColor: "text-blue-600 dark:text-blue-400",
      accentBar: "bg-blue-500",
    },
    emerald: {
      iconBg: "bg-emerald-50 dark:bg-emerald-950/50",
      iconColor: "text-emerald-600 dark:text-emerald-400",
      accentBar: "bg-emerald-500",
    },
    violet: {
      iconBg: "bg-violet-50 dark:bg-violet-950/50",
      iconColor: "text-violet-600 dark:text-violet-400",
      accentBar: "bg-violet-500",
    },
  };

  const formatNumber = (num: number): string => {
    if (num >= 1000) {
      return (num / 1000).toFixed(1).replace(/\.0$/, "") + "k";
    }
    return num.toString();
  };

  return (
    <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
      {items.map((stat, index) => {
        const colors = colorClasses[stat.color as keyof typeof colorClasses];

        const cardContent = (
          <Card className="group relative overflow-hidden transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5">
            <CardContent className="p-6">
              <div className="flex items-start justify-between gap-4">
                {/* Left: Label + Value + Trend */}
                <div className="space-y-2 min-w-0 flex-1">
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    {stat.title}
                  </p>
                  <div className="flex items-baseline gap-3">
                    <p className="text-4xl font-bold text-slate-900 dark:text-white tracking-tight tabular-nums">
                      {isLoading ? (
                        <span className="inline-block h-10 w-20 bg-slate-100 dark:bg-slate-800 animate-pulse rounded-lg" />
                      ) : (
                        formatNumber(stat.value)
                      )}
                    </p>
                    {/* Trend indicator */}
                    {!isLoading && stat.trend && (
                      <div className={`flex items-center gap-1 text-xs font-medium ${stat.trend.isUp
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-red-600 dark:text-red-400"
                        }`}>
                        {stat.trend.isUp ? (
                          <TrendingUp className="w-3.5 h-3.5" />
                        ) : (
                          <TrendingDown className="w-3.5 h-3.5" />
                        )}
                        <span>+{stat.trend.value}%</span>
                      </div>
                    )}
                  </div>
                  {/* Trend label */}
                  {!isLoading && stat.trend && (
                    <p className="text-[11px] text-slate-400 dark:text-slate-500">
                      {stat.trend.label}
                    </p>
                  )}
                </div>

                {/* Right: Icon with colored background */}
                <div className={`w-12 h-12 rounded-2xl ${colors.iconBg} flex items-center justify-center flex-shrink-0 transition-transform duration-300 group-hover:scale-110`}>
                  <stat.icon className={`w-6 h-6 ${colors.iconColor}`} />
                </div>
              </div>
            </CardContent>

            {/* Bottom accent bar */}
            <div className={`absolute bottom-0 left-0 right-0 h-1 ${colors.accentBar} opacity-0 group-hover:opacity-100 transition-opacity duration-300`} />
          </Card>
        );

        return stat.href ? (
          <a key={index} href={stat.href} className="block">
            {cardContent}
          </a>
        ) : (
          <div key={index}>{cardContent}</div>
        );
      })}
    </section>
  );
}
