/**
 * ForgeEdge — n8n-style edge with hover toolbar and execution animation
 *
 * Features:
 * - 600ms hover delay before showing toolbar
 * - Toolbar with Add node (+) and Delete (✕) at midpoint
 * - Execution status colors (running animated, success green, error red)
 * - Selected glow effect
 */
import { useState, useRef, useCallback, useEffect, type FC } from "react";
import {
  BaseEdge, EdgeLabelRenderer, getBezierPath,
  type EdgeProps,
} from "@/types/xyflow-react-shim";
import { ForgeEdgeToolbar } from "./ForgeEdgeToolbar";
import { useFlowCanvas } from "../FlowCanvasContext";

const STATUS_COLORS: Record<string, string> = {
  running: "var(--ps-accent)",
  success: "#22c55e",
  error: "#ef4444",
  waiting: "#f59e0b",
  idle: "var(--ps-accent)",
};
const DEFAULT_COLOR = "var(--ps-accent)";
const HOVER_DELAY = 600;

export const ForgeEdge: FC<EdgeProps> = ({
  id, source, target, sourceX, sourceY, targetX, targetY,
  sourcePosition, targetPosition, data, selected, markerEnd,
}) => {
  const edgeData = (data || {}) as Record<string, any>;
  const label = edgeData.label || "";
  const condition = edgeData.condition || "";
  const edgeType = edgeData.edge_type || "default";
  const status: string = edgeData.status || "idle";

  const { openNodeCreator, deleteEdge } = useFlowCanvas();

  const [hovered, setHovered] = useState(false);
  const [showToolbar, setShowToolbar] = useState(false);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleMouseEnter = useCallback(() => {
    if (leaveTimer.current) clearTimeout(leaveTimer.current);
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    setHovered(true);
    hoverTimer.current = setTimeout(() => setShowToolbar(true), HOVER_DELAY);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setHovered(false);
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    leaveTimer.current = setTimeout(() => setShowToolbar(false), 200);
  }, []);

  useEffect(() => {
    return () => {
      if (hoverTimer.current) clearTimeout(hoverTimer.current);
      if (leaveTimer.current) clearTimeout(leaveTimer.current);
    };
  }, []);

  const color = STATUS_COLORS[status] || (edgeType && edgeType !== "default"
    ? (() => {
      const COLORS: Record<string, string> = {
        "true": "#22c55e", "false": "#ef4444",
        error: "#dc2626", timeout: "#f59e0b",
        fallback: "#6b7280",
      };
      return COLORS[edgeType] || DEFAULT_COLOR;
    })()
    : DEFAULT_COLOR);

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition,
  });

  const isRunning = status === "running";
  const isWaiting = status === "waiting";

  return (
    <g
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={{ cursor: "pointer" }}
    >
      {/* Invisible wider hit area for easier hover */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={20}
        style={{ pointerEvents: "stroke" }}
      />
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          stroke: color,
          strokeWidth: selected ? 3 : 2,
          filter: selected ? `drop-shadow(0 0 4px ${color})` : undefined,
          strokeDasharray: isRunning || isWaiting ? "8 4" : undefined,
          animation: isRunning
            ? "forge-edge-running 0.8s linear infinite"
            : isWaiting
              ? "forge-edge-waiting 2.4s linear infinite"
              : undefined,
          transition: "stroke 0.3s, stroke-width 0.15s, filter 0.15s",
        }}
      />
      {(hovered || selected) && (
        <path
          d={edgePath}
          fill="none"
          stroke={color}
          strokeWidth={6}
          opacity={0.15}
          style={{ pointerEvents: "none", transition: "opacity 0.2s" }}
        />
      )}
      {(label || condition) && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: "all",
            }}
            className="nodrag nopan"
          >
            <div
              className={`px-2 py-0.5 rounded-full text-[10px] font-medium border shadow-sm cursor-pointer transition-all ${
                selected
                  ? "ring-2 ring-offset-1 bg-background"
                  : "bg-background/90 hover:bg-background"
              }`}
              style={{
                borderColor: color,
                color,
                ...(selected ? { boxShadow: "0 0 0 1px var(--ps-accent-glow, rgba(59,130,246,0.3))" } : {}),
              }}
            >
              {label || condition || edgeType}
            </div>
          </div>
        </EdgeLabelRenderer>
      )}
      {showToolbar && (
        <EdgeLabelRenderer>
          <ForgeEdgeToolbar
            labelX={labelX}
            labelY={labelY}
            onAdd={() => {
              openNodeCreator?.({ x: labelX, y: labelY }, { sourceId: source, targetId: target });
              setShowToolbar(false);
            }}
            onDelete={() => {
              deleteEdge?.(id);
              setShowToolbar(false);
            }}
          />
        </EdgeLabelRenderer>
      )}
    </g>
  );
};
