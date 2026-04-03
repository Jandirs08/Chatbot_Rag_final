"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface BrowserMockupProps extends React.HTMLAttributes<HTMLDivElement> {
    /** Optional URL to display in the address bar */
    url?: string;
}

/**
 * BrowserMockup - A container that looks like a minimalist browser window.
 * Features:
 * - Traffic light dots (red, yellow, green)
 * - position: relative + overflow: hidden to contain absolute children
 * - Subtle dot pattern background
 */
const BrowserMockup = React.forwardRef<HTMLDivElement, BrowserMockupProps>(
    ({ className, url = "yourwebsite.com", children, ...props }, ref) => {
        return (
            <div
                ref={ref}
                className={cn(
                    "relative overflow-hidden rounded-xl border border-border/50 bg-white dark:bg-slate-900 shadow-lg",
                    className
                )}
                {...props}
            >
                <div className="sticky top-0 z-10 flex items-center gap-3 px-4 py-3 bg-slate-100 dark:bg-slate-800 border-b border-border/30">
                    {/* Traffic Light Dots */}
                    <div className="flex items-center gap-1.5">
                        <div className="w-3 h-3 rounded-full bg-red-400 hover:bg-red-500 transition-colors" />
                        <div className="w-3 h-3 rounded-full bg-yellow-400 hover:bg-yellow-500 transition-colors" />
                        <div className="w-3 h-3 rounded-full bg-green-400 hover:bg-green-500 transition-colors" />
                    </div>

                    {/* Address Bar */}
                    <div className="flex-1 flex justify-center">
                        <div className="flex items-center gap-2 px-4 py-1.5 bg-white dark:bg-slate-700 rounded-lg border border-border/30 text-xs text-muted-foreground min-w-[200px] max-w-[300px]">
                            <svg
                                className="w-3 h-3 text-green-500"
                                fill="currentColor"
                                viewBox="0 0 20 20"
                            >
                                <path
                                    fillRule="evenodd"
                                    d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z"
                                    clipRule="evenodd"
                                />
                            </svg>
                            <span className="truncate">{url}</span>
                        </div>
                    </div>

                    {/* Spacer for balance */}
                    <div className="w-[52px]" />
                </div>

                <div
                    className="w-full h-full overflow-y-auto"
                    style={{
                        backgroundImage: `radial-gradient(circle, hsl(var(--muted-foreground) / 0.1) 1px, transparent 1px)`,
                        backgroundSize: '20px 20px',
                        backgroundColor: 'hsl(var(--muted) / 0.3)'
                    }}
                >
                    <div className="relative min-h-full w-full p-8 pb-56">
                        {children}
                    </div>
                </div>
            </div>
        );
    }
);

BrowserMockup.displayName = "BrowserMockup";

export { BrowserMockup };
