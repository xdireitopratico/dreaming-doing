// ProviderSelector — atalhos curados no editor (não lista os 31 inteiros)
import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Zap, Brain, Cpu, Globe, Star, Key, Gem } from "lucide-react";
import {
  EDITOR_MODEL_PRESETS,
  AI_ENV_META,
  getPresetById,
  normalizePresetId,
  presetToProviderOption,
} from "@/lib/model-catalog";

export interface ProviderOption {
  id: string;
  provider: string;
  model: string;
  label: string;
  description?: string;
  recommended?: boolean;
}

const PRESETS: ProviderOption[] = EDITOR_MODEL_PRESETS.map(presetToProviderOption);

const envIcons: Record<string, React.ReactNode> = {
  Anthropic: <Zap className="size-3.5" />,
  "Google Gemini": <Gem className="size-3.5" />,
  "xAI (Grok)": <Globe className="size-3.5" />,
  OpenAI: <Brain className="size-3.5" />,
  "NVIDIA NIM": <Cpu className="size-3.5" />,
  "OpenRouter (roteador)": <Globe className="size-3.5" />,
};

interface ProviderSelectorProps {
  value: string;
  onChange: (option: ProviderOption) => void;
  className?: string;
}

export function ProviderSelector({ value, onChange, className = "" }: ProviderSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const norm = normalizePresetId(value);
  const unconfigured = !norm;
  const selected = unconfigured
    ? {
        id: "",
        provider: "—",
        model: "",
        label: "Não configurado",
        description: "Modelos → preset do agente",
      }
    : presetToProviderOption(getPresetById(norm));

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const grouped = EDITOR_MODEL_PRESETS.reduce(
    (acc, m) => {
      const label = AI_ENV_META[m.env].label;
      if (!acc[label]) acc[label] = [];
      acc[label].push(m);
      return acc;
    },
    {} as Record<string, typeof EDITOR_MODEL_PRESETS>,
  );

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 px-2 py-1 rounded-md border border-[var(--border)] bg-[var(--surface-2)]/60 hover:bg-[var(--surface-2)] transition-colors text-[var(--foreground)]"
      >
        {"recommended" in selected && selected.recommended && (
          <Star className="size-3 text-[var(--primary)] fill-[var(--primary)]/30" />
        )}
        <span className="font-mono text-[10px] tracking-[0.05em] truncate max-w-[120px]">
          {selected.label}
        </span>
        <ChevronDown
          className={`size-3 text-[var(--text-ghost)] transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
        />
      </button>

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
                Atalhos · API nativa quando possível
              </span>
            </div>

            <div className="py-1 max-h-[280px] overflow-y-auto forge-scrollbar-dark">
              {Object.entries(grouped).map(([envLabel, models]) => (
                <div key={envLabel}>
                  <div className="px-3 py-1.5 font-mono text-[7px] tracking-[0.2em] uppercase text-[var(--text-ghost)] bg-[var(--surface-2)]/40">
                    {envLabel}
                  </div>
                  {models.map((m) => {
                    const option = presetToProviderOption(m);
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => {
                          onChange(option);
                          setIsOpen(false);
                        }}
                        className={`w-full flex items-start gap-3 px-3 py-2 text-left transition-colors ${
                          norm === m.id ? "bg-[var(--primary)]/10" : "hover:bg-[var(--surface-2)]"
                        }`}
                      >
                        <div className="size-7 rounded-lg border border-[var(--border)] flex items-center justify-center shrink-0 text-[var(--text-dim)]">
                          {envIcons[envLabel] ?? <Cpu className="size-3.5" />}
                        </div>
                        <div className="min-w-0">
                          <span className="font-mono text-[11px] text-[var(--foreground)]">
                            {m.label}
                          </span>
                          <p className="font-mono text-[9px] text-[var(--text-ghost)] truncate">
                            {m.openRouterSlug}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>

            <div className="px-3 py-2 border-t border-[var(--border)]">
              <a
                href="/models#forge-ai-studio"
                className="flex items-center gap-1.5 font-mono text-[9px] text-[var(--text-ghost)] hover:text-[var(--foreground)]"
              >
                <Key className="size-3" />
                Ranking completo + slug custom →
              </a>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export { PRESETS as PROVIDER_PRESETS };