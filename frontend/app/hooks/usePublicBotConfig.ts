"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { getPublicBotConfig } from "@/app/lib/services/botConfigService";

/**
 * Determina si un color hex es claro (para decidir contraste de texto).
 */
function isLightColor(hexColor: string): boolean {
  const hex = hexColor.replace("#", "");
  if (hex.length < 6) return true;
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 128;
}

const SWR_KEY = "public-bot-config";

/**
 * Hook centralizado para obtener la configuración pública del bot.
 *
 * - Una sola clave SWR para compartir caché entre todos los consumidores.
 * - Aplica el CSS custom property `--brand-color` al montar/cambiar.
 * - Retorna datos derivados listos para usar (nunca undefined — usa defaults).
 */
export function usePublicBotConfig() {
  const { data: cfg, isLoading } = useSWR(SWR_KEY, getPublicBotConfig);
  const [isThemeLight, setIsThemeLight] = useState(true);

  useEffect(() => {
    if (!cfg?.theme_color) return;
    try {
      document.documentElement.style.setProperty(
        "--brand-color",
        cfg.theme_color,
      );
      setIsThemeLight(isLightColor(cfg.theme_color));
    } catch {
      // Silencioso — no bloquear por un color inválido.
    }
  }, [cfg?.theme_color]);

  return {
    cfg: cfg ?? null,
    isLoading,
    isThemeLight,
    botName: cfg?.bot_name || undefined,
    inputPlaceholder: cfg?.input_placeholder || "Escribe tu mensaje...",
    starters: Array.isArray(cfg?.starters) ? (cfg.starters as string[]) : [],
  };
}
