"use client";

import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { CodeBlock } from "@/components/ui/code-block";
import { MermaidDiagram } from "@/components/chat/MermaidDiagram";
import { WireframeBlock } from "@/components/chat/WireframeBlock";
import { isChatDiagramFence } from "@/lib/chat/diagram-fences";

interface MarkdownRendererProps {
  children: string;
  className?: string;
  /** Chat assistant: sem CodeBlock de arquivo — só prosa. */
  variant?: "default" | "chat";
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

const defaultComponents: Components = {
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

function chatDiagramLanguage(className: string | undefined): string | null {
  if (!className) return null;
  const match = className.match(/language-([\w-]+)/);
  const lang = match?.[1] ?? "";
  return isChatDiagramFence(lang) ? lang.toLowerCase() : null;
}

const chatComponents: Components = {
  code({ children, className, ...props }) {
    const lang = chatDiagramLanguage(typeof className === "string" ? className : undefined);
    if (lang) return null;
    const isBlock = typeof className === "string" && className.includes("language-");
    if (isBlock) return null;
    return (
      <code
        className="font-mono text-[11px] bg-[var(--forge-surface-2)] px-1 py-0.5 rounded"
        {...props}
      >
        {children}
      </code>
    );
  },
  pre({ node, ...props }) {
    const codeChild = (node as { children?: Array<{ tagName?: string; properties?: { className?: string[] }; children?: Array<{ value?: string }> }> })?.children?.[0];
    if (codeChild?.tagName !== "code") return null;
    const className = codeChild.properties?.className?.[0] ?? "";
    const lang = chatDiagramLanguage(className);
    const code = codeChild.children?.[0]?.value ?? "";
    if (lang === "mermaid") return <MermaidDiagram chart={code} {...props} />;
    if (lang === "wireframe") return <WireframeBlock text={code} {...props} />;
    return null;
  },
};

export function MarkdownRenderer({
  children,
  className = "",
  variant = "default",
}: MarkdownRendererProps) {
  const components = variant === "chat" ? chatComponents : defaultComponents;
  return (
    <div className={`${PROSE_CLASSES} ${className}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
