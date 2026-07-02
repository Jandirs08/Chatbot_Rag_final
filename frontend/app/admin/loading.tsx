import { Skeleton } from "@/app/components/ui/skeleton";
import { AdminPageShell } from "./_components/AdminPageShell";

export default function AdminLoading() {
  return (
    <AdminPageShell>
      <div className="flex h-full flex-col overflow-hidden rounded-[28px] border border-border/60 bg-card">
        <div className="border-b border-border/60 px-6 py-4">
          <div className="flex items-center justify-between">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-9 w-28" />
          </div>
        </div>
        <div className="flex flex-1 min-h-0">
          <div className="w-full md:w-[400px] flex-none border-r border-border/60 p-3 space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="rounded-2xl border border-border/50 bg-background px-4 py-3"
              >
                <div className="flex gap-3">
                  <Skeleton className="h-11 w-11 rounded-2xl" />
                  <div className="space-y-2 flex-1">
                    <Skeleton className="h-4 w-28" />
                    <Skeleton className="h-3 w-2/3" />
                    <Skeleton className="h-5 w-24 rounded-full" />
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="hidden md:flex flex-1 items-center justify-center">
            <Skeleton className="h-32 w-32 rounded-2xl" />
          </div>
        </div>
      </div>
    </AdminPageShell>
  );
}
