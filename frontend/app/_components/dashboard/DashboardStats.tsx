 "use client";
 
 import { Card, CardContent } from "@/app/components/ui/card";
 import { FileText, MessageCircle, Users } from "lucide-react";
 
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
       value: stats.total_pdfs.toString(),
       icon: FileText,
       href: "/documents",
     },
     {
       title: "Mensajes",
       value: stats.total_queries.toString(),
       icon: MessageCircle,
       href: "/chat",
     },
     {
       title: "Usuarios únicos",
       value: stats.total_users.toString(),
       icon: Users,
     },
   ];
 
   return (
     <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
       {items.map((stat, index) => {
         const cardContent = (
           <Card className="group relative overflow-hidden hover:shadow-[var(--shadow-hover)] transition-all duration-300">
             <CardContent className="p-5">
               <div className="flex items-start justify-between">
                 <div className="space-y-3">
                   <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                     {stat.title}
                   </p>
                   <p className="text-4xl font-bold text-foreground tracking-tight">
                     {isLoading ? (
                       <span className="inline-block h-10 w-16 bg-muted/60 animate-pulse rounded-md" />
                     ) : (
                       stat.value
                     )}
                   </p>
                 </div>
                 <div className="w-11 h-11 rounded-xl bg-primary/8 flex items-center justify-center group-hover:bg-primary/12 transition-colors duration-300">
                   <stat.icon className="w-5 h-5 text-primary/80" />
                 </div>
               </div>
             </CardContent>
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
   );
 }
