"use client";

import React from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/app/components/ui/tooltip";

interface Props {
  content: React.ReactNode;
  children?: React.ReactNode;
}

export function HelpTooltip({ content, children }: Props) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {children ?? <span className="t-help-icon" aria-label="Más información">?</span>}
      </TooltipTrigger>
      <TooltipContent className="max-w-xs text-xs leading-relaxed" side="top">
        {content}
      </TooltipContent>
    </Tooltip>
  );
}
