"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { SidebarRail } from "./SidebarRail";
import { useSidebar, SIDEBAR_WIDTH, SIDEBAR_WIDTH_ICON, SIDEBAR_WIDTH_MOBILE } from "./context";

type SidebarRef = React.ForwardedRef<HTMLDivElement>;

export const Sidebar = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div"> & {
    side?: "left" | "right";
    variant?: "sidebar" | "floating" | "inset";
    collapsible?: "offcanvas" | "icon" | "none";
  }
>(
  (
    {
      side = "left",
      variant = "sidebar",
      collapsible = "offcanvas",
      className,
      children,
      ...props
    },
    ref: SidebarRef,
  ) => {
    const { isMobile, state, openMobile, setOpenMobile } = useSidebar();

    if (collapsible === "none") {
      return (
        <div
          ref={ref}
          className={cn(
            "flex h-full w-[--sidebar-width] flex-col bg-sidebar text-sidebar-foreground dark:bg-slate-900 dark:border-r dark:border-slate-800 dark:text-slate-400",
            className,
          )}
          {...props}
        >
          {children}
        </div>
      );
    }

    if (isMobile) {
      return (
        <Sheet open={openMobile} onOpenChange={setOpenMobile} {...props}>
          <SheetContent
            data-sidebar="sidebar"
            data-mobile="true"
            className="z-[60] w-[--sidebar-width] bg-sidebar p-0 text-sidebar-foreground [&>button]:hidden dark:bg-slate-900 dark:border-r dark:border-slate-800 dark:text-slate-400"
            style={{ "--sidebar-width": SIDEBAR_WIDTH_MOBILE } as React.CSSProperties}
            side={side}
          >
            <div className="flex h-full w-full flex-col">{children}</div>
          </SheetContent>
        </Sheet>
      );
    }

    return (
      <div
        ref={ref}
        data-sidebar="sidebar"
        data-state={state}
        data-variant={variant}
        data-collapsible={collapsible}
        data-side={side}
        className={cn(
          "group relative flex h-full w-[--sidebar-width] flex-col bg-sidebar text-sidebar-foreground transition-[width] duration-300 ease-in-out dark:bg-slate-900 dark:border-r dark:border-slate-800 dark:text-slate-400",
          state === "collapsed" && "w-[--sidebar-width-icon] overflow-hidden",
          className,
        )}
        style={{
          "--sidebar-width": SIDEBAR_WIDTH,
          "--sidebar-width-icon": SIDEBAR_WIDTH_ICON,
        } as React.CSSProperties}
        {...props}
      >
        {children}
        <SidebarRail />
      </div>
    );
  },
);
Sidebar.displayName = "Sidebar";
