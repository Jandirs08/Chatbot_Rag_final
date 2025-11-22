"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export const SidebarHeader = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div">
>(({ className, ...props }, ref) => {
  return (
    <div
      ref={ref}
      data-sidebar="header"
      className={cn(
        "flex flex-col",
        "transition-all duration-300 ease-in-out",
        "group-data-[state=collapsed]/sidebar:opacity-0 group-data-[state=collapsed]/sidebar:h-0 group-data-[state=collapsed]/sidebar:overflow-hidden group-data-[state=collapsed]/sidebar:p-0 group-data-[state=collapsed]/sidebar:gap-0 group-data-[state=collapsed]/sidebar:pointer-events-none",
        "group-data-[state=expanded]/sidebar:p-2 group-data-[state=expanded]/sidebar:gap-2",
        className,
      )}
      {...props}
    />
  );
});
SidebarHeader.displayName = "SidebarHeader";