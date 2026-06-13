/**
 * PrometheusReviewPrompts — Inline prompt editing section
 * Extracted from PrometheusReview for anti-monolithic compliance (P4)
 */
import { useState } from "react";
import { Edit3, Check } from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";

interface Prompt {
  nodeId: string;
  preview: string;
}

interface Props {
  prompts: Prompt[];
  onPromptsChange?: (prompts: Prompt[]) => void;
}

export function PrometheusReviewPrompts({ prompts: initialPrompts, onPromptsChange }: Props) {
  const [prompts, setPrompts] = useState(initialPrompts);
  const [editingPrompt, setEditingPrompt] = useState<number | null>(null);
  const [editText, setEditText] = useState("");

  const startEdit = (idx: number) => {
    setEditingPrompt(idx);
    setEditText(prompts[idx].preview);
  };

  const saveEdit = (idx: number) => {
    const updated = prompts.map((p, i) => i === idx ? { ...p, preview: editText } : p);
    setPrompts(updated);
    setEditingPrompt(null);
    onPromptsChange?.(updated);
    toast.success("Prompt atualizado!");
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
      className="w-full max-w-[800px] mb-4"
    >
      <div className="rounded-xl p-4" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid var(--ps-border)" }}>
        <div className="text-[12px] font-semibold mb-3 flex items-center gap-2" style={{ color: "var(--ps-cream-80)" }}>
          ✍️ Prompts Gerados
          <span className="text-[9px] font-normal" style={{ color: "var(--ps-cream-25)" }}>
            Clique no ✏️ para editar
          </span>
        </div>
        <div className="space-y-2">
          {prompts.map((p, i) => (
            <div key={i} className="px-3 py-2 rounded-lg text-[11px] flex items-start gap-2"
              style={{ background: "rgba(255,255,255,0.02)", border: "1px solid var(--ps-border)", color: "var(--ps-cream-60)" }}>
              <div className="flex-1">
                <span className="font-medium" style={{ color: "var(--ps-accent)" }}>{p.nodeId}</span>
                <span className="mx-1.5" style={{ color: "var(--ps-cream-25)" }}>·</span>
                {editingPrompt === i ? (
                  <textarea
                    autoFocus
                    className="w-full mt-1 text-[11px] bg-transparent border rounded p-1.5 outline-none resize-none"
                    style={{ color: "var(--ps-cream)", borderColor: "var(--ps-accent-glow)" }}
                    rows={3}
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && e.metaKey) saveEdit(i); }}
                  />
                ) : (
                  <span>{p.preview}</span>
                )}
              </div>
              {editingPrompt === i ? (
                <button onClick={() => saveEdit(i)} className="flex-shrink-0 mt-1">
                  <Check className="w-3.5 h-3.5" style={{ color: "var(--ps-green)" }} />
                </button>
              ) : (
                <button onClick={() => startEdit(i)} className="flex-shrink-0 mt-0.5 opacity-40 hover:opacity-100 transition-opacity">
                  <Edit3 className="w-3 h-3" style={{ color: "var(--ps-cream-40)" }} />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}
