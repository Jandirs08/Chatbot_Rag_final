"use client";

import * as React from "react";
import { useRef } from "react";
import { cn } from "@/lib/utils";
import { Label } from "./label";

interface ColorPickerProps {
    /** Current color value (hex) */
    value: string;
    /** Callback when color changes */
    onChange: (color: string) => void;
    /** Label for the color picker */
    label?: string;
    /** HTML id for accessibility */
    id?: string;
    /** Additional className */
    className?: string;
}

/**
 * ColorPicker - Styled color picker with circular swatch preview.
 * Features:
 * - Circular color preview with ring border
 * - Hidden native input, triggered on click
 * - Label integration
 */
const ColorPicker = React.forwardRef<HTMLDivElement, ColorPickerProps>(
    ({ value, onChange, label, id, className }, ref) => {
        const inputRef = useRef<HTMLInputElement>(null);

        const handleClick = () => {
            inputRef.current?.click();
        };

        const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
            onChange(e.target.value);
        };

        return (
            <div ref={ref} className={cn("space-y-2", className)}>
                {label && (
                    <Label htmlFor={id} className="text-sm font-medium">
                        {label}
                    </Label>
                )}

                <button
                    type="button"
                    onClick={handleClick}
                    className={cn(
                        "group flex items-center gap-3 w-full p-3 rounded-lg",
                        "bg-slate-50 dark:bg-slate-800",
                        "border border-transparent",
                        "hover:bg-slate-100 dark:hover:bg-slate-700",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20",
                        "transition-all duration-150"
                    )}
                >
                    {/* Color swatch circle */}
                    <div
                        className={cn(
                            "w-10 h-10 rounded-full",
                            "ring-2 ring-white dark:ring-slate-700",
                            "shadow-sm",
                            "transition-transform duration-150 group-hover:scale-105"
                        )}
                        style={{ backgroundColor: value }}
                    />

                    {/* Color value */}
                    <div className="flex flex-col items-start">
                        <span className="text-xs text-muted-foreground uppercase tracking-wide">
                            Color
                        </span>
                        <span className="text-sm font-mono font-medium text-foreground">
                            {value.toUpperCase()}
                        </span>
                    </div>

                    {/* Edit indicator */}
                    <div className="ml-auto">
                        <svg
                            className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                            />
                        </svg>
                    </div>
                </button>

                {/* Hidden native color input */}
                <input
                    ref={inputRef}
                    type="color"
                    id={id}
                    value={value}
                    onChange={handleChange}
                    className="sr-only"
                    aria-label={label || "Select color"}
                />
            </div>
        );
    }
);

ColorPicker.displayName = "ColorPicker";

export { ColorPicker };
