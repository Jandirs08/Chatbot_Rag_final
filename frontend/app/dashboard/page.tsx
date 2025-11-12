"use client";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Switch } from "../components/ui/switch";
import {
  Bot,
  FileText,
  Settings,
  TrendingUp,
  Users,
  MessageCircle,
} from "lucide-react";
import { Monitor, Upload, Clock, Loader2 } from "lucide-react";
import { useState } from "react";
import { useRequireAuth } from "../hooks";

export default function Dashboard() {
  // Proteger la ruta sin UI de loading; middleware se encarga del redirect
  const { isAuthorized } = useRequireAuth();
  
  const [isBotActive, setIsBotActive] = useState(true);

  // Si no está autorizado, no renderizar nada (se redirigirá)
  if (!isAuthorized) return null;

  const handleBotToggle = (checked: boolean) => {
    setIsBotActive(checked);
    // TODO: Aquí se conectará con el backend para guardar el estado
    console.log("Bot state changed:", checked);
  };

  const stats = [
    {
      title: "PDFs Activos",
      value: "12",
      change: "+2 esta semana",
      icon: FileText,
      color: "text-primary",
    },
    {
      title: "Consultas Hoy",
      value: "247",
      change: "+18% vs ayer",
      icon: MessageCircle,
      color: "text-accent",
    },
    {
      title: "Eficiencia RAG",
      value: "94%",
      change: "+5% este mes",
      icon: TrendingUp,
      color: "text-secondary",
    },
    {
      title: "Usuario Activos",
      value: "1,234",
      change: "+12% este mes",
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
      gradient: "gradient-primary",
    },
    {
      title: "Subir un nuevo PDF",
      description: "Añade nuevo contenido al conocimiento del bot",
      icon: Upload,
      href: "/Documents",
      gradient: "gradient-secondary",
    },
    {
      title: "Configurar Bot",
      description: "Ajusta el prompt y temperatura del modelo",
      icon: Settings,
      href: "/dashboard/settings",
      gradient: "gradient-primary",
    },
  ];

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-5xl font-bold text-foreground">Dashboard</h1>
        <p className="text-xl text-muted-foreground">
          Gestiona tu chatbot RAG de Becas Grupo Romero
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
                className={`text-sm font-medium ${isBotActive ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}
              >
                {isBotActive ? "Bot Activo" : "Bot Inactivo"}
              </span>
              <Switch
                checked={isBotActive}
                onCheckedChange={handleBotToggle}
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
            className={`flex items-center justify-between p-4 rounded-xl border border-[#f0f0f0] shadow-[0_1px_3px_rgba(0,0,0,0.08)] bg-white`}
          >
            <div className="flex items-center gap-3">
              <div
                className={`w-3 h-3 rounded-full ${
                  isBotActive ? "bg-[#da5b3e] animate-pulse" : "bg-gray-400"
                }`}
              ></div>
              <div>
                <p
                  className={`font-medium text-[#333]`}
                >
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

      {/* Stats Grid */}
      <hr className="my-6 border-t border-border/60" />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
        {stats.map((stat, index) => (
          <Card
            key={index}
            className="hover:shadow-xl transition-all duration-300 border border-border/60 shadow-sm"
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.title}
              </CardTitle>
              <stat.icon className={`h-4 w-4 ${stat.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold text-foreground">
                {stat.value}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {stat.change}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="space-y-4">
        <h2 className="text-2xl font-semibold text-foreground">
          Acciones Rápidas
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {quickActions.map((action, index) => (
            <Card
              key={index}
              className="group hover:shadow-xl transition-all duration-300 cursor-pointer border-border/50 overflow-hidden"
            >
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
              <CardContent>
                <Button
                  asChild
                  className="w-full gradient-primary hover:opacity-90 transition-opacity"
                >
                  <a href={action.href}>Abrir</a>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
