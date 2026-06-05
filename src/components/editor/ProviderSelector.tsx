// ProviderSelector — dropdown curado (somente modelos fortes para código)
import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Zap, Brain, Cpu, Globe, Star, Key, Sparkles } from "lucide-react";
import {
  presetsByBrandGrouped,
  getPresetById,
  normalizePresetId,
  presetToProviderOption,
  type ForgeModelPreset,
} from "@/lib/model-catalog";

export interface ProviderOption {
  id: string;
  provider: string;
  model: string;
  label: string;
  description?: string;
  costPerMInput?: number;
  costPerMOutput?: number;
  recommended?: boolean;
  customKey?: boolean;
}



const brandIcons: Record<string, React.ReactNode> = {
  Anthropic: <Zap className="size-3.5" />,
  OpenAI: <Brain className="size-3.5" />,
  Google: <Sparkles className="size-3.5" />,
  xAI: <Globe className="size-3.5" />,
  DeepSeek: <Cpu className="size-3.5" />,
  Qwen: <Cpu className="size-3.5" />,
  Moonshot: <Globe className="size-3.5" />,
  MiniMax: <Cpu className="size-3.5" />,
  Zhipu: <Cpu className="size-3.5" />,
  NVIDIA: <Cpu className="size-3.5" />,
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
  const selected = presetToProviderOption(getPresetById(norm));

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const grouped = presetsByBrandGrouped();

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 px-2 py-1 rounded-md border border-[var(--border)] bg-[var(--surface-2)]/60 hover:bg-[var(--surface-2)] transition-colors text-[var(--foreground)]"
      >
        {selected.recommended && (
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
            className="absolute bottom-full mb-1.5 left-0 w-[320px] bg-[var(--surface-1)] border border-[var(--border)] rounded-lg shadow-xl shadow-black/30 overflow-hidden z-50"
          >
            <div className="px-3 py-2 border-b border-[var(--border)]">
              <span className="font-mono text-[8px] tracking-[0.25em] uppercase text-[var(--text-ghost)]">
                Top modelos · OpenRouter
              </span>
            </div>

            <div className="py-1 max-h-[320px] overflow-y-auto">
              {grouped.map(({ brand, models }) => (
                <div key={brand}>
                  <div className="px-3 py-1.5 font-mono text-[7px] tracking-[0.2em] uppercase text-[var(--text-ghost)] bg-[var(--surface-2)]/40">
                    {brand}
                  </div>
                  {models.filter((m) => m.recommended || m.rank <= 12).map((m) => {
                    const option = presetToProviderOption(m);
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => {
                          onChange(option);
                          setIsOpen(false);
                        }}
                        className={`w-full flex items-start gap-3 px-3 py-2.5 text-left transition-colors ${
                          norm === m.id ? "bg-[var(--primary)]/10" : "hover:bg-[var(--surface-2)]"
                        }`}
                      >
                        <div
                          className={`size-8 rounded-lg border flex items-center justify-center shrink-0 mt-0.5 ${
                            m.recommended
                              ? "border-[var(--primary)]/30 bg-[var(--primary)]/10 text-[var(--primary)]"
                              : "border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-dim)]"
                          }`}
                        >
                          {brandIcons[brand] ?? <Cpu className="size-3.5" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-mono text-[11px] text-[var(--foreground)]">
                              {m.label}
                            </span>
                            {m.recommended && (
                              <span className="font-mono text-[7px] uppercase px-1 py-0.5 rounded bg-[var(--primary)]/15 text-[var(--primary)]">
                                REC
                              </span>
                            )}
                            {m.tier === "frontier" && (
                              <span className="font-mono text-[7px] uppercase px-1 py-0.5 rounded bg-violet-400/15 text-violet-300">
                                FRONTIER
                              </span>
                            )}
                          </div>
                          <p className="font-mono text-[9px] text-[var(--text-ghost)] mt-0.5">
                            {m.description}
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
                href="/api-keys#forge-ai-studio"
                className="flex items-center gap-1.5 font-mono text-[9px] text-[var(--text-ghost)] hover:text-[var(--foreground)]"
              >
                <Key className="size-3" />
                Ver ranking completo (#1–31) no Estúdio IA →
              </a>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export { PRESETS as PROVIDER_PRESETS };