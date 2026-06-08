import { useCallback, useState } from "react";
import { ClipboardCopy, Play, Trash2, X } from "lucide-react";
import { toast } from "@/lib/toast";

export type PendingQueueItem = {
  id: string;
  createdAt: string;
  preview: string;
};

type PendingQueuePanelProps = {
  items: PendingQueueItem[];
  pendingCount: number;
  running?: boolean;
  onCopy: (text: string) => void;
  onRemove: (id: string) => Promise<void>;
  onClearAll: () => Promise<void>;
  onDrain: () => Promise<void>;
  blockingReason?: string | null;
};

export function PendingQueuePanel({
  items,
  pendingCount,
  running = false,
  onCopy,
  onRemove,
  onClearAll,
  onDrain,
  blockingReason,
}: PendingQueuePanelProps) {
  const [busy, setBusy] = useState(false);

  const wrap = useCallback(
    async (fn: () => Promise<void>) => {
      if (busy) return;
      setBusy(true);
      try {
        await fn();
      } finally {
        setBusy(false);
      }
    },
    [busy],
  );

  if (pendingCount <= 0 && !blockingReason) return null;
  if (pendingCount > 0 && items.length === 0 && !blockingReason) return null;

  const displayItems = items;

  return (
    <div
      className="forge-pending-queue border-t border-[var(--forge-border)] bg-[var(--forge-surface-2)]/50"
      data-testid="pending-queue-panel"
    >
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <p className="font-mono text-[10px] text-[var(--forge-silver)]">
          <strong className="text-[var(--forge-primary)]">{pendingCount}</strong> na fila
          {running ? " · agente ocupado" : ""}
        </p>
        <div className="flex items-center gap-1">
          {!running && pendingCount > 0 && (
            <button
              type="button"
              className="forge-pending-queue-action"
              disabled={busy}
              onClick={() => void wrap(onDrain)}
              title="Processar fila agora"
            >
              <Play className="size-3" />
              Processar
            </button>
          )}
          {pendingCount > 0 && (
            <button
              type="button"
              className="forge-pending-queue-action"
              disabled={busy}
              onClick={() => void wrap(onClearAll)}
              title="Limpar fila"
            >
              <Trash2 className="size-3" />
              Limpar
            </button>
          )}
        </div>
      </div>

      {blockingReason && (
        <p className="px-3 pb-2 font-mono text-[9px] text-amber-400/90 leading-relaxed">
          {blockingReason}
        </p>
      )}

      <ul className="max-h-32 overflow-y-auto px-2 pb-2 space-y-1">
        {displayItems.map((item) => (
          <li
            key={item.id}
            className="flex items-start gap-2 rounded-md border border-[var(--forge-border)]/80 bg-[var(--forge-surface-3)]/60 px-2 py-1.5"
          >
            <p className="flex-1 min-w-0 text-[11px] text-[var(--forge-foreground)] leading-snug line-clamp-3">
              {item.preview}
            </p>
            <div className="flex shrink-0 gap-0.5">
              <button
                type="button"
                className="forge-pending-queue-icon"
                title="Copiar texto"
                onClick={() => {
                  onCopy(item.preview);
                  toast.success("Copiado");
                }}
              >
                <ClipboardCopy className="size-3" />
              </button>
              {item.id !== "phantom" && (
                <button
                  type="button"
                  className="forge-pending-queue-icon"
                  title="Remover da fila"
                  disabled={busy}
                  onClick={() => void wrap(() => onRemove(item.id))}
                >
                  <X className="size-3" />
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}