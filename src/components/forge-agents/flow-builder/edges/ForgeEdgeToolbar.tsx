/**
 * ForgeEdgeToolbar — Hover toolbar on edges (Add node between, Delete)
 * n8n-style: appears after 600ms hover delay at edge midpoint
 */
import { type FC } from "react";

interface ForgeEdgeToolbarProps {
  labelX: number;
  labelY: number;
  onAdd?: () => void;
  onDelete?: () => void;
}

export const ForgeEdgeToolbar: FC<ForgeEdgeToolbarProps> = ({
  labelX, labelY, onAdd, onDelete,
}) => (
  <div
    className="forge-edge-toolbar nodrag nopan"
    style={{
      position: "absolute",
      transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
      zIndex: 10,
      display: "flex",
      gap: 2,
      pointerEvents: "all",
    }}
  >
    <button
      className="forge-edge-toolbar-btn"
      title="Add node between"
      onClick={(e) => { e.stopPropagation(); onAdd?.(); }}
      style={{
        width: 22, height: 22, borderRadius: 6,
        border: "1px solid var(--ps-border, #2a2d35)",
        background: "var(--ps-bg-surface, #1a1c22)",
        color: "var(--ps-cream-60, rgba(240,230,215,0.6))",
        cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 14, fontWeight: 700, lineHeight: 1,
        transition: "all 0.15s ease",
      }}
      onMouseEnter={(e) => {
        (e.target as HTMLElement).style.background = "var(--ps-bg-surface-hover, #25282f)";
        (e.target as HTMLElement).style.color = "var(--ps-cream, #f0e6d7)";
        (e.target as HTMLElement).style.borderColor = "var(--ps-accent, #f59e0b)";
      }}
      onMouseLeave={(e) => {
        (e.target as HTMLElement).style.background = "var(--ps-bg-surface, #1a1c22)";
        (e.target as HTMLElement).style.color = "var(--ps-cream-60, rgba(240,230,215,0.6))";
        (e.target as HTMLElement).style.borderColor = "var(--ps-border, #2a2d35)";
      }}
    >+</button>
    <button
      className="forge-edge-toolbar-btn"
      title="Delete connection"
      onClick={(e) => { e.stopPropagation(); onDelete?.(); }}
      style={{
        width: 22, height: 22, borderRadius: 6,
        border: "1px solid var(--ps-border, #2a2d35)",
        background: "var(--ps-bg-surface, #1a1c22)",
        color: "var(--ps-cream-60, rgba(240,230,215,0.6))",
        cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 12, fontWeight: 400, lineHeight: 1,
        transition: "all 0.15s ease",
      }}
      onMouseEnter={(e) => {
        (e.target as HTMLElement).style.background = "rgba(220,38,38,0.2)";
        (e.target as HTMLElement).style.color = "#ef4444";
        (e.target as HTMLElement).style.borderColor = "#ef4444";
      }}
      onMouseLeave={(e) => {
        (e.target as HTMLElement).style.background = "var(--ps-bg-surface, #1a1c22)";
        (e.target as HTMLElement).style.color = "var(--ps-cream-60, rgba(240,230,215,0.6))";
        (e.target as HTMLElement).style.borderColor = "var(--ps-border, #2a2d35)";
      }}
    >✕</button>
  </div>
);
