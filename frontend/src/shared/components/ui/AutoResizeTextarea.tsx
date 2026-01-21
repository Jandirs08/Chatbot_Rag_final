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
        "flex min-h-[48px] w-full rounded-[20px] border border-input bg-background px-4 py-2.5 text-base ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none dark:bg-slate-800 dark:text-white dark:border-slate-700 dark:placeholder-slate-500 shadow-[0_4px_8px_rgba(0,0,0,0.08)]",
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
