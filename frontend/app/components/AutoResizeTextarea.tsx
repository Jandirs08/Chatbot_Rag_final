import ResizeTextarea from "react-textarea-autosize";
import React from "react";
import { cn } from "../lib/utils";
import type { TextareaAutosizeProps } from "react-textarea-autosize";

interface AutoResizeTextareaProps extends TextareaAutosizeProps {}

export const AutoResizeTextarea = React.forwardRef<
  HTMLTextAreaElement,
  AutoResizeTextareaProps
>(({ className, maxRows, ...props }, ref) => {
  return (
    <ResizeTextarea
      className={cn(
        "flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none dark:bg-slate-800 dark:text-white dark:border-slate-700 dark:placeholder-slate-500",
        className
      )}
      ref={ref}
      maxRows={maxRows}
      {...props}
    />
  );
});

AutoResizeTextarea.displayName = "AutoResizeTextarea";
