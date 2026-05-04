"use client";

import React, { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  content: string;
};

type AnchorProps = React.ComponentPropsWithoutRef<"a">;
type ParaProps = React.ComponentPropsWithoutRef<"p">;
type ListProps = React.ComponentPropsWithoutRef<"ul">;
type OrderedListProps = React.ComponentPropsWithoutRef<"ol">;
type TableProps = React.ComponentPropsWithoutRef<"table">;
type CellProps = React.ComponentPropsWithoutRef<"th"> &
  React.ComponentPropsWithoutRef<"td">;
type HeadingProps = React.ComponentPropsWithoutRef<"h1">;
type QuoteProps = React.ComponentPropsWithoutRef<"blockquote">;
type CodeProps = React.ComponentPropsWithoutRef<"code">;
type PreProps = React.ComponentPropsWithoutRef<"pre">;

function extractText(node: React.ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(extractText).join("");
  if (React.isValidElement(node)) {
    const props = node.props as { children?: React.ReactNode };
    return extractText(props.children);
  }
  return "";
}

function CodeBlock({ children, className }: PreProps) {
  const [copied, setCopied] = useState(false);
  const text = extractText(children).replace(/\n$/, "");

  // Try to extract language hint from nested <code class="language-xxx">
  let lang: string | null = null;
  if (React.isValidElement(children)) {
    const childProps = children.props as { className?: string };
    const m = /language-([\w-]+)/.exec(childProps?.className ?? "");
    if (m) lang = m[1];
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="group relative my-2 overflow-hidden rounded-lg ring-1 ring-black/10">
      <div className="flex items-center justify-between gap-2 border-b border-black/5 bg-black/[0.04] px-3 py-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        <span className="min-w-0 truncate">{lang ?? "code"}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="shrink-0 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-black/5 hover:text-foreground"
          aria-label="Copiar código"
        >
          {copied ? (
            <>
              <Check className="h-3 w-3" />
              Copiado
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" />
              Copiar
            </>
          )}
        </button>
      </div>
      <pre
        className={cn(
          "m-0 overflow-x-auto bg-black/[0.03] p-3 text-[13px] leading-[1.55]",
          className,
        )}
      >
        {children}
      </pre>
    </div>
  );
}

const components = {
  a: ({ children, ...props }: AnchorProps) => (
    <a
      {...props}
      target="_blank"
      rel="noopener noreferrer"
      className="font-medium text-brand underline-offset-2 hover:underline break-all"
    >
      {children}
    </a>
  ),
  img: ({ alt, ...props }: React.ComponentPropsWithoutRef<"img">) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      alt={alt ?? ""}
      loading="lazy"
      {...props}
      className="my-2 max-w-full h-auto rounded-md ring-1 ring-black/[0.06]"
    />
  ),
  p: ({ children, ...props }: ParaProps) => (
    <p {...props} className="mb-2 last:mb-0 whitespace-pre-wrap break-words leading-[1.6]">
      {children}
    </p>
  ),
  ul: ({ children, ...props }: ListProps) => (
    <ul {...props} className="my-2 list-disc space-y-1 pl-5 last:mb-0">
      {children}
    </ul>
  ),
  ol: ({ children, ...props }: OrderedListProps) => (
    <ol {...props} className="my-2 list-decimal space-y-1 pl-5 last:mb-0">
      {children}
    </ol>
  ),
  h1: ({ children, ...props }: HeadingProps) => (
    <h1 {...props} className="mb-2 mt-1 text-base font-semibold tracking-tight">
      {children}
    </h1>
  ),
  h2: ({ children, ...props }: HeadingProps) => (
    <h2 {...props} className="mb-2 mt-2 text-[15px] font-semibold tracking-tight">
      {children}
    </h2>
  ),
  h3: ({ children, ...props }: HeadingProps) => (
    <h3 {...props} className="mb-1 mt-2 text-[14px] font-semibold tracking-tight">
      {children}
    </h3>
  ),
  blockquote: ({ children, ...props }: QuoteProps) => (
    <blockquote
      {...props}
      className="my-2 border-l-2 border-border pl-3 text-muted-foreground"
    >
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-3 border-border" />,
  code: ({ className, children, ...props }: CodeProps) => {
    // react-markdown v9 marks block code via the `language-*` className.
    const isBlock = typeof className === "string" && /^language-/.test(className);
    if (!isBlock) {
      return (
        <code
          {...props}
          className="rounded bg-black/5 px-1 py-[1px] font-mono text-[0.85em] text-foreground break-all"
        >
          {children}
        </code>
      );
    }
    return (
      <code {...props} className={cn("font-mono text-[13px]", className)}>
        {children}
      </code>
    );
  },
  pre: (props: PreProps) => <CodeBlock {...props} />,
  table: ({ children, ...props }: TableProps) => (
    <div className="my-2 overflow-x-auto">
      <table {...props} className="w-full border-collapse text-[13px]">
        {children}
      </table>
    </div>
  ),
  th: ({ children, ...props }: CellProps) => (
    <th
      {...props}
      className="border border-border bg-muted px-3 py-1.5 text-left font-medium"
    >
      {children}
    </th>
  ),
  td: ({ children, ...props }: CellProps) => (
    <td {...props} className="border border-border px-3 py-1.5">
      {children}
    </td>
  ),
};

export function MarkdownRenderer({ content }: Props) {
  return (
    <ReactMarkdown
      className="break-words"
      remarkPlugins={[remarkGfm]}
      components={components}
    >
      {content}
    </ReactMarkdown>
  );
}

export default MarkdownRenderer;
