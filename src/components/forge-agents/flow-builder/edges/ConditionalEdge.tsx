/**
 * ConditionalEdge — Edge customizado com label, cor condicional e badge de condição
 */
import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from "@/types/xyflow-react-shim";

const EDGE_COLORS: Record<string, string> = {
  default: "hsl(var(--primary))",
  true: "#22c55e",
  false: "#ef4444",
  error: "#dc2626",
  timeout: "#f59e0b",
  fallback: "#6b7280",
  case_1: "#3b82f6",
  case_2: "#8b5cf6",
  case_3: "#06b6d4",
  case_default: "#6b7280",
};

export function ConditionalEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected,
  markerEnd,
}: EdgeProps) {
  const edgeData = (data || {}) as Record<string, any>;
  const label = edgeData.label || "";
  const condition = edgeData.condition || "";
  const edgeType = edgeData.edge_type || "default";
  const color = EDGE_COLORS[edgeType] || EDGE_COLORS.default;

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          stroke: color,
          strokeWidth: selected ? 3 : 2,
          filter: selected ? `drop-shadow(0 0 4px ${color})` : undefined,
        }}
      />
      {(label || condition) && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: "all",
            }}
            className="nodrag nopan"
          >
            <div
              className={`px-2 py-0.5 rounded-full text-[10px] font-medium border shadow-sm cursor-pointer transition-all ${
                selected
                  ? "ring-2 ring-primary/30 bg-background"
                  : "bg-background/90 hover:bg-background"
              }`}
              style={{ borderColor: color, color }}
            >
              {label || condition || edgeType}
            </div>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
