"use client";

import { Suspense, lazy } from "react";
import { Skeleton } from "../components/ui/skeleton";
import { useRequireAuth } from "../hooks";

// Lazy loading del componente DocumentManagement
const DocumentManagement = lazy(() => 
  import("../components/DocumentManagement").then(module => ({
    default: module.DocumentManagement
  }))
);

// Componente de loading para DocumentManagement
function DocumentManagementSkeleton() {
  return (
    <div className="space-y-6 p-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96" />
      </div>
      
      {/* Upload area skeleton */}
      <div className="border-2 border-dashed rounded-lg p-8">
        <Skeleton className="h-12 w-12 mx-auto mb-4" />
        <Skeleton className="h-6 w-48 mx-auto mb-2" />
        <Skeleton className="h-4 w-64 mx-auto" />
      </div>
      
      {/* Stats cards skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="border rounded-lg p-6">
          <Skeleton className="h-4 w-32 mb-2" />
          <Skeleton className="h-8 w-16 mb-1" />
          <Skeleton className="h-3 w-24" />
        </div>
        <div className="border rounded-lg p-6">
          <Skeleton className="h-4 w-32 mb-2" />
          <Skeleton className="h-8 w-24 mb-1" />
          <Skeleton className="h-3 w-28" />
        </div>
      </div>
      
      {/* Table skeleton */}
      <div className="border rounded-lg">
        <div className="p-6 border-b">
          <Skeleton className="h-6 w-48 mb-2" />
          <Skeleton className="h-4 w-80" />
        </div>
        <div className="p-6">
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-4 w-4" />
                  <Skeleton className="h-4 w-40" />
                </div>
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-8 w-20" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Documents() {
  // Proteger la ruta - sin UI de loading; middleware hará redirect si no hay token
  const { isAuthorized } = useRequireAuth();
  if (!isAuthorized) return null;

  return (
    <Suspense fallback={<DocumentManagementSkeleton />}>
      <DocumentManagement />
    </Suspense>
  );
}
