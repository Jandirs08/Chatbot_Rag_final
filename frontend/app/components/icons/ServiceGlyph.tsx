"use client";

import Image from "next/image";
import React from "react";
import { cn } from "@/lib/utils";

type ServiceGlyphName = "mongodb" | "redis" | "qdrant" | "rag";

const GLYPH_SRC: Record<ServiceGlyphName, string> = {
  mongodb: "/assets/observability/services/obs-mongodb-control.png",
  redis: "/assets/observability/services/obs-redis-control.png",
  qdrant: "/assets/observability/services/obs-qdrant-control.png",
  rag: "/assets/observability/services/obs-rag-control.png",
};

export function ServiceGlyph({
  name,
  className,
}: {
  name: ServiceGlyphName;
  className?: string;
}) {
  return (
    <Image
      src={GLYPH_SRC[name]}
      alt=""
      aria-hidden
      width={56}
      height={56}
      className={cn("h-14 w-14 shrink-0 object-contain", className)}
    />
  );
}
