"use client";

import { useState, useEffect, useCallback } from "react";

const THEME_KEY = "theme";

function applyTheme(dark: boolean, forcedLight?: boolean): void {
  if (typeof document === "undefined") return;
  if (forcedLight) {
    document.documentElement.classList.remove("dark");
  } else {
    document.documentElement.classList.toggle("dark", dark);
  }
}

function readStoredIsDark(): boolean {
  try {
    return typeof window !== "undefined"
      ? localStorage.getItem(THEME_KEY) === "dark"
      : false;
  } catch {
    return false;
  }
}

export function useTheme(forcedLight?: boolean) {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const dark = readStoredIsDark();
    setIsDark(forcedLight ? false : dark);
    applyTheme(dark, forcedLight);
  }, [forcedLight]);

  const toggle = useCallback(() => {
    if (forcedLight) return;
    const next = !document.documentElement.classList.contains("dark");
    applyTheme(next);
    try {
      localStorage.setItem(THEME_KEY, next ? "dark" : "light");
    } catch {
      // ignore
    }
    setIsDark(next);
  }, [forcedLight]);

  return { isDark, toggle };
}
