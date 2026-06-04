// ForgeRulesEditor.tsx — Editor visual de .forgerules
// Templates prontos, sintaxe natural, preview de regras
// Inspiração: .cursorrules + .windsurfrules
import { useState, useCallback, useMemo } from "react";
import { motion } from "framer-motion";
import {
  FileText, Code2, Braces, Paintbrush, Shield, TestTube,
  Database, Zap, Plus, X, Check, Copy, Eye, EyeOff,
} from "lucide-react";

const TEMPLATES = [
  {
    id: "react-strict",
    label: "React Strict",
    icon: <Code2 className="size-4" />,
    rules: [
      "Use sempre TypeScript strict mode — nada de any",
      "Prefira Server Components no Next.js. Client Components só quando necessário",
      "Use const, nunca var. Prefira arrow functions",
      "Formate com Prettier: 2 spaces, single quotes, semicolons",
      "Todo componente deve ter tipagem de props explícita com interface",
    ],
  },
  {
    id: "nextjs-best",
    label: "Next.js Best Practices",
    icon: <Zap className="size-4" />,
    rules: [
      "Use App Router (app/) — NUNCA pages/",
      "Prefira Server Components. 'use client' só com estado/efeitos",
      "Use server actions para mutations, não API routes",
      "Metadados via generateMetadata, não <head> manual",
      "Imagens use next/image. Links use next/link. Fontes use next/font",
    ],
  },
  {
    id: "tailwind-clean",
    label: "Tailwind Clean Code",
    icon: <Paintbrush className="size-4" />,
    rules: [
      "Use tokens do design system: var(--primary), var(--background), etc",
      "Classes utility-first: NUNCA @apply em CSS",
      "Responsivo mobile-first: sm: md: lg: xl:",
      "Animações com Framer Motion, não CSS transitions",
      "Cores: nunca hardcode hex. Sempre use tokens ou Tailwind classes",
    ],
  },
  {
    id: "testing",
    label: "Testing Coverage",
    icon: <TestTube className="size-4" />,
    rules: [
      "Testes unitários com Vitest + Testing Library para TODO componente",
      "Cobertura mínima: 80% branches, 80% functions, 80% lines",
      "Snapshots só para componentes estáveis — evitar false positives",
      "E2E com Playwright para fluxos críticos (login, checkout, CRUD)",
      "Mock APIs com MSW, nunca mockar fetch diretamente",
    ],
  },
  {
    id: "database",
    label: "Database & API",
    icon: <Database className="size-4" />,
    rules: [
      "Use Supabase como backend padrão — RLS sempre habilitado",
      "Migrations versionadas no git. Nunca alterar schema manualmente",
      "Queries com .select() explícito — nunca select('*') em produção",
      "Edge Functions para lógica serverless, RPC para stored procedures",
      "Erros de API sempre retornam { error: string }, nunca stack traces",
    ],
  },
];

interface ForgeRulesEditorProps {
  rules: string[];
  onChange: (rules: string[]) => void;
  onClose: () => void;
}

const spring = {
  type: "spring" as const,
  stiffness: 400,
  damping: 34,
};

export function ForgeRulesEditor({ rules, onChange, onClose }: ForgeRulesEditorProps) {
  const [localRules, setLocalRules] = useState<string[]>(rules);
  const [newRule, setNewRule] = useState("");
  const [previewMode, setPreviewMode] = useState(false);

  const addRule = useCallback(() => {
    if (!newRule.trim()) return;
    setLocalRules((prev) => [...prev, newRule.trim()]);
    setNewRule("");
  }, [newRule]);

  const removeRule = useCallback((idx: number) => {
    setLocalRules((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const applyTemplate = useCallback((templateId: string) => {
    const tmpl = TEMPLATES.find((t) => t.id === templateId);
    if (tmpl) setLocalRules(tmpl.rules);
  }, []);

  const handleSave = useCallback(() => {
    onChange(localRules);
    onClose();
  }, [localRules, onChange, onClose]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.97 }}
      transition={spring}
      className="border border-[var(--border)] rounded-xl bg-[var(--surface-1)] overflow-hidden shadow-xl shadow-black/30"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
        <div className="flex items-center gap-2">
          <div className="size-7 rounded-lg bg-[var(--primary)]/10 border border-[var(--primary)]/20 grid place-items-center">
            <FileText className="size-3.5 text-[var(--primary)]" />
          </div>
          <div>
            <span className="font-mono text-[10px] tracking-[0.1em] uppercase text-[var(--foreground)]">
              .forgerules
            </span>
            <p className="font-mono text-[8px] text-[var(--text-ghost)]">
              Regras que o agente FORGE segue ao gerar código
            </p>
          </div>
        </div>
        <button onClick={onClose} className="p-1 rounded hover:bg-[var(--surface-2)] text-[var(--text-ghost)] transition-colors">
          <X className="size-4" />
        </button>
      </div>

      <div className="flex">
        {/* Templates sidebar */}
        <div className="w-[200px] shrink-0 border-r border-[var(--border)] p-2 space-y-1">
          <span className="block px-2 py-1 font-mono text-[8px] tracking-[0.2em] uppercase text-[var(--text-ghost)]">
            Templates
          </span>
          {TEMPLATES.map((tmpl) => (
            <button
              key={tmpl.id}
              onClick={() => applyTemplate(tmpl.id)}
              className="flex items-center gap-2 w-full px-2.5 py-2 rounded-lg text-left hover:bg-[var(--surface-2)] transition-colors"
            >
              <span className="text-[var(--text-dim)]">{tmpl.icon}</span>
              <span className="font-mono text-[10px] text-[var(--foreground)]">{tmpl.label}</span>
            </button>
          ))}
        </div>

        {/* Rules editor */}
        <div className="flex-1 p-4 space-y-3">
          {!previewMode ? (
            <>
              {/* Add rule input */}
              <div className="flex items-center gap-2">
                <input
                  value={newRule}
                  onChange={(e) => setNewRule(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") addRule(); }}
                  placeholder="Adicionar regra..."
                  className="flex-1 bg-[var(--surface-2)] border border-[var(--border)] rounded-md px-3 py-2 text-[11px] font-mono text-[var(--foreground)] placeholder:text-[var(--text-ghost)] outline-none focus:border-[var(--primary)]/40"
                />
                <button
                  onClick={addRule}
                  className="p-2 rounded-md bg-[var(--primary)]/10 text-[var(--primary)] hover:bg-[var(--primary)]/20 transition-colors border border-[var(--primary)]/20"
                >
                  <Plus className="size-4" />
                </button>
              </div>

              {/* Rules list */}
              <div className="space-y-1.5 max-h-[280px] overflow-y-auto">
                {localRules.length === 0 ? (
                  <div className="text-center py-8 text-[var(--text-ghost)]">
                    <FileText className="size-5 opacity-30 mx-auto mb-2" />
                    <span className="font-mono text-[9px]">Nenhuma regra definida. Adicione ou escolha um template.</span>
                  </div>
                ) : (
                  localRules.map((rule, i) => (
                    <motion.div
                      key={`${rule}-${i}`}
                      initial={{ opacity: 0, x: -4 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="flex items-start gap-2 px-3 py-2 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] group"
                    >
                      <span className="font-mono text-[9px] text-[var(--text-ghost)] mt-0.5 shrink-0">
                        {i + 1}.
                      </span>
                      <span className="font-mono text-[11px] text-[var(--foreground)] flex-1">
                        {rule}
                      </span>
                      <button
                        onClick={() => removeRule(i)}
                        className="shrink-0 p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-[var(--destructive)]/10 text-[var(--text-ghost)] hover:text-[var(--destructive)] transition-all"
                      >
                        <X className="size-3" />
                      </button>
                    </motion.div>
                  ))
                )}
              </div>
            </>
          ) : (
            /* Preview mode */
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-[var(--text-ghost)] mb-3">
                <Eye className="size-3.5" />
                <span className="font-mono text-[9px] tracking-[0.1em] uppercase">
                  Preview do .forgerules
                </span>
              </div>
              <pre className="font-mono text-[11px] text-[var(--text-dim)] leading-relaxed bg-[var(--background)] p-4 rounded-lg border border-[var(--border)] max-h-[300px] overflow-auto whitespace-pre-wrap">
                {localRules.map((rule, i) => `${i + 1}. ${rule}`).join("\n")}
              </pre>
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 px-4 py-3 border-t border-[var(--border)]">
        <button
          onClick={() => setPreviewMode(!previewMode)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--border)] text-[var(--text-dim)] hover:text-[var(--foreground)] font-mono text-[10px] transition-colors"
        >
          {previewMode ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
          {previewMode ? "Editar" : "Preview"}
        </button>
        <button onClick={onClose} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--border)] text-[var(--text-dim)] hover:text-[var(--foreground)] font-mono text-[10px] transition-colors">
          <X className="size-3.5" />Cancelar
        </button>
        <button onClick={handleSave} className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] font-mono text-[10px] tracking-[0.05em] hover:bg-[var(--primary)]/90 transition-colors shadow-sm ml-auto">
          <Check className="size-4" />Salvar
        </button>
      </div>
    </motion.div>
  );
}
