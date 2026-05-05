"use client";

import { Skeleton } from "@/app/components/ui/skeleton";

interface DocumentStatsCardsProps {
  documentCount: number;
  totalSize: number;
  isLoading: boolean;
  formatFileSize: (bytes: number) => string;
}

function StatItem({
  label,
  value,
  isLoading,
}: {
  label: string;
  value: string;
  isLoading: boolean;
}) {
  return (
    <div>
      {isLoading ? (
        <Skeleton className="h-7 w-20 mb-1" />
      ) : (
        <p className="font-heading text-2xl font-semibold tabular-nums text-foreground leading-none">
          {value}
        </p>
      )}
      <p className="mt-1.5 font-heading text-[10px] uppercase tracking-[0.12em] text-muted-foreground/60">
        {label}
      </p>
    </div>
  );
}

export function DocumentStatsCards({
  documentCount,
  totalSize,
  isLoading,
  formatFileSize,
}: DocumentStatsCardsProps) {
  return (
    <section className="flex flex-wrap items-end gap-x-10 gap-y-4">
      <StatItem
        label="PDFs en el sistema"
        value={String(documentCount)}
        isLoading={isLoading}
      />
      <div
        className="hidden sm:block self-stretch w-px bg-border/60 my-1"
        aria-hidden="true"
      />
      <StatItem
        label="Espacio utilizado"
        value={formatFileSize(totalSize)}
        isLoading={isLoading}
      />
    </section>
  );
}
