 "use client";
 
 import { Button } from "@/app/components/ui/button";
 import { Switch } from "@/app/components/ui/switch";
 import { Clock, Settings, Upload } from "lucide-react";
 
 interface DashboardHeaderProps {
   isBotActive: boolean;
   isLoading: boolean;
   relativeLastActivity: string;
   onToggle: (checked: boolean) => void;
 }
 
 export default function DashboardHeader({
   isBotActive,
   isLoading,
   relativeLastActivity,
   onToggle,
 }: DashboardHeaderProps) {
   return (
     <header className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
       <div className="space-y-4">
         <div className="space-y-1">
           <h1 className="text-3xl font-bold tracking-tight text-foreground">
             Panel de Control
           </h1>
           <p className="text-muted-foreground text-base">
             Gestiona tu asistente y visualiza métricas en tiempo real
           </p>
         </div>
 
         <div className="flex flex-wrap items-center gap-3">
           <div
             className={`inline-flex items-center gap-2.5 px-3.5 py-1.5 rounded-full text-sm font-medium transition-all duration-300 ${
               isBotActive
                 ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400"
                 : "bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-400"
             }`}
           >
             <div
               className={`w-2 h-2 rounded-full ${
                 isBotActive ? "bg-emerald-500 animate-pulse" : "bg-red-500"
               }`}
             />
             <span>{isBotActive ? "Sistema Activo" : "Sistema Pausado"}</span>
             <Switch
               checked={isBotActive}
               onCheckedChange={onToggle}
               disabled={isLoading}
               className="ml-1 data-[state=checked]:bg-emerald-600 h-5 w-9"
             />
           </div>
 
           <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
             <Clock className="w-3.5 h-3.5" />
             Última actividad: {relativeLastActivity}
           </span>
         </div>
       </div>
 
       <div className="flex items-center gap-2.5">
         <a href="/dashboard/settings" aria-label="Configurar Bot">
           <Button variant="outline" size="sm">
             <Settings className="w-4 h-4" />
             Configuración
           </Button>
         </a>
         <a href="/docs" aria-label="Subir Documentos">
           <Button size="sm" className="bg-primary hover:bg-primary/90">
             <Upload className="w-4 h-4" />
             Subir PDF
           </Button>
         </a>
       </div>
     </header>
   );
 }
