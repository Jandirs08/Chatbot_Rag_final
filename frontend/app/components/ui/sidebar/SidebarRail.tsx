"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { useSidebar } from "./context";

type SidebarRailRef = React.ForwardedRef<HTMLButtonElement>;

export const SidebarRail = React.forwardRef<
  HTMLButtonElement,
  React.ComponentProps<"button">
>(({ className, ...props }, ref: SidebarRailRef) => {
  const { toggleSidebar } = useSidebar();

  return (
    <button
      ref={ref}
      data-sidebar="rail"
      aria-label="Toggle Sidebar"
      tabIndex={-1}
      onClick={toggleSidebar}
      title="Toggle Sidebar"
      className={cn("hidden", className)}
      {...props}
    />
  );
});
SidebarRail.displayName = "SidebarRail";