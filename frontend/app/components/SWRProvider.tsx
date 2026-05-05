"use client";

import React from "react";
import { SWRConfig } from "swr";

export function SWRProvider({ children }: { children: React.ReactNode }) {
  return (
    <SWRConfig
      value={{
        dedupingInterval: 2000,
        focusThrottleInterval: 5000,
        // Retry once on transient 5xx / network errors. Skip 4xx (auth/perm/validation).
        shouldRetryOnError: (err: unknown) => {
          const status = (err as { status?: number })?.status;
          if (typeof status === "number" && status >= 400 && status < 500) return false;
          return true;
        },
        errorRetryCount: 1,
        errorRetryInterval: 1500,
        keepPreviousData: true,
      }}
    >
      {children}
    </SWRConfig>
  );
}
