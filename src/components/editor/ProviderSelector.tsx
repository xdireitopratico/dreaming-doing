// ProviderSelector.tsx — Dropdown de seleção de modelo/provider no chat
// Mostra emblema do provider, nome do modelo, custo estimado e descrição
import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Zap, Brain, Cpu, Globe, Star, Key } from "lucide-react";

export interface ProviderOption {
  id: string;
  provider: string;
  model: string;
  label: string;
  description?: string;
  costPerMInput?: number;
  costPerMOutput?: number;
  recommended?: boolean;
  /** Whether this is a user-provided key */
  customKey?: boolean;
}

const PRESETS: ProviderOption[] = [
  {
    id: "anthropic-sonnet",
    provider: "Anthropic",
    model: "claude-sonnet-4-20250514",
    label: "Claude Sonnet 4",
    description: "Melhor equilíbrio — código & raciocínio",
    costPerMInput: 3.0,
    costPerMOutput: 15.0,
    recommended: true,
  },
  {
    id: "xai-grok",
    provider: "xAI",
    model: "grok-3-mini",
    label: "Grok 3 Mini",
    description: "Rápido e barato, bom pra iterações",
    costPerMInput: 0.5,
    costPerMOutput: 2.0,
  },
  {
    id: "groq-llama",
    provider: "Groq",
    model: "llama-4-scout-17b-16e",
    label: "Llama 4 Scout",
    description: "Baixíssima latência, gratuito",
    costPerMInput: 0,
    costPerMOutput: 0,
  },
  {
    id: "openai-gpt4o",
    provider: "OpenAI",
    model: "gpt-4o",
    label: "GPT-4o",
    description: "Visão + código, multimodal",
    costPerMInput: 2.5,
    costPerMOutput: 10.0,
  },
  {
    id: "custom-key",
    provider: "Custom",
    model: "custom",
    label: "Sua chave...",
    description: "Use sua própria chave API",
    costPerMInput: 0,
    costPerMOutput: 0,
    customKey: true,
  },
];

interface ProviderSelectorProps {
  value: string;
  onChange: (option: ProviderOption) => void;
  className?: string;
}

const providerIcons: Record<string, React.ReactNode> = {
  Anthropic: <Zap className="size-3.5" />,
  xAI: <Globe className="size-3.5" />,
  Groq: <Cpu className="size-3.5" />,
  OpenAI: <Brain className="size-3.5" />,
  Custom: <Key className="size-3.5" />,
};

export function ProviderSelector({ value, onChange, className = "" }: ProviderSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const selected = PRESETS.find((p) => p.id === value) ?? PRESETS[0];

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} className={`relative ${className}`}>
      {/* Trigger */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 px-2 py-1 rounded-md border border-[var(--border)] bg-[var(--surface-2)]/60 hover:bg-[var(--surface-2)] transition-colors text-[var(--foreground)]"
      >
        {selected.recommended && (
          <Star className="size-3 text-[var(--primary)] fill-[var(--primary)]/30" />
        )}
        <span className="font-mono text-[10px] tracking-[0.05em] truncate max-w-[100px]">
          {selected.label}
        </span>
        <ChevronDown className={`size-3 text-[var(--text-ghost)] transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {/* Dropdown */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 500, damping: 35 }}
            className="absolute bottom-full mb-1.5 left-0 w-[300px] bg-[var(--surface-1)] border border-[var(--border)] rounded-lg shadow-xl shadow-black/30 overflow-hidden z-50"
          >
            <div className="px-3 py-2 border-b border-[var(--border)]">
              <span className="font-mono text-[8px] tracking-[0.25em] uppercase text-[var(--text-ghost)]">
                Selecione o modelo
              </span>
            </div>

            <div className="py-1 max-h-[280px] overflow-y-auto">
              {PRESETS.map((option) => (
                <button
                  key={option.id}
                  onClick={() => {
                    onChange(option);
                    setIsOpen(false);
                  }}
                  className={`w-full flex items-start gap-3 px-3 py-2.5 text-left transition-colors ${
                    value === option.id
                      ? "bg-[var(--primary)]/10"
                      : "hover:bg-[var(--surface-2)]"
                  }`}
                >
                  {/* Icon */}
                  <div
                    className={`size-8 rounded-lg border flex items-center justify-center shrink-0 mt-0.5 ${
                      option.recommended
                        ? "border-[var(--primary)]/30 bg-[var(--primary)]/10 text-[var(--primary)]"
                        : "border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-dim)]"
                    }`}
                  >
                    {providerIcons[option.provider] ?? <Cpu className="size-3.5" />}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-[11px] text-[var(--foreground)] leading-tight">
                        {option.label}
                      </span>
                      {option.recommended && (
                        <span className="font-mono text-[7px] tracking-[0.15em] uppercase px-1 py-0.5 rounded bg-[var(--primary)]/15 text-[var(--primary)]">
                          REC
                        </span>
                      )}
                      {option.customKey && (
                        <span className="font-mono text-[7px] tracking-[0.15em] uppercase px-1 py-0.5 rounded bg-amber-400/15 text-amber-400">
                          CHAVE
                        </span>
                      )}
                    </div>
                    {option.description && (
                      <div className="font-mono text-[9px] text-[var(--text-ghost)] mt-0.5">
                        {option.description}
                      </div>
                    )}
                    <div className="flex items-center gap-2 mt-1">
                      <span className="font-mono text-[8px] text-[var(--text-ghost)]">
                        {option.provider} · {option.model}
                      </span>
                      {option.costPerMInput !== undefined && option.costPerMInput > 0 && (
                        <span className="font-mono text-[8px] text-[var(--text-ghost)]">
                          ${option.costPerMInput}/M in
                        </span>
                      )}
                      {option.costPerMInput === 0 && (
                        <span className="font-mono text-[8px] text-emerald-400/70">
                          GRATUITO
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Check */}
                  {value === option.id && (
                    <div className="size-5 rounded-full bg-[var(--primary)] grid place-items-center shrink-0 mt-1">
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                        <path
                          d="M2 5L4 7L8 3"
                          stroke="var(--primary-foreground, #0a0408)"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </div>
                  )}
                </button>
              ))}
            </div>

            {/* Footer: connector link */}
            <div className="px-3 py-2 border-t border-[var(--border)] space-y-1">
              <a
                href="/api-keys"
                className="flex items-center gap-1.5 font-mono text-[9px] text-[var(--text-ghost)] hover:text-[var(--foreground)] transition-colors"
              >
                <Key className="size-3" />
                API Keys &amp; potência do modelo →
              </a>
              <a
                href="/connectors"
                className="flex items-center gap-1.5 font-mono text-[9px] text-[var(--text-ghost)] hover:text-[var(--foreground)] transition-colors"
              >
                GitHub, Vercel, Supabase →
              </a>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export { PRESETS as PROVIDER_PRESETS };
