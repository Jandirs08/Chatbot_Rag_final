 import { Skeleton } from "./components/ui/skeleton";
 
 export default function Loading() {
   return (
     <div className="space-y-10 w-full p-4">
       <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
         <div className="space-y-4">
           <div className="space-y-2">
             <Skeleton className="h-8 w-48" />
             <Skeleton className="h-4 w-96" />
           </div>
           <div className="flex items-center gap-3">
             <Skeleton className="h-6 w-40" />
             <Skeleton className="h-4 w-32" />
           </div>
         </div>
         <div className="flex items-center gap-2.5">
           <Skeleton className="h-9 w-32" />
           <Skeleton className="h-9 w-28" />
         </div>
       </div>
 
       <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
         <Skeleton className="h-28 w-full" />
         <Skeleton className="h-28 w-full" />
         <Skeleton className="h-28 w-full" />
       </section>
 
       <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
         <div className="lg:col-span-2 space-y-4">
           <div className="flex items-center justify-between">
             <Skeleton className="h-6 w-40" />
             <Skeleton className="h-6 w-24" />
           </div>
           <Skeleton className="h-[280px] w-full" />
         </div>
         <div className="lg:col-span-1 space-y-2">
           <Skeleton className="h-6 w-40" />
           <div className="space-y-2">
             <Skeleton className="h-14 w-full" />
             <Skeleton className="h-14 w-full" />
             <Skeleton className="h-14 w-full" />
           </div>
         </div>
       </section>
     </div>
   );
 }
