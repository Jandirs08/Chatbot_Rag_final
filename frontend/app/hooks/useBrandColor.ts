"use client";

import { useEffect, useMemo } from "react";
import useSWR from "swr";
import { getPublicBotConfig } from "@/app/lib/services/botConfigService";

// Helper para determinar si un color es claro u oscuro
export function isLightColor(hexColor: string) {
  const hex = hexColor.replace("#", "");
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  // Fórmula de luminosidad relativa (YIQ)
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 128;
}

export function useBrandColor() {
  const { data: config, isLoading } = useSWR(
    "public-bot-config",
    getPublicBotConfig,
    {
      revalidateOnFocus: false,
      dedupingInterval: 60000, // Evitar fetches excesivos
    }
  );

  useEffect(() => {
    if (config?.theme_color) {
      try {
        document.documentElement.style.setProperty(
          "--brand-color",
          config.theme_color
        );
      } catch (e) {
        console.error("Error setting brand color:", e);
      }
    }
  }, [config?.theme_color]);

  const isThemeLight = useMemo(() => {
    if (!config?.theme_color) return false;
    try {
      return isLightColor(config.theme_color);
    } catch {
      return false;
    }
  }, [config?.theme_color]);

  return {
    config,
    isLoading,
    isThemeLight,
    brandColor: config?.theme_color,
  };
}
