/**
 * NodeContextMenu — Right-click context menu for canvas nodes
 * n8n-style: positioned at click coordinates, actions per node type
 */
import { type FC, type MouseEvent } from "react";

export interface ContextMenuAction {
  id: string;
  label: string;
  icon?: string;
  shortcut?: string;
  disabled?: boolean;
  danger?: boolean;
  divider?: boolean;
}

interface NodeContextMenuProps {
  x: number;
  y: number;
  nodeId: string;
  nodeType?: string;
  actions: ContextMenuAction[];
  onAction: (actionId: string, nodeId: string) => void;
  onClose: () => void;
}

export const NodeContextMenu: FC<NodeContextMenuProps> = ({
  x, y, actions, onAction, onClose,
}) => {
  const handleAction = (actionId: string) => {
    onAction(actionId, "");
    onClose();
  };

  return (
    <>
      {/* Backdrop to close on click outside */}
      <div
        className="fixed inset-0 z-40"
        onClick={onClose}
        onContextMenu={(e: MouseEvent) => { e.preventDefault(); onClose(); }}
      />
      {/* Menu */}
      <div
        className="fixed z-50 min-w-[180px] py-1 rounded-xl shadow-2xl border"
        style={{
          left: x,
          top: y,
          background: "var(--ps-bg-surface, #1a1c22)",
          borderColor: "var(--ps-border, #2a2d35)",
        }}
      >
        {actions.map((action, i) => (
          action.divider ? (
            <div
              key={`divider-${i}`}
              className="my-1 mx-2"
              style={{ borderTop: "1px solid var(--ps-border, #2a2d35)" }}
            />
          ) : (
            <button
              key={action.id}
              disabled={action.disabled}
              onClick={() => handleAction(action.id)}
              className="w-full flex items-center gap-3 px-3 py-1.5 text-xs transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              style={{
                color: action.danger ? "#ef4444" : "var(--ps-cream-80, rgba(240,230,215,0.8))",
              }}
              onMouseEnter={(e) => {
                if (!action.disabled) {
                  (e.target as HTMLElement).style.background = "rgba(255,255,255,0.06)";
                }
              }}
              onMouseLeave={(e) => {
                (e.target as HTMLElement).style.background = "transparent";
              }}
            >
              {action.icon && (
                <span className="w-4 h-4 flex items-center justify-center shrink-0" style={{ opacity: 0.5 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    {action.icon === "copy" && <><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></>}
                    {action.icon === "duplicate" && <><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></>}
                    {action.icon === "trash" && <><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></>}
                    {action.icon === "toggle" && <><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" /></>}
                    {action.icon === "edit" && <><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></>}
                    {action.icon === "play" && <><polygon points="5 3 19 12 5 21 5 3" /></>}
                    {action.icon === "pin" && <><line x1="12" y1="17" x2="12" y2="22" /><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z" /></>}
                    {action.icon === "select-all" && <><rect x="3" y="3" width="18" height="18" rx="2" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="9" y1="3" x2="9" y2="21" /></>}
                  </svg>
                </span>
              )}
              <span className="flex-1 text-left">{action.label}</span>
              {action.shortcut && (
                <span className="text-[10px]" style={{ opacity: 0.4 }}>{action.shortcut}</span>
              )}
            </button>
          )
        ))}
      </div>
    </>
  );
};
