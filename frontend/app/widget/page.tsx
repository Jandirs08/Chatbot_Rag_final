"use client";
import { Suspense, lazy } from "react";
import { Layout } from "@/app/components/Layout";
import { Skeleton } from "@/app/components/ui/skeleton";
import { useRequireAuth } from "../hooks";

// Lazy loading del componente WidgetPreview
const WidgetPreview = lazy(() => 
  import("@/app/components/WidgetPreview").then(module => ({
    default: module.WidgetPreview
  }))
);

// Componente de loading para WidgetPreview
function WidgetPreviewSkeleton() {
  return (
    <div className="space-y-6 p-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96" />
      </div>
      
      {/* Configuration section skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div className="border rounded-lg p-6">
            <Skeleton className="h-6 w-48 mb-4" />
            <div className="space-y-3">
              <div>
                <Skeleton className="h-4 w-24 mb-2" />
                <Skeleton className="h-10 w-full" />
              </div>
              <div>
                <Skeleton className="h-4 w-32 mb-2" />
                <Skeleton className="h-10 w-full" />
              </div>
              <div>
                <Skeleton className="h-4 w-28 mb-2" />
                <Skeleton className="h-10 w-full" />
              </div>
            </div>
          </div>
          
          <div className="border rounded-lg p-6">
            <Skeleton className="h-6 w-32 mb-4" />
            <Skeleton className="h-32 w-full" />
          </div>
        </div>
        
        {/* Preview section skeleton */}
        <div className="border rounded-lg p-6">
          <Skeleton className="h-6 w-32 mb-4" />
          <div className="bg-gray-100 rounded-lg p-4 h-96">
            <Skeleton className="h-full w-full" />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Widget() {
  const { isAuthorized } = useRequireAuth();
  if (!isAuthorized) return null;

  return (
    <Layout>
      <Suspense fallback={<WidgetPreviewSkeleton />}>
        <WidgetPreview />
      </Suspense>
    </Layout>
  );
}
