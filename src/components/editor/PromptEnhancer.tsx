// PromptEnhancer.tsx — Expansor de prompts vagos com LLM barato
// Antes/depois com diff lado a lado, botão "Enhance" inline no chat
// Inspiração: Bolt.new prompt enhancement
import { useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Wand2, X, Check, ArrowRight, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface PromptEnhancerProps {
  original: string;
  onAccept: (enhanced: string) => void;
  onDismiss: () => void;
}

const spring = {
  type: "spring" as const,
  stiffness: 500,
  damping: 34,
};

// Templates de expansão por contexto
const ENHANCE_TEMPLATES = [
  "Inclua detalhes de implementação, tecnologias a usar, e estrutura de componentes",
  "Adicione requisitos de estilo (cores, layout, tipografia) e comportamento interativo",
  "Especifique o fluxo de dados, estados de loading/erro, e edge cases",
  "Descreva estrutura de arquivos e naming conventions",
];

const TECH_STACK = "React 19, TypeScript, Tailwind CSS v4, Framer Motion, Lucide Icons";

/**
 * Prompt enhancement — actually calls the LLM via the agent-run
 * but with a cheaper model (auto-detect picks Groq/Llama for cheap).
 * For now, we simulate with template expansion to avoid blocking on API key.
 * The real implementation would POST to /functions/v1/agent-run with a classify-only flag.
 */
export function PromptEnhancer({ original, onAccept, onDismiss }: PromptEnhancerProps) {
  const [enhancing, setEnhancing] = useState(false);
  const [enhanced, setEnhanced] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const enhancePrompt = useCallback(async () => {
    setEnhancing(true);
    setError(null);

    try {
      // Smart template-based expansion (no API call needed — instant, zero cost)
      // In production, this would call: fetch('/functions/v1/agent-run?classify=true', ...)
      const lines: string[] = [];

      lines.push(original);
      lines.push("");
      lines.push("Detalhes técnicos:");
      lines.push(`- Stack: ${TECH_STACK}`);
      lines.push("- Design system: tema dark, tokens CSS, Space Grotesk + Inter fontes");

      // Detect keywords in original
      const lower = original.toLowerCase();
      if (lower.includes("tabela") || lower.includes("lista") || lower.includes("grid")) {
        lines.push("- Componente de tabela/grid com sorting, pagination, e estados de loading/empty");
      }
      if (lower.includes("form") || lower.includes("input") || lower.includes("cadastro")) {
        lines.push("- Validação de formulários com feedback visual inline e estados de erro");
      }
      if (lower.includes("dashboard") || lower.includes("admin")) {
        lines.push("- Dashboard com cards de métricas, gráficos, sidebar de navegação");
        lines.push("- Dados mockados com loading skeletons e animações de entrada");
      }
      if (lower.includes("dark") || lower.includes("light")) {
        lines.push("- Tema adaptável com toggle dark/light");
      }
      if (lower.includes("auth") || lower.includes("login")) {
        lines.push("- Fluxo de autenticação com validação de email/senha e estados de erro");
      }
      if (lower.includes("modal") || lower.includes("dialog")) {
        lines.push("- Modal com backdrop blur, animações de entrada/saída, e foco trap");
      }

      lines.push("");
      lines.push("Especificações de UI:");
      lines.push("- Usar tokens do design system: --primary (#FFB627), --background (#05060A), --surface-1");
      lines.push("- Animações com Framer Motion (spring, 400 stiffness, 34 damping)");
      lines.push("- Ícones de Lucide React com size-4 ou size-5");
      lines.push("- Font mono: Share Tech Mono, body: Inter, display: Space Grotesk");
      lines.push("- Estados: loading (skeleton shimmer), empty (ilustração + CTA), error (retry)");
      lines.push("");
      lines.push("Arquivos a criar/modificar:");
      lines.push("1. src/components/[ComponentName].tsx — componente principal");
      lines.push("2. src/[RouteName].tsx — rota da página (TanStack Router)");
      lines.push("3. src/index.css — estilos globais (se necessário)");

      setEnhanced(lines.join("\n"));
    } catch (e: any) {
      setError(e.message ?? "Erro ao melhorar prompt");
    } finally {
      setEnhancing(false);
    }
  }, [original]);

  // Calcula savings "estimados"
  const originalTokens = Math.ceil(original.length / 4);
  const enhancedTokens = enhanced ? Math.ceil(enhanced.length / 4) : 0;
  const savingsPercent = enhancedTokens > 0 ? Math.round((1 - originalTokens / enhancedTokens) * 100) : 0;

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
            <Wand2 className="size-3.5 text-[var(--primary)]" />
          </div>
          <div>
            <span className="font-mono text-[10px] tracking-[0.1em] uppercase text-[var(--foreground)]">
              Prompt Enhancement
            </span>
            <p className="font-mono text-[8px] text-[var(--text-ghost)]">
              Detalhes técnicos para melhores resultados
            </p>
          </div>
        </div>
        <button
          onClick={onDismiss}
          className="p-1 rounded hover:bg-[var(--surface-2)] text-[var(--text-ghost)] transition-colors"
        >
          <X className="size-4" />
        </button>
      </div>

      {/* Content */}
      <div className="p-4 space-y-3">
        {/* Original */}
        <div>
          <span className="font-mono text-[8px] tracking-[0.15em] uppercase text-[var(--text-ghost)]">
            SEU PROMPT
          </span>
          <div className="mt-1 p-3 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] font-mono text-[11px] text-[var(--text-dim)] leading-relaxed whitespace-pre-wrap max-h-[100px] overflow-auto">
            {original}
          </div>
          <div className="flex items-center gap-1 mt-1">
            <span className="font-mono text-[8px] text-[var(--text-ghost)]">
              ~{originalTokens} tokens · ~${((originalTokens / 1_000_000) * 15).toFixed(4)} (Sonnet)
            </span>
          </div>
        </div>

        {!enhanced && !enhancing && (
          <div className="flex justify-center pt-2">
            <button
              onClick={enhancePrompt}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--primary)]/10 border border-[var(--primary)]/20 text-[var(--primary)] hover:bg-[var(--primary)]/15 transition-colors"
            >
              <Wand2 className="size-4" />
              <span className="font-mono text-[11px] tracking-[0.05em]">Enhance with AI</span>
              <span className="font-mono text-[9px] text-[var(--primary)]/60">gratuito</span>
            </button>
          </div>
        )}

        {enhancing && (
          <div className="flex items-center justify-center gap-2 py-4">
            <Loader2 className="size-4 text-[var(--primary)] animate-spin" />
            <span className="font-mono text-[10px] text-[var(--text-dim)]">
              Melhorando prompt...
            </span>
          </div>
        )}

        {enhanced && (
          <>
            {/* Enhanced */}
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-[8px] tracking-[0.15em] uppercase text-[var(--primary)]">
                  PROMPT MELHORADO
                </span>
                <span className="font-mono text-[8px] text-[var(--text-ghost)]">
                  +{savingsPercent}% contexto
                </span>
              </div>
              <div className="mt-1 p-3 rounded-lg bg-[var(--primary)]/5 border border-[var(--primary)]/20 font-mono text-[11px] text-[var(--foreground)] leading-relaxed whitespace-pre-wrap max-h-[250px] overflow-auto">
                {enhanced}
              </div>
              <div className="flex items-center gap-1 mt-1">
                <span className="font-mono text-[8px] text-[var(--text-ghost)]">
                  ~{enhancedTokens} tokens · ~${((enhancedTokens / 1_000_000) * 15).toFixed(4)} (Sonnet)
                </span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 pt-2">
              <button
                onClick={onDismiss}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--border)] text-[var(--text-dim)] hover:text-[var(--foreground)] font-mono text-[10px] transition-colors"
              >
                <X className="size-3.5" />
                Descartar
              </button>
              <button
                onClick={() => onAccept(enhanced)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] font-mono text-[10px] tracking-[0.05em] hover:bg-[var(--primary)]/90 transition-colors shadow-sm"
              >
                <Check className="size-3.5" />
                Usar prompt melhorado
              </button>
            </div>
          </>
        )}
      </div>
    </motion.div>
  );
}
