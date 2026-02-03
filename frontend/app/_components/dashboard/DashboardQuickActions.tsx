 "use client";
 
 import {
   DropdownMenu,
   DropdownMenuTrigger,
   DropdownMenuContent,
   DropdownMenuItem,
   DropdownMenuLabel,
   DropdownMenuSeparator,
 } from "@/app/components/ui/dropdown-menu";
 import { Download, Monitor, Settings, Upload } from "lucide-react";
 import { exportService } from "@/app/lib/services/exportService";
 
 export default function DashboardQuickActions() {
  type IconComponent = React.ComponentType<{ className?: string }>;
  type Action = {
    title: string;
    description?: string;
    icon?: IconComponent;
    href?: string;
  };
  const actions: Action[] = [
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
       href: "/docs",
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
     <div className="space-y-1">
       {actions
         .filter((a) => a.href !== "/documents" && a.href !== "/dashboard/settings")
         .map((action, index) => {
           const content = (
             <div className="group flex items-center gap-3.5 p-3 -mx-3 rounded-xl hover:bg-muted/60 transition-all duration-200 cursor-pointer">
               <div className="w-10 h-10 rounded-lg bg-muted/80 flex items-center justify-center shrink-0 group-hover:bg-primary/10 transition-colors duration-200">
                 {action.title === "__EXPORT__" ? (
                   <Download className="w-[18px] h-[18px] text-muted-foreground group-hover:text-primary transition-colors" />
                 ) : (
                  action.icon ? (
                    <action.icon className="w-[18px] h-[18px] text-muted-foreground group-hover:text-primary transition-colors" />
                  ) : null
                 )}
               </div>
               <div className="min-w-0 flex-1">
                 <p className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">
                   {action.title === "__EXPORT__" ? "Exportar Datos" : action.title}
                 </p>
                 <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                   {action.title === "__EXPORT__" ? "Descargar historial de chats" : action.description}
                 </p>
               </div>
               <svg className="w-4 h-4 text-muted-foreground/40 group-hover:text-primary/60 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
               </svg>
             </div>
           );
 
           if (action.title === "__EXPORT__") {
             return (
               <DropdownMenu key={index}>
                 <DropdownMenuTrigger asChild>
                   <div role="button">{content}</div>
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
               {content}
             </a>
           ) : (
             <div key={index}>{content}</div>
           );
         })}
     </div>
   );
 }
