"use client";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./components/ui/card";
import { Button } from "./components/ui/button";
import { Switch } from "./components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "./components/ui/dropdown-menu";
import {
  Bot,
  FileText,
  Settings,
  TrendingUp,
  Users,
  MessageCircle,
  Download,
  Monitor,
  Upload,
  Clock,
  Loader2,
} from "lucide-react";
import { useState, useEffect } from "react";
import { logger } from "@/app/lib/logger";
import { useRequireAuth } from "./hooks";
import { botService } from "./lib/services/botService";
import { exportService } from "./lib/services/exportService";
import { statsService } from "./lib/services/statsService";
import { toast } from "sonner";
import DashboardCharts from "./components/dashboard/DashboardCharts";

export default function Dashboard() {
  // Proteger la ruta sin UI de loading; middleware se encarga del redirect
  const { isAuthorized } = useRequireAuth();

  // Declarar hooks SIEMPRE antes de cualquier return para mantener el orden estable
  const [isBotActive, setIsBotActive] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [lastActivityIso, setLastActivityIso] = useState<string | null>(null);
  const [relativeLastActivity, setRelativeLastActivity] = useState<string>("-");

  const [stats, setStats] = useState({
    total_queries: 0,
    total_users: 0,
    total_pdfs: 0,
  });

  useEffect(() => {
    // Solo cargar datos si está autorizado, evita actualizaciones mientras se redirige
    if (!isAuthorized) return;

    const fetchData = async () => {
      try {
        const results = await Promise.allSettled([
          botService.getState(),
          statsService.getStats(),
        ]);
        const botRes = results[0];
        const statsRes = results[1];
        if (botRes.status === "fulfilled") {
          setIsBotActive(botRes.value.is_active);
          setLastActivityIso(botRes.value.last_activity_iso ?? null);
        } else {
          logger.warn("Estado del bot no disponible:", botRes.reason);
        }
        if (statsRes.status === "fulfilled") {
          setStats(statsRes.value);
        } else {
          logger.warn("Estadísticas no disponibles:", statsRes.reason);
        }
      } catch (error) {
        logger.error("Error al obtener datos:", error);
        toast.error("Error al obtener datos del dashboard");
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [isAuthorized]);

  useEffect(() => {
    const fmt = (iso?: string | null) => {
      if (!iso) return "-";
      const d = new Date(iso);
      if (isNaN(d.getTime())) return "-";
      const now = Date.now();
      const diffMs = Math.max(0, now - d.getTime());
      const sec = Math.floor(diffMs / 1000);
      if (sec < 60) return "Hace segundos";
      const min = Math.floor(sec / 60);
      if (min < 60) return `Hace ${min} min`;
      const hr = Math.floor(min / 60);
      if (hr < 24) return `Hace ${hr} h`;
      const day = Math.floor(hr / 24);
      return `Hace ${day} d`;
    };
    setRelativeLastActivity(fmt(lastActivityIso));
    const id = setInterval(() => {
      setRelativeLastActivity(fmt(lastActivityIso));
    }, 60000);
    return () => clearInterval(id);
  }, [lastActivityIso]);

  // Si no está autorizado, no renderizar nada (se redirigirá). Importante: después de declarar hooks.
  if (!isAuthorized) return null;

  const handleBotToggle = async (checked: boolean) => {
    try {
      setIsLoading(true);
      const state = await botService.toggleState();
      setIsBotActive(state.is_active);
      toast.success(state.message);
    } catch (error) {
      logger.error("Error al cambiar el estado del bot:", error);
      toast.error("Error al cambiar el estado del bot");
      // Revertir el estado en caso de error
      setIsBotActive(!checked);
    } finally {
      setIsLoading(false);
    }
  };

  const statsCards = [
    {
      title: "Base de Conocimiento",
      value: stats.total_pdfs.toString(),
      icon: FileText,
      color: "text-primary",
      href: "/Documents",
    },
    {
      title: "Mensajes",
      value: stats.total_queries.toString(),
      icon: MessageCircle,
      color: "text-accent",
      href: "/chat",
    },
    {
      title: "Usuarios únicos",
      value: stats.total_users.toString(),
      icon: Users,
      color: "text-primary",
    },
  ];

  const quickActions = [
    {
      title: "Ver Widget",
      description: "Previsualiza y obtén el código del iframe",
      icon: Monitor,
      href: "/widget",
    },
    {
      title: "Subir un nuevo PDF",
      description: "Añade nuevo contenido al conocimiento del bot",
      icon: Upload,
      href: "/Documents",
    },
    {
      title: "Configurar Bot",
      description: "Ajusta el prompt y temperatura del modelo",
      icon: Settings,
      href: "/dashboard/settings",
    },
    { title: "__EXPORT__" },
  ];

  return (
    <div className="space-y-10 animate-fade-in w-full">
      {/* ═══════════════════════════════════════════════════════════════════
          HEADER: Título + Subtítulo + Estado + Action Bar
      ═══════════════════════════════════════════════════════════════════ */}
      <header className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        {/* Left: Título, subtítulo y estado */}
        <div className="space-y-4">
          <div className="space-y-1">
            <h1 className="text-3xl font-bold tracking-tight text-foreground">
              Panel de Control
            </h1>
            <p className="text-muted-foreground text-base">
              Gestiona tu asistente y visualiza métricas en tiempo real
            </p>
          </div>

          {/* Status badge elegante */}
          <div className="flex flex-wrap items-center gap-3">
            <div
              className={`inline-flex items-center gap-2.5 px-3.5 py-1.5 rounded-full text-sm font-medium transition-all duration-300 ${isBotActive
                  ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400"
                  : "bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-400"
                }`}
            >
              <div
                className={`w-2 h-2 rounded-full ${isBotActive
                    ? "bg-emerald-500 animate-pulse"
                    : "bg-red-500"
                  }`}
              />
              <span>{isBotActive ? "Sistema Activo" : "Sistema Pausado"}</span>
              <Switch
                checked={isBotActive}
                onCheckedChange={handleBotToggle}
                disabled={isLoading}
                className="ml-1 data-[state=checked]:bg-emerald-600 h-5 w-9"
              />
            </div>

            {/* Timestamp sutil */}
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="w-3.5 h-3.5" />
              Última actividad: {relativeLastActivity}
            </span>
          </div>
        </div>

        {/* Right: Action bar compacta */}
        <div className="flex items-center gap-2.5">
          <a href="/dashboard/settings" aria-label="Configurar Bot">
            <Button variant="outline" size="sm">
              <Settings className="w-4 h-4" />
              Configuración
            </Button>
          </a>
          <a href="/Documents" aria-label="Subir Documentos">
            <Button size="sm" className="bg-primary hover:bg-primary/90">
              <Upload className="w-4 h-4" />
              Subir PDF
            </Button>
          </a>
        </div>
      </header>

      {/* ═══════════════════════════════════════════════════════════════════
          KPI METRICS: Cards visuales con jerarquía clara
      ═══════════════════════════════════════════════════════════════════ */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {statsCards.map((stat, index) => {
          const cardContent = (
            <Card className="group relative overflow-hidden hover:shadow-[var(--shadow-hover)] transition-all duration-300">
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div className="space-y-3">
                    {/* Label pequeño */}
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      {stat.title}
                    </p>
                    {/* Valor dominante */}
                    <p className="text-4xl font-bold text-foreground tracking-tight">
                      {isLoading ? (
                        <span className="inline-block h-10 w-16 bg-muted/60 animate-pulse rounded-md" />
                      ) : (
                        stat.value
                      )}
                    </p>
                  </div>
                  {/* Icono discreto */}
                  <div className="w-11 h-11 rounded-xl bg-primary/8 flex items-center justify-center group-hover:bg-primary/12 transition-colors duration-300">
                    <stat.icon className="w-5 h-5 text-primary/80" />
                  </div>
                </div>
              </CardContent>
              {/* Hover accent line */}
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary/0 group-hover:bg-primary/60 transition-all duration-300" />
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

      {/* ═══════════════════════════════════════════════════════════════════
          CONTENIDO PRINCIPAL: Actividad + Accesos Directos
      ═══════════════════════════════════════════════════════════════════ */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Actividad Reciente - 2/3 del ancho */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <CardTitle className="text-lg font-semibold">Actividad Reciente</CardTitle>
                <CardDescription className="text-sm">Evolución de interacciones del sistema</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-2">
            <DashboardCharts />
          </CardContent>
        </Card>

        {/* Accesos Directos - 1/3 del ancho */}
        <Card className="lg:col-span-1">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg font-semibold">Accesos Directos</CardTitle>
            <CardDescription className="text-sm">Acciones rápidas frecuentes</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-1">
              {quickActions
                .filter(a => a.href !== "/Documents" && a.href !== "/dashboard/settings")
                .map((action, index) => {
                  const actionContent = (
                    <div className="group flex items-center gap-3.5 p-3 -mx-3 rounded-xl hover:bg-muted/60 transition-all duration-200 cursor-pointer">
                      {/* Icono con fondo */}
                      <div className="w-10 h-10 rounded-lg bg-muted/80 flex items-center justify-center shrink-0 group-hover:bg-primary/10 transition-colors duration-200">
                        {action.title === "__EXPORT__" ? (
                          <Download className="w-[18px] h-[18px] text-muted-foreground group-hover:text-primary transition-colors" />
                        ) : (
                          // @ts-ignore
                          <action.icon className="w-[18px] h-[18px] text-muted-foreground group-hover:text-primary transition-colors" />
                        )}
                      </div>
                      {/* Texto */}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">
                          {action.title === "__EXPORT__" ? "Exportar Datos" : action.title}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                          {action.title === "__EXPORT__" ? "Descargar historial de chats" : action.description}
                        </p>
                      </div>
                      {/* Chevron sutil */}
                      <svg className="w-4 h-4 text-muted-foreground/40 group-hover:text-primary/60 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  );

                  if (action.title === "__EXPORT__") {
                    return (
                      <DropdownMenu key={index}>
                        <DropdownMenuTrigger asChild>
                          <div role="button">{actionContent}</div>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">Formato</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => exportService.exportConversations("xlsx")}>
                            Excel (.xlsx)
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => exportService.exportConversations("csv")}>
                            CSV
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => exportService.exportConversations("json", { pretty: true })}>
                            JSON
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    );
                  }
                  return action.href ? (
                    <a key={index} href={action.href} className="block">
                      {actionContent}
                    </a>
                  ) : (
                    <div key={index}>{actionContent}</div>
                  );
                })}
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
