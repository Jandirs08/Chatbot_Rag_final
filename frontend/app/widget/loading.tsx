import { Skeleton } from "@/app/components/ui/skeleton";

export default function WidgetLoading() {
  return (
    <div className="space-y-6 p-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-96" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Skeleton className="h-[480px] w-full rounded-xl" />
        <Skeleton className="h-[480px] w-full rounded-xl" />
      </div>
    </div>
  );
}
