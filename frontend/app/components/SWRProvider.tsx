"use client";

import React from "react";
import { SWRConfig } from "swr";

export function SWRProvider({ children }: { children: React.ReactNode }) {
  return (
    <SWRConfig
      value={{
        // Coalesce identical requests fired within the same 2s window.
        dedupingInterval: 2000,
        // When users tab back, throttle the refetch storm to once per 5s.
        focusThrottleInterval: 5000,
        // Don't auto-retry HTTP errors — services raise typed ApiError already.
        shouldRetryOnError: false,
        // Keep showing previous data while a new request is in flight to avoid flicker.
        keepPreviousData: true,
      }}
    >
      {children}
    </SWRConfig>
  );
}
