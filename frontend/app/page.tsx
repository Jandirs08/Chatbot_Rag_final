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
  Bot,
  FileText,
  Settings,
  TrendingUp,
  Users,
  MessageCircle,
  FileDown,
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
      title: "Consultas",
      value: stats.total_queries.toString(),
      icon: MessageCircle,
      color: "text-accent",
      href: "/chat",
    },
    {
      title: "Usuarios Activos",
      value: stats.total_users.toString(),
      icon: Users,
      color: "text-primary",
      href: "/usuarios",
    },
  ];

  const quickActions = [
    {
      title: "Ver Widget",
      description: "Previsualiza y obtén el código del iframe",
      icon: Bot,
      href: "/widget",
      gradient: "gradient-primary",
    },
    {
      title: "Subir PDF",
      description: "Añade nuevo contenido al conocimiento del bot",
      icon: FileText,
      href: "/documentos",
      gradient: "gradient-secondary",
    },
    {
      title: "Configurar Bot",
      description: "Ajusta el prompt y temperatura del modelo",
      icon: Settings,
      href: "/configuracion",
      gradient: "gradient-soft",
    },
    {
      title: "Exportar Conversaciones",
      description: "Descarga todas las conversaciones en Excel",
      icon: FileDown,
      onClick: async () => {
        try {
          await exportService.exportConversations();
          toast.success("Conversaciones exportadas exitosamente");
        } catch (error) {
          toast.error("Error al exportar conversaciones");
        }
      },
      gradient: "gradient-accent",
    },
  ];

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <h1 className="text-4xl font-bold text-foreground">Panel de Control</h1>
          <span
            className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-xs border ${
              isBotActive
                ? "bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-300 dark:border-green-800"
                : "bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800"
            }`}
            aria-live="polite"
          >
            <span
              className={`inline-block w-2 h-2 rounded-full ${
                isBotActive ? "bg-green-500" : "bg-red-500"
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
      <Card className="border-border/50 bg-gradient-to-r from-background to-muted/20">
        <CardHeader>
          <CardTitle className="text-xl flex items-center gap-3">
            <Bot className="w-6 h-6 text-primary" />
            Control del Bot
            <div className="flex items-center gap-3 ml-auto">
              <span
                className={`text-sm font-medium ${isBotActive ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}
              >
                {isBotActive ? "Bot Activo" : "Bot Inactivo"}
              </span>
              <Switch
                checked={isBotActive}
                onCheckedChange={handleBotToggle}
                disabled={isLoading}
                className="data-[state=checked]:bg-green-500"
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
            className={`flex items-center justify-between p-4 rounded-lg border transition-colors ${
              isBotActive
                ? "bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800"
                : "bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800"
            }`}
          >
            <div className="flex items-center gap-3">
              <div
                className={`w-3 h-3 rounded-full ${
                  isBotActive ? "bg-green-500 animate-pulse" : "bg-red-500"
                }`}
              ></div>
              <div>
                <p
                  className={`font-medium ${
                    isBotActive
                      ? "text-green-800 dark:text-green-200"
                      : "text-red-800 dark:text-red-200"
                  }`}
                >
                  {isBotActive ? "Bot Respondiendo" : "Bot Pausado"}
                </p>
                <p
                  className={`text-sm ${
                    isBotActive
                      ? "text-green-600 dark:text-green-400"
                      : "text-red-600 dark:text-red-400"
                  }`}
                >
                  {isBotActive
                    ? "Respondiendo consultas normalmente"
                    : "Las consultas mostrarán mensaje de inactividad"}
                </p>
              </div>
            </div>
            <div
              className={`text-right text-sm ${
                isBotActive
                  ? "text-green-600 dark:text-green-400"
                  : "text-red-600 dark:text-red-400"
              }`}
            >
              <p>Última actividad: Hace 2 min</p>
              <p>Temperatura: 0.7</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statsCards.map((stat, index) => (
          <a
            key={index}
            href={stat.href}
            className="group block"
            aria-label={`Ir a ${stat.title}`}
          >
            <Card className="transition-all duration-300 border-border/50 hover:shadow-xl hover:border-primary/60">
              <CardHeader className="flex items-center gap-3 space-y-0 pb-2">
                <div className="w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center group-hover:bg-primary/20">
                  <stat.icon className={`h-4 w-4 ${stat.color}`} />
                </div>
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {stat.title}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-foreground tracking-tight">
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

      {/* Quick Actions */}
      <div className="space-y-4">
        <h2 className="text-2xl font-semibold text-foreground">
          Acciones Rápidas
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {quickActions.map((action, index) => {
            const content = (
              <Card className="group hover:shadow-xl transition-all duration-300 cursor-pointer border-border/50 overflow-hidden">
                <CardHeader className="space-y-4">
                  <div
                    className={`w-12 h-12 rounded-lg ${action.gradient} flex items-center justify-center group-hover:scale-110 transition-transform duration-300`}
                  >
                    <action.icon className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <CardTitle className="text-lg group-hover:text-primary transition-colors">
                      {action.title}
                    </CardTitle>
                    <CardDescription className="mt-2">
                      {action.description}
                    </CardDescription>
                  </div>
                </CardHeader>
              </Card>
            );

            return action.href ? (
              <a key={index} href={action.href} aria-label={action.title}>
                {content}
              </a>
            ) : (
              <div key={index} role="button" aria-label={action.title} onClick={action.onClick}>
                {content}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
