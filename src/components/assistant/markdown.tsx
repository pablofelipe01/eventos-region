"use client";

import { memo } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

const components: Components = {
  h1: ({ children }) => <h1 className="mt-4 mb-2 text-xl font-semibold first:mt-0">{children}</h1>,
  h2: ({ children }) => <h2 className="mt-4 mb-2 text-lg font-semibold first:mt-0">{children}</h2>,
  h3: ({ children }) => <h3 className="mt-3 mb-1.5 font-semibold first:mt-0">{children}</h3>,
  p: ({ children }) => <p className="my-2 leading-relaxed first:mt-0 last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="my-2 list-disc space-y-1 pl-5">{children}</ul>,
  ol: ({ children }) => <ol className="my-2 list-decimal space-y-1 pl-5">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  a: ({ children, href }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="font-medium text-emerald-700 underline underline-offset-2 hover:text-emerald-600 dark:text-emerald-400"
    >
      {children}
    </a>
  ),
  blockquote: ({ children }) => (
    <blockquote className="my-2 border-l-2 border-zinc-300 pl-3 text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-4 border-zinc-200 dark:border-zinc-800" />,
  pre: ({ children }) => (
    <pre className="my-2 overflow-x-auto rounded-lg bg-zinc-950 p-3 font-mono text-[13px] leading-relaxed text-zinc-100">
      {children}
    </pre>
  ),
  code: ({ className, children }) =>
    className ? (
      <code className={className}>{children}</code>
    ) : (
      <code className="rounded bg-zinc-200/70 px-1 py-0.5 font-mono text-[0.85em] dark:bg-zinc-800">
        {children}
      </code>
    ),
  table: ({ children }) => (
    <div className="my-2 overflow-x-auto">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border border-zinc-300 bg-zinc-100 px-2 py-1 text-left font-semibold dark:border-zinc-700 dark:bg-zinc-800">
      {children}
    </th>
  ),
  td: ({ children }) => <td className="border border-zinc-300 px-2 py-1 dark:border-zinc-700">{children}</td>,
};

export const Markdown = memo(function Markdown({ children }: { children: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
      {children}
    </ReactMarkdown>
  );
});
