// AgentMemoryViewer.tsx — Painel que mostra o contexto atual do agente
// Arquivos em memória, resumo da conversa, skills, tokens, custo
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Brain, FileText, Layers, Zap, Database, DollarSign,
  ChevronRight, ChevronDown, Trash2, RefreshCw,
} from "lucide-react";

export interface MemoryContext {
  files: Array<{ path: string; preview: string; tokens: number }>;
  conversationSummary: string;
  skills: Array<{ name: string; description: string }>;
  tokensUsed: number;
  tokensLimit: number;
  estimatedNextCost: number;
  model: string;
}

interface AgentMemoryViewerProps {
  context: MemoryContext | null;
  onClearContext: () => void;
  onRefresh: () => void;
}

export function AgentMemoryViewer({ context, onClearContext, onRefresh }: AgentMemoryViewerProps) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(["files"]));

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(section)) next.delete(section);
      else next.add(section);
      return next;
    });
  };

  if (!context) {
    return (
      <div className="flex flex-col items-center gap-2 py-8 text-[var(--text-ghost)]">
        <Brain className="size-6 opacity-30" />
        <span className="font-mono text-[9px] tracking-[0.15em] uppercase">
          Contexto não disponível
        </span>
      </div>
    );
  }

  const percentUsed = Math.round((context.tokensUsed / context.tokensLimit) * 100);
  const tokenColor = percentUsed > 90 ? "var(--destructive)" : percentUsed > 70 ? "var(--primary)" : "var(--success)";

  const sections = [
    {
      id: "files",
      label: `Arquivos (${context.files.length})`,
      icon: <FileText className="size-3" />,
      content: (
        <div className="space-y-1">
          {context.files.map((f) => (
            <div key={f.path} className="flex items-start gap-2 px-2 py-1.5 rounded hover:bg-[var(--surface-2)] transition-colors cursor-default">
              <FileText className="size-3 text-[var(--text-ghost)] mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="font-mono text-[10px] text-[var(--foreground)] truncate">{f.path.split("/").pop()}</div>
                <div className="font-mono text-[9px] text-[var(--text-ghost)] truncate mt-0.5">{f.preview.slice(0, 60)}</div>
              </div>
              <span className="font-mono text-[8px] text-[var(--text-ghost)] shrink-0">{f.tokens}tk</span>
            </div>
          ))}
        </div>
      ),
    },
    {
      id: "summary",
      label: "Resumo da Conversa",
      icon: <Layers className="size-3" />,
      content: (
        <div className="px-2 py-1.5 font-mono text-[10px] text-[var(--text-dim)] leading-relaxed">
          {context.conversationSummary}
        </div>
      ),
    },
    {
      id: "skills",
      label: `Skills (${context.skills.length})`,
      icon: <Zap className="size-3" />,
      content: (
        <div className="space-y-1">
          {context.skills.map((s) => (
            <div key={s.name} className="flex items-start gap-2 px-2 py-1.5 rounded hover:bg-[var(--surface-2)] transition-colors">
              <Zap className="size-3 text-[var(--primary)] mt-0.5 shrink-0" />
              <div>
                <div className="font-mono text-[10px] text-[var(--foreground)]">{s.name}</div>
                <div className="font-mono text-[9px] text-[var(--text-ghost)]">{s.description}</div>
              </div>
            </div>
          ))}
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border)] shrink-0">
        <div className="flex items-center gap-1.5">
          <Brain className="size-3.5 text-[var(--primary)]" />
          <span className="font-mono text-[9px] tracking-[0.15em] uppercase text-[var(--foreground)]">Memória do Agente</span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={onRefresh} className="p-1 rounded hover:bg-[var(--surface-2)] text-[var(--text-ghost)] transition-colors" title="Atualizar"><RefreshCw className="size-3" /></button>
          <button onClick={onClearContext} className="p-1 rounded hover:bg-[var(--destructive)]/10 text-[var(--text-ghost)] hover:text-[var(--destructive)] transition-colors" title="Limpar contexto"><Trash2 className="size-3" /></button>
        </div>
      </div>

      <div className="px-3 py-2 border-b border-[var(--border)] space-y-1.5 shrink-0">
        <div className="flex items-center justify-between text-[9px] font-mono">
          <span className="text-[var(--text-dim)]">Tokens</span>
          <span style={{ color: tokenColor }}>{context.tokensUsed.toLocaleString()} / {context.tokensLimit.toLocaleString()}</span>
        </div>
        <div className="h-1.5 rounded-full bg-[var(--surface-2)] overflow-hidden">
          <motion.div className="h-full rounded-full" style={{ backgroundColor: tokenColor }} initial={{ width: 0 }} animate={{ width: `${percentUsed}%` }} />
        </div>
        <div className="flex items-center justify-between text-[8px] font-mono text-[var(--text-ghost)]">
          <span>{percentUsed}%</span>
          <span className="flex items-center gap-1"><DollarSign className="size-2.5" />~${context.estimatedNextCost.toFixed(4)}</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-1">
        {sections.map((section) => {
          const isExpanded = expandedSections.has(section.id);
          return (
            <div key={section.id}>
              <button onClick={() => toggleSection(section.id)} className="flex items-center gap-1.5 w-full px-3 py-1.5 font-mono text-[9px] tracking-[0.1em] uppercase text-[var(--text-ghost)] hover:text-[var(--foreground)] transition-colors">
                {isExpanded ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
                {section.icon}
                {section.label}
              </button>
              <AnimatePresence>
                {isExpanded && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                    {section.content}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>

      <div className="px-3 py-2 border-t border-[var(--border)] shrink-0">
        <span className="flex items-center gap-1.5 font-mono text-[8px] text-[var(--text-ghost)]">
          <Database className="size-3" />{context.model}
        </span>
      </div>
    </div>
  );
}
