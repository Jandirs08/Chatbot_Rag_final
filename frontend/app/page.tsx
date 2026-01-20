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
    <div className="space-y-12 animate-fade-in w-full px-6 md:px-10 pt-6">
      {/* Header Superior Fuerte */}
      <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between pb-2">
        <div className="space-y-4">
          <h1 className="text-5xl font-extrabold tracking-tight text-foreground">
            Panel de Control
          </h1>
          
          <div className="flex flex-wrap items-center gap-6">
            {/* Estado Integrado */}
            <div className="flex items-center gap-3 bg-muted/30 px-4 py-2 rounded-full border border-border/50">
              <div 
                className={`w-3 h-3 rounded-full transition-all duration-500 ${isBotActive 
                  ? "bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.4)]" 
                  : "bg-red-500"}`} 
              />
              <span className="text-base font-medium text-foreground">
                {isBotActive ? "Sistema Activo" : "Sistema Pausado"}
              </span>
              <Switch
                checked={isBotActive}
                onCheckedChange={handleBotToggle}
                disabled={isLoading}
                className="ml-2 data-[state=checked]:bg-emerald-600"
              />
            </div>

            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="w-4 h-4" />
              <span>{relativeLastActivity}</span>
            </div>
          </div>
        </div>

        <div className="flex gap-3">
          <a href="/dashboard/settings" aria-label="Configurar Bot">
            <Button variant="outline" className="h-10">
              <Settings className="w-4 h-4 mr-2" />
              Configuración
            </Button>
          </a>
          <a href="/Documents" aria-label="Subir Documentos">
            <Button className="h-10 gradient-primary shadow-lg shadow-primary/20">
              <Upload className="w-4 h-4 mr-2" />
              Subir PDF
            </Button>
          </a>
        </div>
      </div>

      {/* Métricas Integradas - Sin Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 border-y border-border/60 py-10">
        {statsCards.map((stat, index) => {
          const content = (
            <div className="flex flex-col gap-2 group cursor-default">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <stat.icon className="w-4 h-4" />
                <span className="text-sm font-medium uppercase tracking-wider">{stat.title}</span>
              </div>
              <div className="text-5xl font-bold text-foreground tracking-tight group-hover:text-primary transition-colors duration-300">
                {isLoading ? (
                  <span className="inline-block h-10 w-24 bg-muted animate-pulse rounded" />
                ) : (
                  stat.value
                )}
              </div>
            </div>
          );

          return stat.href ? (
            <a key={index} href={stat.href} className="block hover:opacity-80 transition-opacity">
              {content}
            </a>
          ) : (
            <div key={index}>
              {content}
            </div>
          );
        })}
      </div>

      {/* Contenido Principal */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
        <div className="lg:col-span-2 space-y-8">
          <div className="flex items-center justify-between">
            <h2 className="text-3xl font-bold tracking-tight text-foreground">Actividad Reciente</h2>
          </div>
          <div className="p-1">
            <DashboardCharts />
          </div>
        </div>

        <div className="lg:col-span-1 space-y-8">
          <h2 className="text-3xl font-bold tracking-tight text-foreground">Accesos Directos</h2>
          <div className="grid grid-cols-1 gap-4">
            {quickActions
              .filter(a => a.href !== "/Documents" && a.href !== "/dashboard/settings") // Ya están arriba
              .map((action, index) => {
              const content = (
                <div className="group flex items-center gap-4 p-4 rounded-xl border border-border/40 hover:border-primary/50 hover:bg-muted/30 transition-all duration-300 cursor-pointer">
                  <div
                    className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center group-hover:bg-background border border-transparent group-hover:border-border transition-colors duration-300"
                  >
                    {action.title === "__EXPORT__" ? (
                      <Download className="w-5 h-5 text-foreground/70" />
                    ) : (
                      // @ts-ignore
                      <action.icon className="w-5 h-5 text-foreground/70" />
                    )}
                  </div>
                  <div>
                    {action.title === "__EXPORT__" ? (
                      <div className="text-lg font-semibold text-foreground group-hover:text-primary transition-colors">
                        Exportar Datos
                      </div>
                    ) : (
                      <div className="text-lg font-semibold text-foreground group-hover:text-primary transition-colors">
                        {action.title}
                      </div>
                    )}
                    <div className="text-sm font-medium text-muted-foreground/80 line-clamp-1">
                      {action.title === "__EXPORT__" ? "Descargar historial" : action.description}
                    </div>
                  </div>
                </div>
              );

              if (action.title === "__EXPORT__") {
                return (
                  <DropdownMenu key={index}>
                    <DropdownMenuTrigger asChild>
                      <div role="button">{content}</div>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                      <DropdownMenuLabel>Formato de Exportación</DropdownMenuLabel>
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
                <a key={index} href={action.href}>{content}</a>
              ) : (
                <div key={index}>{content}</div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
