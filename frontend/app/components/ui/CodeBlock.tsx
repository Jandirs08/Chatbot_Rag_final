"use client";

import * as React from "react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Copy, Check } from "lucide-react";

interface CodeBlockProps extends React.HTMLAttributes<HTMLDivElement> {
    /** The code content to display */
    code: string;
    /** Optional language label (e.g., "HTML", "JavaScript") */
    language?: string;
    /** Callback when code is copied */
    onCopy?: () => void;
    /** Show line numbers */
    showLineNumbers?: boolean;
}

/**
 * CodeBlock - VS Code-style code display component.
 * Features:
 * - Dark theme background (#1e293b / slate-800)
 * - Monospace font
 * - Integrated copy button (top-right)
 * - Optional line numbers
 */
const CodeBlock = React.forwardRef<HTMLDivElement, CodeBlockProps>(
    ({
        className,
        code,
        language = "HTML",
        onCopy,
        showLineNumbers = false,
        ...props
    }, ref) => {
        const [copied, setCopied] = useState(false);

        const handleCopy = async () => {
            try {
                await navigator.clipboard.writeText(code);
                setCopied(true);
                onCopy?.();
                setTimeout(() => setCopied(false), 2000);
            } catch (err) {
                console.error("Failed to copy:", err);
            }
        };

        const lines = code.split('\n');

        return (
            <div
                ref={ref}
                className={cn(
                    "relative rounded-xl overflow-hidden",
                    "bg-slate-900 dark:bg-slate-950",
                    "border border-slate-700/50",
                    "shadow-lg",
                    className
                )}
                {...props}
            >
                {/* Header bar */}
                <div className="flex items-center justify-between px-4 py-2 bg-slate-800 dark:bg-slate-900 border-b border-slate-700/50">
                    <div className="flex items-center gap-2">
                        {/* File dots */}
                        <div className="flex gap-1.5">
                            <div className="w-2.5 h-2.5 rounded-full bg-slate-600" />
                            <div className="w-2.5 h-2.5 rounded-full bg-slate-600" />
                            <div className="w-2.5 h-2.5 rounded-full bg-slate-600" />
                        </div>
                        {/* Language badge */}
                        <span className="ml-2 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-slate-400 bg-slate-700/50 rounded">
                            {language}
                        </span>
                    </div>

                    {/* Copy button */}
                    <button
                        onClick={handleCopy}
                        className={cn(
                            "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium",
                            "transition-all duration-200",
                            copied
                                ? "bg-green-500/20 text-green-400"
                                : "bg-slate-700/50 text-slate-400 hover:bg-slate-700 hover:text-slate-200"
                        )}
                    >
                        {copied ? (
                            <>
                                <Check className="w-3.5 h-3.5" />
                                <span>Copiado</span>
                            </>
                        ) : (
                            <>
                                <Copy className="w-3.5 h-3.5" />
                                <span>Copiar</span>
                            </>
                        )}
                    </button>
                </div>

                {/* Code content */}
                <div className="overflow-x-auto">
                    <pre className="p-4 text-sm font-mono leading-relaxed">
                        <code className="text-slate-200">
                            {showLineNumbers ? (
                                lines.map((line, index) => (
                                    <div key={index} className="flex">
                                        <span className="select-none text-slate-600 text-right pr-4 min-w-[2.5rem]">
                                            {index + 1}
                                        </span>
                                        <span className="flex-1 whitespace-pre-wrap break-all">{line || ' '}</span>
                                    </div>
                                ))
                            ) : (
                                <span className="whitespace-pre-wrap break-all">{code}</span>
                            )}
                        </code>
                    </pre>
                </div>
            </div>
        );
    }
);

CodeBlock.displayName = "CodeBlock";

export { CodeBlock };
