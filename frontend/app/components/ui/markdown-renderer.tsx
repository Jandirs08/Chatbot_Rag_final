"use client";

import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type Props = {
  content: string;
};

export function MarkdownRenderer({ content }: Props) {
  return (
    <ReactMarkdown
      className="prose prose-sm dark:prose-invert max-w-none"
      remarkPlugins={[remarkGfm]}
      components={{
        a: (props: any) => (
          <a
            {...props}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline"
          />
        ),
        p: (props: any) => (
          <p {...props} className="mb-2 last:mb-0" />
        ),
        ul: (props: any) => (
          <ul {...props} className="pl-4" />
        ),
        ol: (props: any) => (
          <ol {...props} className="pl-4" />
        ),
        table: (props: any) => (
          <div className="overflow-x-auto">
            <table
              {...props}
              className="w-full border-collapse"
            />
          </div>
        ),
        th: (props: any) => (
          <th
            {...props}
            className="border border-slate-300 dark:border-slate-700 px-3 py-2 text-left bg-slate-50 dark:bg-slate-800"
          />
        ),
        td: (props: any) => (
          <td
            {...props}
            className="border border-slate-300 dark:border-slate-700 px-3 py-2"
          />
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

export default MarkdownRenderer;
