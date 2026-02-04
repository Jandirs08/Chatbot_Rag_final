import * as React from "react"

import { cn } from "@/lib/utils"

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> { }

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          "flex min-h-[80px] w-full rounded-lg bg-slate-50 border border-transparent px-4 py-3 text-sm text-foreground ring-offset-background transition-all duration-150 placeholder:text-slate-400 focus-visible:outline-none focus-visible:bg-white focus-visible:border-slate-200 focus-visible:ring-2 focus-visible:ring-blue-500/20 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-slate-800 dark:text-white dark:placeholder-slate-500 dark:focus-visible:bg-slate-900 dark:focus-visible:border-slate-700 dark:focus-visible:ring-blue-400/20",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Textarea.displayName = "Textarea"

export { Textarea }
