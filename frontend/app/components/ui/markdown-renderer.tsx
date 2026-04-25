"use client";

import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

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

const components = {
  a: ({ children, ...props }: AnchorProps) => (
    <a
      {...props}
      target="_blank"
      rel="noopener noreferrer"
      className="text-blue-600 hover:underline"
    >
      {children}
    </a>
  ),
  p: ({ children, ...props }: ParaProps) => (
    <p {...props} className="mb-2 last:mb-0 whitespace-pre-wrap break-words">
      {children}
    </p>
  ),
  ul: ({ children, ...props }: ListProps) => (
    <ul {...props} className="pl-4">
      {children}
    </ul>
  ),
  ol: ({ children, ...props }: OrderedListProps) => (
    <ol {...props} className="pl-4">
      {children}
    </ol>
  ),
  table: ({ children, ...props }: TableProps) => (
    <div className="overflow-x-auto">
      <table {...props} className="w-full border-collapse">
        {children}
      </table>
    </div>
  ),
  th: ({ children, ...props }: CellProps) => (
    <th
      {...props}
      className="border border-slate-300 dark:border-slate-700 px-3 py-2 text-left bg-slate-50 dark:bg-slate-800"
    >
      {children}
    </th>
  ),
  td: ({ children, ...props }: CellProps) => (
    <td
      {...props}
      className="border border-slate-300 dark:border-slate-700 px-3 py-2"
    >
      {children}
    </td>
  ),
};

export function MarkdownRenderer({ content }: Props) {
  return (
    <ReactMarkdown
      className="prose prose-sm dark:prose-invert max-w-none break-words"
      remarkPlugins={[remarkGfm]}
      components={components}
    >
      {content}
    </ReactMarkdown>
  );
}

export default MarkdownRenderer;
