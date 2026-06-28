/**
 * NodeToolbar — n8n-style hover toolbar for canvas nodes
 *
 * Appears on hover above the node card. Contains:
 *   - Run (execute this node)
 *   - Delete (remove node)
 *   - Toggle disabled (power icon)
 *   - More (context menu)
 *
 * Positioned: absolute, bottom: 100%, left: 50%, transform: translateX(-50%)
 * Transition: opacity 0.1s ease-in
 */
import { type FC } from "react";
import { Play, Trash2, Power, MoreHorizontal } from "lucide-react";

interface NodeToolbarProps {
  onRun?: () => void;
  onDelete?: () => void;
  onToggle?: () => void;
  onContextMenu?: () => void;
  disabled?: boolean;
  readOnly?: boolean;
}

const BTN =
  "flex items-center justify-center w-6 h-6 rounded text-[var(--ps-cream-60,#aaa)] hover:text-[var(--ps-cream,#f0e6d7)] hover:bg-white/10 transition-colors";

export const NodeToolbar: FC<NodeToolbarProps> = ({
  onRun, onDelete, onToggle, onContextMenu,
  disabled, readOnly,
}) => {
  if (readOnly) return null;

  return (
    <div
      className="node-toolbar absolute left-1/2 z-20 flex items-center gap-0.5 rounded-md px-1 py-0.5"
      style={{
        bottom: "100%",
        marginBottom: 6,
        transform: "translateX(-50%)",
        background: "rgba(26,26,46,0.95)",
        border: "1px solid rgba(255,255,255,0.08)",
        boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
        opacity: 0,
        transition: "opacity 0.1s ease-in",
        pointerEvents: "none",
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {onRun && (
        <button
          type="button"
          className={BTN}
          title="Executar"
          disabled={disabled}
          onClick={onRun}
        >
          <Play className="h-3 w-3" />
        </button>
      )}
      {onToggle && (
        <button
          type="button"
          className={BTN}
          title={disabled ? "Ativar" : "Desativar"}
          onClick={onToggle}
        >
          <Power className="h-3 w-3" />
        </button>
      )}
      {onDelete && (
        <button
          type="button"
          className={`${BTN} hover:text-red-400!`}
          title="Remover"
          onClick={onDelete}
        >
          <Trash2 className="h-3 w-3" />
        </button>
      )}
      {onContextMenu && (
        <button
          type="button"
          className={BTN}
          title="Mais"
          onClick={onContextMenu}
        >
          <MoreHorizontal className="h-3 w-3" />
        </button>
      )}
    </div>
  );
};

/**
 * Inject CSS for node toolbar visibility on hover.
 * Must be called once in FlowCanvas.
 */
export function injectNodeToolbarStyles() {
  if (typeof document === "undefined") return;
  const id = "node-toolbar-styles";
  if (document.getElementById(id)) return;

  const style = document.createElement("style");
  style.id = id;
  style.textContent = `
    .group-node:hover > .node-toolbar,
    .group-node:focus-within > .node-toolbar {
      opacity: 1 !important;
      pointer-events: auto !important;
    }
  `;
  document.head.appendChild(style);
}
