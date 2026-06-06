"use client";

import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { CodeBlock } from "@/components/ui/code-block";
import type { ReactElement } from "react";

interface MarkdownRendererProps {
  children: string;
  className?: string;
}

const PROSE_CLASSES = `
  prose prose-invert max-w-none text-sm leading-relaxed
  prose-headings:font-display prose-headings:tracking-tight
  prose-h1:text-lg prose-h2:text-base prose-h3:text-sm
  prose-p:text-[var(--forge-silver)]
  prose-code:font-mono prose-code:text-[11px] prose-code:bg-[var(--forge-surface-2)] prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:before:content-none prose-code:after:content-none
  prose-pre:bg-transparent prose-pre:border-0 prose-pre:rounded-none prose-pre:max-w-full prose-pre:overflow-visible prose-pre:p-0 prose-pre:my-0
  prose-ul:text-[var(--forge-silver)] prose-ol:text-[var(--forge-silver)]
  prose-li:my-0.5
  prose-a:text-[var(--forge-primary)] prose-a:no-underline hover:prose-a:underline
  prose-strong:text-[var(--forge-text)]
  prose-blockquote:border-l-[var(--forge-primary)] prose-blockquote:text-[var(--forge-silver)] prose-blockquote:pl-4 prose-blockquote:border-l-2
  prose-hr:border-[var(--forge-border)]
  [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-[11px]
  [&_pre]:text-[var(--forge-text)]
`;

const components: Components = {
  code({ node, ...props }) {
    const code = (node as any)?.children?.[0]?.value ?? "";
    const className = (node as any)?.properties?.className?.[0] ?? "";
    const language = className.replace("language-", "") || "typescript";
    const filename = (node as any)?.properties?.dataFilename as string | undefined;

    return <CodeBlock code={code} language={language} filename={filename} {...props} />;
  },
  pre({ node, ...props }) {
    const codeChild = (node as any)?.children?.[0];
    if (codeChild?.type === "element" && codeChild.tagName === "code") {
      const code = codeChild.children?.[0]?.value ?? "";
      const className = codeChild.properties?.className?.[0] ?? "";
      const language = className.replace("language-", "") || "typescript";
      const filename = codeChild.properties?.dataFilename as string | undefined;
      return <CodeBlock code={code} language={language} filename={filename} {...props} />;
    }
    return <pre {...props} />;
  },
};

export function MarkdownRenderer({ children, className = "" }: MarkdownRendererProps) {
  return (
    <div className={`${PROSE_CLASSES} ${className}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  );
}