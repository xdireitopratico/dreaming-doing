import { useCallback, useRef, useState, type DragEvent } from "react";
import { Pause, Play, Pencil, Minus, Plus, Trash2 } from "lucide-react";

export type PendingQueueItem = {
  id: string;
  preview: string;
  repeat: number;
  sortOrder?: number;
};

type ChatQueueDockProps = {
  items: PendingQueueItem[];
  pendingCount: number;
  queuePaused: boolean;
  onUpdateRepeat: (id: string, repeat: number) => Promise<void>;
  onUpdateText: (id: string, text: string) => Promise<void>;
  onToggleQueuePaused: (paused: boolean) => Promise<void>;
  onReorder: (id: string, newSortOrder: number) => Promise<void>;
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
  onUpdateText,
  onToggleQueuePaused,
  onReorder,
  onRemove,
}: ChatQueueDockProps) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
  const editInputRef = useRef<HTMLInputElement>(null);
  const dragItemRef = useRef<PendingQueueItem | null>(null);

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

  const handleEditStart = useCallback((item: PendingQueueItem) => {
    setEditingId(item.id);
    setEditingText(item.preview);
    setOpenDropdownId(null);
    setTimeout(() => editInputRef.current?.focus(), 0);
  }, []);

  const handleEditSave = useCallback(async () => {
    if (!editingId) return;
    const trimmed = editingText.trim();
    const item = items.find((i) => i.id === editingId);
    if (item && trimmed && trimmed !== item.preview) {
      await wrap(editingId, () => onUpdateText(editingId, trimmed));
    }
    setEditingId(null);
    setEditingText("");
  }, [editingId, editingText, items, onUpdateText, wrap]);

  const handleEditCancel = useCallback(() => {
    setEditingId(null);
    setEditingText("");
  }, []);

  const handleEditKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        void handleEditSave();
      } else if (e.key === "Escape") {
        handleEditCancel();
      }
    },
    [handleEditSave, handleEditCancel],
  );

  const handlePreviewDoubleClick = useCallback(
    (item: PendingQueueItem) => {
      handleEditStart(item);
    },
    [handleEditStart],
  );

  const handleRepeatChange = useCallback(
    (id: string, delta: number, currentRepeat: number) => {
      const next = Math.min(50, Math.max(1, currentRepeat + delta));
      if (next !== currentRepeat) {
        void wrap(id, () => onUpdateRepeat(id, next));
      }
    },
    [onUpdateRepeat, wrap],
  );

  /* ── Dropdown ── */
  const toggleDropdown = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setOpenDropdownId((prev) => (prev === id ? null : id));
  }, []);

  const closeDropdown = useCallback(() => {
    setOpenDropdownId(null);
  }, []);

  /* ── Drag-and-drop ── */
  const handleDragStart = useCallback((e: DragEvent, item: PendingQueueItem) => {
    dragItemRef.current = item;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", item.id);
  }, []);

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);

  const handleDrop = useCallback(
    (e: DragEvent, targetItem: PendingQueueItem) => {
      e.preventDefault();
      const dragged = dragItemRef.current;
      dragItemRef.current = null;
      if (!dragged || dragged.id === targetItem.id) return;

      const draggedIndex = items.findIndex((i) => i.id === dragged.id);
      const targetIndex = items.findIndex((i) => i.id === targetItem.id);
      if (draggedIndex === -1 || targetIndex === -1) return;

      // Calculate the new sort_order for the dragged item
      // by assigning it the target's position and shifting others
      const newSortOrder = targetItem.sortOrder ?? targetIndex;
      void wrap(dragged.id, () => onReorder(dragged.id, newSortOrder));
    },
    [items, onReorder, wrap],
  );

  if (pendingCount <= 0) return null;

  return (
    <div
      className="forge-queue-dock"
      data-testid="chat-queue-dock"
      onClick={closeDropdown}
    >
      <div className="forge-plan-dock-shell forge-queue-dock-shell">
        <div className="forge-queue-dock-header">
          <p className="forge-queue-dock-label">
            Queue <span className="forge-queue-dock-count">· {pendingCount}</span>
            {queuePaused && <span className="forge-queue-dock-badge">pausada</span>}
          </p>
          <button
            type="button"
            className="forge-queue-dock-global-toggle"
            disabled={busyId === "global"}
            title={queuePaused ? "Retomar fila" : "Pausar fila"}
            onClick={(e) => {
              e.stopPropagation();
              void wrap("global", () => onToggleQueuePaused(!queuePaused));
            }}
          >
            {queuePaused ? (
              <Play className="forge-queue-dock-toggle-icon" />
            ) : (
              <Pause className="forge-queue-dock-toggle-icon" />
            )}
            <span>{queuePaused ? "Retomar" : "Pausar"}</span>
          </button>
        </div>

        <ol className="forge-queue-dock-list">
          {items.map((item, index) => {
            const isEditing = editingId === item.id;
            const isDropdownOpen = openDropdownId === item.id;

            return (
              <li
                key={item.id}
                className={`forge-queue-dock-item${queuePaused ? " forge-queue-dock-item--paused" : ""}`}
                draggable={!isEditing}
                onDragStart={(e) => handleDragStart(e, item)}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, item)}
              >
                <span className="forge-queue-dock-grip" aria-hidden>
                  ⠿
                </span>
                <span className="forge-queue-dock-index" aria-hidden>
                  {index + 1}
                </span>

                {isEditing ? (
                  <input
                    ref={editInputRef}
                    type="text"
                    className="forge-queue-dock-edit-input"
                    value={editingText}
                    onChange={(e) => setEditingText(e.target.value)}
                    onKeyDown={handleEditKeyDown}
                    onBlur={handleEditSave}
                  />
                ) : (
                  <p
                    className="forge-queue-dock-preview"
                    title={item.preview}
                    onDoubleClick={() => handlePreviewDoubleClick(item)}
                  >
                    {truncatePreview(item.preview)}
                  </p>
                )}

                {item.repeat > 1 && !isEditing && (
                  <span className="forge-queue-dock-inline-repeat" aria-label={`${item.repeat}x`}>
                    ×{item.repeat}
                  </span>
                )}

                {isEditing ? (
                  <div className="forge-queue-dock-edit-actions">
                    <button
                      type="button"
                      className="forge-queue-dock-edit-save"
                      title="Salvar (Enter)"
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleEditSave();
                      }}
                    >
                      ✓
                    </button>
                    <button
                      type="button"
                      className="forge-queue-dock-edit-cancel"
                      title="Cancelar (Esc)"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleEditCancel();
                      }}
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <div className="forge-queue-dock-controls">
                    <button
                      type="button"
                      className="forge-queue-dock-dots"
                      title="Ações"
                      disabled={busyId === item.id}
                      onClick={(e) => toggleDropdown(item.id, e)}
                    >
                      ···
                    </button>

                    {isDropdownOpen && (
                      <div
                        className="forge-queue-dock-dropdown"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          className="forge-queue-dock-dd-item"
                          onClick={() => {
                            handleEditStart(item);
                          }}
                        >
                          <Pencil className="forge-queue-dock-dd-icon" />
                          Editar texto
                        </button>

                        <button
                          type="button"
                          className="forge-queue-dock-dd-item"
                          onClick={() => {
                            void wrap(item.id, () =>
                              onUpdateRepeat(item.id, Math.max(1, item.repeat + 1)),
                            );
                            setOpenDropdownId(null);
                          }}
                        >
                          <Plus className="forge-queue-dock-dd-icon" />
                          Repetição
                          <span className="forge-queue-dock-dd-repeat">
                            <button
                              type="button"
                              className="forge-queue-dock-dd-repeat-btn"
                              onMouseDown={(e) => e.stopPropagation()}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRepeatChange(item.id, -1, item.repeat);
                              }}
                            >
                              <Minus className="forge-queue-dock-dd-repeat-icon" />
                            </button>
                            <span className="forge-queue-dock-dd-repeat-value">
                              {item.repeat}
                            </span>
                            <button
                              type="button"
                              className="forge-queue-dock-dd-repeat-btn"
                              onMouseDown={(e) => e.stopPropagation()}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRepeatChange(item.id, 1, item.repeat);
                              }}
                            >
                              <Plus className="forge-queue-dock-dd-repeat-icon" />
                            </button>
                          </span>
                        </button>

                        <div className="forge-queue-dock-dd-sep" />

                        <button
                          type="button"
                          className="forge-queue-dock-dd-item forge-queue-dock-dd-item--danger"
                          onClick={() => {
                            setOpenDropdownId(null);
                            void wrap(item.id, () => onRemove(item.id));
                          }}
                        >
                          <Trash2 className="forge-queue-dock-dd-icon" />
                          Remover
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
