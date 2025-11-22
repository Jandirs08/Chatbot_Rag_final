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
import { useRequireAuth } from "./hooks";
import { botService } from "./lib/services/botService";
import { exportService } from "./lib/services/exportService";
import { statsService } from "./lib/services/statsService";
import { toast } from "sonner";

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
          console.warn("Estado del bot no disponible:", botRes.reason);
        }
        if (statsRes.status === "fulfilled") {
          setStats(statsRes.value);
        } else {
          console.warn("Estadísticas no disponibles:", statsRes.reason);
        }
      } catch (error) {
        console.error("Error al obtener datos:", error);
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
      console.error("Error al cambiar el estado del bot:", error);
      toast.error("Error al cambiar el estado del bot");
      // Revertir el estado en caso de error
      setIsBotActive(!checked);
    } finally {
      setIsLoading(false);
    }
  };

  const statsCards = [
    {
      title: "PDFs Activos",
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
      <div className="space-y-2">
        <div className="flex items-center gap-4">
          <h1 className="text-5xl font-bold text-foreground">
            Panel de Control
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
        <p className="text-xl text-muted-foreground">
          Gestión del chatbot de Becas Grupo Romero
        </p>
      </div>

      {/* Bot Status Control */}
      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="text-xl flex items-center gap-3">
            <Bot className="w-6 h-6 text-primary" />
            Control del Bot
            <div className="flex items-center gap-3 ml-auto">
              <span
                className={`text-sm font-semibold ${isBotActive ? "text-[#da5b3e]" : "text-gray-500"}`}
              >
                {isBotActive ? "Bot Activo" : "Bot Inactivo"}
              </span>
              <Switch
                checked={isBotActive}
                onCheckedChange={handleBotToggle}
                disabled={isLoading}
                className="data-[state=checked]:bg-[#da5b3e]"
              />
            </div>
          </CardTitle>
          <CardDescription>
            Cuando el bot está inactivo, la burbuja sigue cargando, pero no
            responde preguntas.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div
            className={`flex items-center justify-between p-4 rounded-xl border border-[#f0f0f0] shadow-[0_1px_3px_rgba(0,0,0,0.08)] bg-white`}
          >
            <div className="flex items-center gap-3">
              <div
                className={`w-3 h-3 rounded-full ${
                  isBotActive ? "bg-[#da5b3e] animate-pulse" : "bg-gray-400"
                }`}
              ></div>
              <div>
                <p className={`font-medium text-[#333]`}>
                  {isBotActive ? "Bot Respondiendo" : "Bot Pausado"}
                </p>
                <p
                  className={`flex items-center gap-2 text-base font-semibold ${
                    isBotActive ? "text-[#da5b3e]" : "text-gray-500"
                  }`}
                >
                  {isBotActive ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Respondiendo...</span>
                    </>
                  ) : (
                    <span>Las consultas mostrarán mensaje de inactividad</span>
                  )}
                </p>
              </div>
            </div>
            <div className={`text-right text-sm text-muted-foreground`}>
              <p className="flex items-center justify-end gap-2 text-muted-foreground">
                <Clock className="w-4 h-4" />
                <span>Última actividad: Hace 2 min</span>
              </p>
              <p className="text-muted-foreground">Temperatura: 0.7</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <hr className="my-6 border-t border-border/60" />
      <div className="space-y-4">
        <h2 className="text-3xl font-semibold text-foreground">
          Acciones Rápidas
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {quickActions.map((action, index) => {
            const content = (
              <Card className="group hover:shadow-xl shadow-sm transition-all duration-300 cursor-pointer border border-border/60 overflow-hidden">
                <CardHeader className="space-y-4">
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
                        <CardTitle className="text-xl group-hover:text-primary transition-colors">
                          Exportar Conversaciones
                        </CardTitle>
                        <CardDescription className="mt-2">
                          Descarga en Excel, CSV o JSON
                        </CardDescription>
                      </>
                    ) : (
                      <>
                        <CardTitle className="text-xl group-hover:text-primary transition-colors">
                          {action.title}
                        </CardTitle>
                        <CardDescription className="mt-2">
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
                onClick={action.onClick}
              >
                {content}
              </div>
            );
          })}
        </div>
      </div>

      {/* Stats Grid */}
      <hr className="my-6 border-t border-border/60" />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
        {statsCards.map((stat, index) => (
          <a
            key={index}
            href={stat.href}
            className="group block"
            aria-label={`Ir a ${stat.title}`}
          >
            <Card className="transition-all duration-300 border border-border/60 shadow-sm hover:shadow-xl hover:border-primary/60">
              <CardHeader className="flex items-center gap-3 space-y-0 pb-2">
                <div className="w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center group-hover:bg-primary/20">
                  <stat.icon className={`h-4 w-4 ${stat.color}`} />
                </div>
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {stat.title}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-4xl font-bold text-foreground tracking-tight">
                  {isLoading ? (
                    <span className="inline-block h-7 w-20 bg-muted animate-pulse rounded" />
                  ) : (
                    stat.value
                  )}
                </div>
              </CardContent>
            </Card>
          </a>
        ))}
      </div>
    </div>
  );
}
