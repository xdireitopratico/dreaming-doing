"use client";

import { useState, useMemo } from "react";
import { ChevronDown, ChevronRight, FileCode, Terminal, Copy, Check, ExternalLink, FolderOpen, GitMerge, BookOpen, PenTool, Edit3, Bot, Search, Globe, Eye, Plug, Zap, Key, Brain, Box, List, Code, Database, Server, Cloud, Package, Settings, Wrench, Hammer, Layers, Palette, Sparkles, AlertTriangle, CheckCircle, XCircle, Loader2 } from "lucide-react";
import { Button } from "@forge/ui";
import { getToolLabel, getToolIconName, type ToolLabel } from "@/lib/tool-labels";
import { getToolIcon } from "@/components/ui/tool-icons";
import { CodeBlock } from "@/components/ui/code-block";

interface ToolCall {
  name: string;
  args?: Record<string, unknown>;
  result?: unknown;
  error?: string;
  ok?: boolean;
  durationMs?: number;
}

interface ToolCallDetailsProps {
  tool: ToolCall;
  index: number;
  defaultOpen?: boolean;
}

const TOOL_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  FileText: FileCode,
  FilePlus: FileCode,
  FileEdit: FileCode,
  FolderOpen: FolderOpen,
  Search: Search,
  Trash2: XCircle,
  Terminal: Terminal,
  TerminalSquare: Terminal,
  GitMerge: GitMerge,
  BookOpen: BookOpen,
  PenTool: PenTool,
  Edit3: Edit3,
  Bot: Bot,
  Globe: Globe,
  Eye: Eye,
  Plug: Plug,
  Zap: Zap,
  Key: Key,
  Brain: Brain,
  Box: Box,
  List: List,
  Code: Code,
  Database: Database,
  Server: Server,
  Cloud: Cloud,
  Package: Package,
  Settings: Settings,
  Wrench: Wrench,
  Hammer: Hammer,
  Layers: Layers,
  Palette: Palette,
  Sparkles: Sparkles,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Loader2,
};

function formatArgs(args: Record<string, unknown> | undefined): string {
  if (!args) return "{}";
  try {
    return JSON.stringify(args, null, 2);
  } catch {
    return String(args);
  }
}

function formatResult(result: unknown): string {
  if (result === undefined || result === null) return "(sem resultado)";
  if (typeof result === "string") return result;
  try {
    return JSON.stringify(result, null, 2);
  } catch {
    return String(result);
  }
}

function getArgsPreview(args: Record<string, unknown> | undefined): string {
  if (!args) return "";
  const keys = Object.keys(args);
  if (keys.length === 0) return "";
  const firstKey = keys[0];
  const value = args[firstKey];
  if (typeof value === "string") {
    return `: ${value.slice(0, 60)}${value.length > 60 ? "…" : ""}`;
  }
  return `: ${firstKey}`;
}

export function ToolCallDetails({ tool, index, defaultOpen = false }: ToolCallDetailsProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const labelInfo = useMemo(() => getToolLabel(tool.name), [tool.name]);
  const IconComponent = useMemo(() => TOOL_ICONS[labelInfo.icon] ?? Box, [labelInfo.icon]);
  const isRunning = tool.ok === undefined;
  const isError = tool.ok === false;
  const isSuccess = tool.ok === true;

  return (
    <details
      className="forge-tool-call border border-[var(--forge-border)] rounded-lg bg-[var(--forge-surface-1)] overflow-hidden"
      open={isOpen}
      onToggle={() => setIsOpen(!isOpen)}
    >
      <summary className="flex items-center gap-3 p-3 cursor-pointer list-none hover:bg-[var(--forge-surface-2)] transition-colors">
        <div className={`flex items-center justify-center w-8 h-8 rounded-lg shrink-0 ${
          isRunning ? "bg-[var(--forge-primary)]/10 text-[var(--forge-primary)] animate-pulse"
          : isError ? "bg-red-500/10 text-red-400"
          : isSuccess ? "bg-emerald-500/10 text-emerald-400"
          : "bg-[var(--forge-surface-2)] text-[var(--forge-muted)]"
        }`}>
          <IconComponent className="size-4" aria-hidden="true" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-[var(--forge-text)] truncate">{labelInfo.label}</span>
            <span className="px-1.5 py-0.5 text-[9px] font-medium uppercase rounded bg-[var(--forge-surface-2)] border border-[var(--forge-border)] text-[var(--forge-muted)]">
              {labelInfo.category}
            </span>
            {tool.durationMs && (
              <span className="text-[10px] font-mono text-[var(--forge-ghost)]">
                {tool.durationMs}ms
              </span>
            )}
          </div>
          {tool.args && (
            <p className="text-[11px] text-[var(--forge-muted)] font-mono truncate">
              {getArgsPreview(tool.args)}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {isRunning && <Loader2 className="size-4 animate-spin text-[var(--forge-primary)]" />}
          {isSuccess && <CheckCircle className="size-4 text-emerald-400" />}
          {isError && <XCircle className="size-4 text-red-400" />}
          <ChevronDown
            className={`size-4 text-[var(--forge-muted)] transition-transform ${isOpen ? "rotate-180" : ""}`}
            aria-hidden="true"
          />
        </div>
      </summary>

      <div className="forge-tool-call-content border-t border-[var(--forge-border)] p-3 space-y-3 animate-slide-down">
        {tool.args && Object.keys(tool.args).length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-medium text-[var(--forge-silver)]">Argumentos</span>
              <Button variant="ghost" size="sm" onClick={() => navigator.clipboard.writeText(formatArgs(tool.args))} className="h-6 px-2">
                <Copy className="size-3" />
              </Button>
            </div>
            <CodeBlock code={formatArgs(tool.args)} language="json" showLineNumbers={false} maxHeight="200px" />
          </div>
        )}

        {(tool.result !== undefined || tool.error) && (
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-medium text-[var(--forge-silver)]">
                {tool.error ? "Erro" : "Resultado"}
              </span>
              <Button variant="ghost" size="sm" onClick={() => navigator.clipboard.writeText(formatResult(tool.error ?? tool.result))} className="h-6 px-2">
                <Copy className="size-3" />
              </Button>
            </div>
            <CodeBlock
              code={formatResult(tool.error ?? tool.result)}
              language={tool.error ? "text" : "json"}
              showLineNumbers={false}
              maxHeight="300px"
            />
          </div>
        )}

        {!tool.args && !tool.result && !tool.error && !isRunning && (
          <p className="text-[11px] text-[var(--forge-ghost)] text-center py-4">
            {isRunning ? "Executando…" : "Sem detalhes disponíveis"}
          </p>
        )}
      </div>
    </details>
  );
}

export function ToolCallList({ tools, title = "Ferramentas", defaultOpenFirst = false }: { tools: ToolCall[]; title?: string; defaultOpenFirst?: boolean }) {
  if (!tools.length) return null;

  return (
    <div className="forge-tool-call-list space-y-2">
      <h4 className="text-[11px] font-medium uppercase tracking-wider text-[var(--forge-muted)] mb-2">
        {title} ({tools.length})
      </h4>
      {tools.map((tool, i) => (
        <ToolCallDetails key={`${tool.name}-${i}`} tool={tool} index={i} defaultOpen={defaultOpenFirst && i === 0} />
      ))}
    </div>
  );
}