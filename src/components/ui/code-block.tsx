"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Copy, Check, FileCode, X } from "lucide-react";
import { Button } from "@forge/ui";

const LANGUAGE_ALIASES: Record<string, string> = {
  tsx: "tsx",
  ts: "typescript",
  jsx: "jsx",
  js: "javascript",
  json: "json",
  css: "css",
  scss: "scss",
  html: "html",
  xml: "xml",
  md: "markdown",
  mdx: "mdx",
  py: "python",
  rs: "rust",
  go: "go",
  java: "java",
  kt: "kotlin",
  swift: "swift",
  rb: "ruby",
  php: "php",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  fish: "bash",
  yml: "yaml",
  yaml: "yaml",
  toml: "toml",
  ini: "ini",
  cfg: "ini",
  conf: "ini",
  dockerfile: "dockerfile",
  dockerignore: "dockerfile",
  gitignore: "gitignore",
  env: "bash",
  sql: "sql",
  graphql: "graphql",
  gql: "graphql",
  proto: "protobuf",
  vue: "vue",
  svelte: "svelte",
  astro: "astro",
};

export interface CodeBlockProps {
  code: string;
  language?: string;
  filename?: string;
  showLineNumbers?: boolean;
  maxHeight?: string;
  theme?: "dark" | "light";
}

function extractFilenameFromCode(code: string): string | null {
  const firstLine = code.split("\n")[0]?.trim();
  if (firstLine?.startsWith("// ") || firstLine?.startsWith("# ") || firstLine?.startsWith("/* ")) {
    const match = firstLine.match(/[\/\#\*]?\s*([\w\-\.\/]+\.\w+)/);
    if (match) return match[1];
  }
  return null;
}

function detectLanguage(code: string, filename?: string): string {
  if (filename) {
    const ext = filename.split(".").pop()?.toLowerCase();
    if (ext && LANGUAGE_ALIASES[ext]) return LANGUAGE_ALIASES[ext];
  }
  const firstLine = code.split("\n")[0]?.trim();
  if (firstLine?.startsWith("#!")) {
    const match = firstLine.match(/#!\/?.*\b(\w+)/);
    if (match && LANGUAGE_ALIASES[match[1]]) return LANGUAGE_ALIASES[match[1]];
  }
  return "typescript";
}

export function CodeBlock({ code, language, filename, showLineNumbers = true, maxHeight = "400px", theme = "dark" }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [detectedLang, setDetectedLang] = useState<string>("");
  const [detectedFilename, setDetectedFilename] = useState<string | null>(null);
  const preRef = useRef<HTMLPreElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const lang = language ?? detectLanguage(code, filename);
    setDetectedLang(lang);
    if (!filename) {
      const fn = extractFilenameFromCode(code);
      if (fn) setDetectedFilename(fn);
    }
  }, [code, language, filename]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback for older browsers
      const textarea = document.createElement("textarea");
      textarea.value = code;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [code]);

  const lines = code.split("\n");
  const lineCount = lines.length;
  const showNumbers = showLineNumbers && lineCount > 1;
  const displayFilename = filename ?? detectedFilename;
  const displayLang = language ?? detectedLang;

  return (
    <div
      ref={wrapperRef}
      className="forge-code-block group relative rounded-lg border border-[var(--forge-border)] bg-[var(--forge-surface-1)] overflow-hidden"
      data-language={displayLang}
    >
      <div className="flex items-center justify-between gap-2 p-2 bg-[var(--forge-surface-2)] border-b border-[var(--forge-border)]">
        <div className="flex items-center gap-2 min-w-0">
          <FileCode className="size-3.5 text-[var(--forge-muted)] shrink-0" aria-hidden="true" />
          {displayFilename ? (
            <span className="truncate text-xs font-mono text-[var(--forge-silver)]">{displayFilename}</span>
          ) : (
            <span className="text-xs text-[var(--forge-ghost)]">arquivo</span>
          )}
          <span className="px-1.5 py-0.5 text-[10px] font-medium uppercase rounded bg-[var(--forge-surface-1)] border border-[var(--forge-border)] text-[var(--forge-muted)]">
            {displayLang.toUpperCase()}
          </span>
          {lineCount > 50 && (
            <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-[var(--forge-surface-1)] border border-[var(--forge-border)] text-[var(--forge-muted)]">
              {lineCount} linhas
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCopy}
            aria-label={copied ? "Copiado!" : "Copiar código"}
            className="opacity-0 group-hover:opacity-100 transition-opacity h-7 px-2"
          >
            {copied ? (
              <Check className="size-3.5 text-[var(--forge-primary)]" />
            ) : (
              <Copy className="size-3.5" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
            aria-label={isExpanded ? "Recolher" : "Expandir"}
            className="opacity-0 group-hover:opacity-100 transition-opacity h-7 px-2"
          >
            {isExpanded ? <X className="size-3.5" /> : <span className="text-[10px]">⛶</span>}
          </Button>
        </div>
      </div>

      <pre
        ref={preRef}
        className={`forge-code-block-pre font-mono text-[11px] leading-relaxed overflow-x-auto ${
          isExpanded ? "max-h-none" : `max-h-[${maxHeight}]`
        }`}
        style={{
          backgroundColor: theme === "dark" ? "var(--forge-surface-1)" : "var(--forge-surface-2)",
          color: theme === "dark" ? "var(--forge-text)" : "var(--forge-text)",
        }}
      >
        {showNumbers && (
          <div
            className="forge-line-numbers select-none pr-3 border-r border-[var(--forge-border)] bg-[var(--forge-surface-2)] text-[var(--forge-ghost)]"
            aria-hidden="true"
          >
            {lines.map((_, i) => (
              <div key={i} className="h-4 leading-[1.375]">
                {i + 1}
              </div>
            ))}
          </div>
        )}
        <code className={`forge-code-block-code block p-3 ${showNumbers ? "pl-0" : ""}`}>
          {lines.map((line, i) => (
            <div key={i} className="h-4 leading-[1.375]">
              {line || " "}
            </div>
          ))}
        </code>
      </pre>

      {isExpanded && (
        <div className="absolute inset-0 bg-black/50 z-50 flex items-center justify-center pointer-events-none">
          <div className="bg-[var(--forge-surface-1)] border border-[var(--forge-border)] rounded-lg p-4 max-w-[90vw] max-h-[90vh] overflow-auto pointer-events-auto">
            <div className="flex items-center justify-between mb-2">
              <span className="font-medium">Modo expandido — ESC para fechar</span>
              <Button variant="ghost" size="sm" onClick={() => setIsExpanded(false)}>
                <X className="size-4" />
              </Button>
            </div>
            <pre className="font-mono text-[12px] leading-relaxed overflow-auto max-h-[70vh]">
              <code>{code}</code>
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

export function CodeBlockWithHighlight({ children, ...props }: Omit<CodeBlockProps, "code"> & { children: React.ReactNode }) {
  const code = typeof children === "string" ? children : String(children);
  return <CodeBlock code={code} {...props} />;
}