import { motion, AnimatePresence } from "framer-motion";
import { Trash2, Plus, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PoolSlotPublic } from "@/lib/save-connector";

export function ApiKeyPoolSection({
  poolSlots,
  poolCount,
  pulse,
  busy,
  onRemoveSlot,
  onRemoveAll,
}: {
  poolSlots: PoolSlotPublic[];
  poolCount: number;
  pulse?: boolean;
  busy?: boolean;
  onRemoveSlot: (id: string) => void;
  onRemoveAll: () => void;
}) {
  const count = poolCount || poolSlots.length;
  if (count === 0) return null;

  return (
    <div className="mt-3 rounded-lg border border-[var(--border)] bg-[var(--surface-2)]/60 p-3">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <KeyRound className="size-3.5 text-[var(--primary)]" />
          <span className="font-mono text-[10px] text-[var(--foreground)]">Pool ROBIN</span>
          <motion.span
            key={count}
            initial={pulse ? { scale: 1.35, opacity: 0.5 } : false}
            animate={{ scale: 1, opacity: 1 }}
            className={`font-mono text-[9px] px-2 py-0.5 rounded-full ${
              pulse
                ? "bg-[var(--primary)]/25 text-[var(--primary)] ring-1 ring-[var(--primary)]/40"
                : "bg-emerald-400/15 text-emerald-400"
            }`}
          >
            {count} chave{count !== 1 ? "s" : ""}
          </motion.span>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 text-[10px] text-[var(--text-ghost)] hover:text-red-400"
          disabled={busy}
          onClick={onRemoveAll}
        >
          Remover todas
        </Button>
      </div>

      <ul className="space-y-1.5">
        <AnimatePresence mode="popLayout">
          {poolSlots.map((slot, i) => (
            <motion.li
              key={slot.id}
              layout
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, height: 0 }}
              className="flex items-center justify-between gap-2 rounded-md border border-[var(--border)] bg-[var(--surface-1)] px-2.5 py-1.5"
            >
              <span className="font-mono text-[10px] text-[var(--text-dim)]">
                #{i + 1} · <span className="text-[var(--foreground)]">{slot.hint}</span>
              </span>
              <button
                type="button"
                className="p-1 rounded text-[var(--text-ghost)] hover:text-red-400 hover:bg-red-400/10"
                title="Remover esta chave do pool"
                disabled={busy}
                onClick={() => onRemoveSlot(slot.id)}
              >
                <Trash2 className="size-3.5" />
              </button>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
      <p className="mt-2 font-mono text-[8px] text-[var(--text-ghost)] flex items-center gap-1">
        <Plus className="size-2.5" />
        Cole a próxima chave abaixo e clique em &quot;Adicionar ao pool&quot; — o contador atualiza na hora.
      </p>
    </div>
  );
}