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
      gradient: "gradient-secondary",
    },
    {
      title: "Subir un nuevo PDF",
      description: "Añade nuevo contenido al conocimiento del bot",
      icon: Upload,
      href: "/Documents",
      gradient: "gradient-primary",
    },
    {
      title: "Configurar Bot",
      description: "Ajusta el prompt y temperatura del modelo",
      icon: Settings,
      href: "/dashboard/settings",
      gradient: "gradient-primary",
    },
    { title: "__EXPORT__", gradient: "gradient-secondary" },
  ];

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div className="space-y-2 pb-6 border-b border-gray-200">
        <div className="flex items-center gap-4">
          <h1 className="text-5xl font-bold text-foreground">
            Control del Chatbot
          </h1>
          <span
            className={`inline-flex items-center gap-2 px-3 py-1 rounded-[20px] text-xs font-semibold ${
              isBotActive
                ? "bg-[#da5b3e] text-white border-0"
                : "bg-gray-100 text-gray-600 border-0"
            }`}
            aria-live="polite"
          >
            <span
              className={`inline-block w-2 h-2 rounded-full ${
                isBotActive ? "bg-white" : "bg-gray-500"
              }`}
            />
            {isBotActive ? "Bot activo" : "Bot inactivo"}
          </span>
        </div>
      </div>

      {/* Layout principal: izquierda estado+stats, derecha acciones */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          {/* Bot Status Control */}
          <Card className="border-0 shadow">
            <CardHeader>
              <CardTitle className="text-xl flex items-center gap-3">
                <Bot className="w-6 h-6 text-primary" />
                Estado del chatbot
              </CardTitle>
              <CardDescription>
                Cuando el bot está inactivo, la burbuja sigue cargando, pero no
                responde preguntas.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between p-4">
                <div className="flex items-center gap-4">
                  <div
                    className={`w-5 h-5 rounded-full ${isBotActive ? "bg-emerald-500 animate-pulse" : "bg-gray-400"}`}
                  ></div>
                  <div>
                    <div
                      className={`text-xl font-semibold ${isBotActive ? "text-emerald-700" : "text-gray-700"}`}
                    >
                      {isBotActive ? "Estado: Activo" : "Estado: En Pausa"}
                    </div>
                    <div className="text-sm text-muted-foreground flex items-center gap-2">
                      <Clock className="w-4 h-4" />
                      <span>Última actividad: Hace 2 min</span>
                    </div>
                  </div>
                </div>
                <div>
                  <Switch
                    checked={isBotActive}
                    onCheckedChange={handleBotToggle}
                    disabled={isLoading}
                    className="scale-110 data-[state=checked]:bg-emerald-600"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Stats Grid */}
          <div className="space-y-4">
            <h2 className="text-3xl font-semibold text-foreground">
              Estado y Métricas
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {statsCards.map((stat, index) => {
                const content = (
                  <Card className="border-0 shadow-md border-t-4 border-orange-500 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg dark:bg-slate-800">
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-sm font-medium text-gray-500 uppercase tracking-wider">
                            {stat.title}
                          </div>
                          <div className="text-3xl font-bold text-gray-900 dark:text-white mt-1">
                            {isLoading ? (
                              <span className="inline-block h-7 w-24 bg-muted animate-pulse rounded" />
                            ) : (
                              stat.value
                            )}
                          </div>
                        </div>
                        <div className="bg-orange-100 p-4 rounded-full">
                          <stat.icon className="w-6 h-6 text-orange-600" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );

                return stat.href ? (
                  <a
                    key={index}
                    href={stat.href}
                    className="group block"
                    aria-label={`Ir a ${stat.title}`}
                  >
                    {content}
                  </a>
                ) : (
                  <div
                    key={index}
                    className="group block"
                    aria-label={stat.title}
                  >
                    {content}
                  </div>
                );
              })}
            </div>
            <DashboardCharts />
          </div>
        </div>

        {/* Acciones Rápidas compactas (columna derecha) */}
        <div className="lg:col-span-1 space-y-4">
          <h2 className="text-3xl font-semibold text-foreground">
            Accesos Directos
          </h2>
          <div className="grid grid-cols-1 gap-4">
            {quickActions.map((action, index) => {
              const content = (
                <Card className="group hover:shadow-xl shadow transition-all duration-300 cursor-pointer border-0 overflow-hidden">
                  <CardHeader className="space-y-2 p-4">
                    <div
                      className={`w-12 h-12 rounded-lg ${action.gradient} flex items-center justify-center group-hover:scale-110 transition-transform duration-300`}
                    >
                      {action.title === "__EXPORT__" ? (
                        <Download className="w-6 h-6 text-white" />
                      ) : (
                        // @ts-ignore
                        <action.icon className="w-6 h-6 text-white" />
                      )}
                    </div>
                    <div>
                      {action.title === "__EXPORT__" ? (
                        <>
                          <CardTitle className="text-base group-hover:text-primary transition-colors">
                            Exportar Conversaciones
                          </CardTitle>
                          <CardDescription className="mt-1">
                            Descarga en Excel, CSV o JSON
                          </CardDescription>
                        </>
                      ) : (
                        <>
                          <CardTitle className="text-base group-hover:text-primary transition-colors">
                            {action.title}
                          </CardTitle>
                          <CardDescription className="mt-1">
                            {action.description}
                          </CardDescription>
                        </>
                      )}
                    </div>
                  </CardHeader>
                </Card>
              );

              if (action.title === "__EXPORT__") {
                return (
                  <DropdownMenu key={index}>
                    <DropdownMenuTrigger asChild>
                      <div aria-label="Exportar Conversaciones" role="button">
                        {content}
                      </div>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                      <DropdownMenuLabel>Exportar</DropdownMenuLabel>
                      <DropdownMenuItem
                        onClick={async () => {
                          try {
                            setIsExporting(true);
                            await exportService.exportConversations("xlsx");
                            toast.success("Exportado Excel");
                          } catch {
                            toast.error("Error exportando Excel");
                          } finally {
                            setIsExporting(false);
                          }
                        }}
                      >
                        Excel (.xlsx)
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={async () => {
                          try {
                            setIsExporting(true);
                            await exportService.exportConversations("csv");
                            toast.success("Exportado CSV");
                          } catch {
                            toast.error("Error exportando CSV");
                          } finally {
                            setIsExporting(false);
                          }
                        }}
                      >
                        CSV
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={async () => {
                          try {
                            setIsExporting(true);
                            await exportService.exportConversations("json", {
                              pretty: true,
                            });
                            toast.success("Exportado JSON");
                          } catch {
                            toast.error("Error exportando JSON");
                          } finally {
                            setIsExporting(false);
                          }
                        }}
                      >
                        JSON
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                );
              }
              return action.href ? (
                <a key={index} href={action.href} aria-label={action.title}>
                  {content}
                </a>
              ) : (
                <div
                  key={index}
                  role="button"
                  aria-label={action.title}
                >
                  {content}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
