import { useCallback, useState } from "react";
import { Pause, Play, Trash2 } from "lucide-react";

export type PendingQueueItem = {
  id: string;
  createdAt: string;
  preview: string;
  repeat: number;
  paused: boolean;
};

type ChatQueueDockProps = {
  items: PendingQueueItem[];
  pendingCount: number;
  queuePaused: boolean;
  onUpdateRepeat: (id: string, repeat: number) => Promise<void>;
  onToggleItemPaused: (id: string, paused: boolean) => Promise<void>;
  onToggleQueuePaused: (paused: boolean) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
};

function truncatePreview(text: string, max = 120): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

export function ChatQueueDock({
  items,
  pendingCount,
  queuePaused,
  onUpdateRepeat,
  onToggleItemPaused,
  onToggleQueuePaused,
  onRemove,
}: ChatQueueDockProps) {
  const [busyId, setBusyId] = useState<string | null>(null);

  const wrap = useCallback(
    async (id: string | null, fn: () => Promise<void>) => {
      if (busyId) return;
      setBusyId(id ?? "global");
      try {
        await fn();
      } finally {
        setBusyId(null);
      }
    },
    [busyId],
  );

  if (pendingCount <= 0) return null;

  return (
    <div className="forge-queue-dock" data-testid="chat-queue-dock">
      <div className="forge-plan-dock-shell forge-queue-dock-shell">
        <div className="forge-queue-dock-header">
          <p className="forge-plan-dock-label">Queue</p>
          <button
            type="button"
            className="forge-queue-dock-global-pause"
            disabled={busyId === "global"}
            title={queuePaused ? "Retomar fila" : "Pausar fila"}
            onClick={() => void wrap("global", () => onToggleQueuePaused(!queuePaused))}
          >
            {queuePaused ? <Play className="size-3.5" /> : <Pause className="size-3.5" />}
            <span>{queuePaused ? "Retomar fila" : "Pausar fila"}</span>
          </button>
        </div>

        <ol className="forge-queue-dock-list">
          {items.map((item, index) => (
            <li key={item.id} className="forge-queue-dock-item">
              <span className="forge-queue-dock-index" aria-hidden>
                {index + 1}
              </span>
              <p className="forge-queue-dock-preview" title={item.preview}>
                {truncatePreview(item.preview)}
              </p>
              <div className="forge-queue-dock-controls">
                <label className="forge-queue-dock-repeat">
                  <span className="sr-only">Repetições</span>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    defaultValue={item.repeat}
                    key={`${item.id}-${item.repeat}`}
                    disabled={busyId === item.id}
                    onBlur={(e) => {
                      const n = Math.min(50, Math.max(1, Number(e.target.value) || 1));
                      if (n !== item.repeat) {
                        void wrap(item.id, () => onUpdateRepeat(item.id, n));
                      }
                    }}
                  />
                </label>
                <button
                  type="button"
                  className="forge-queue-dock-icon"
                  disabled={busyId === item.id}
                  title={item.paused ? "Retomar item" : "Pausar item"}
                  onClick={() =>
                    void wrap(item.id, () => onToggleItemPaused(item.id, !item.paused))
                  }
                >
                  {item.paused ? <Play className="size-3.5" /> : <Pause className="size-3.5" />}
                </button>
                <button
                  type="button"
                  className="forge-queue-dock-icon forge-queue-dock-icon--danger"
                  disabled={busyId === item.id}
                  title="Remover da fila"
                  onClick={() => void wrap(item.id, () => onRemove(item.id))}
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}