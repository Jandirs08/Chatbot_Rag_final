"use client";

import { useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

export function useUnsavedChanges(isDirty: boolean) {
  const router = useRouter();

  // 1. Handle browser refresh/close (Native behavior)
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  // 2. Handle global link clicks
  useEffect(() => {
    const handleAnchorClick = (e: MouseEvent) => {
      if (!isDirty) return;

      const target = e.target as HTMLElement;
      const anchor = target.closest("a");

      if (anchor) {
        const href = anchor.getAttribute("href");
        if (
          !href ||
          href.startsWith("#") ||
          href.startsWith("mailto:") ||
          href.startsWith("tel:") ||
          anchor.target === "_blank"
        ) {
          return;
        }

        // Native confirm dialog
        const confirmed = window.confirm(
          "¿Tienes cambios sin guardar? Si continúas, perderás los cambios.",
        );

        if (!confirmed) {
          e.preventDefault();
          e.stopPropagation();
        }
        // If confirmed, allow the default action (navigation)
      }
    };

    document.addEventListener("click", handleAnchorClick, true);
    return () => document.removeEventListener("click", handleAnchorClick, true);
  }, [isDirty]);

  // 3. Helper for internal logic (like Tabs)
  const checkUnsavedChanges = useCallback(
    (callback: () => void) => {
      if (isDirty) {
        const confirmed = window.confirm(
          "¿Tienes cambios sin guardar? Si continúas, perderás los cambios.",
        );
        if (confirmed) {
          callback();
        }
      } else {
        callback();
      }
    },
    [isDirty],
  );

  return { checkUnsavedChanges };
}
