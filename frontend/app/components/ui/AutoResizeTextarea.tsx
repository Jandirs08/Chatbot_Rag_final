import ResizeTextarea from "react-textarea-autosize";
import React from "react";
import { cn } from "@/lib/utils";
import type { TextareaAutosizeProps } from "react-textarea-autosize";

interface AutoResizeTextareaProps extends TextareaAutosizeProps {}

export const AutoResizeTextarea = React.forwardRef<
  HTMLTextAreaElement,
  AutoResizeTextareaProps
>(({ className, maxRows = 6, minRows = 1, ...props }, ref) => {
  return (
    <ResizeTextarea
      className={cn(
        // Sólo layout y accesibilidad como base — el contenedor padre define la forma visual
        "flex w-full resize-none bg-transparent px-0 py-0 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-0 disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      ref={ref}
      maxRows={maxRows}
      minRows={minRows}
      {...props}
    />
  );
});

AutoResizeTextarea.displayName = "AutoResizeTextarea";
