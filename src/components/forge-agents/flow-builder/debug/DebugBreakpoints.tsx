/**
 * DebugBreakpoints — Breakpoint management tab
 */
import { memo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Circle, CircleDot, Trash2 } from "lucide-react";
import type { Node } from "@/types/xyflow-react-shim";
import type { BreakpointInfo } from "./debug-types";

interface Props {
  nodes: Node[];
  breakpoints: Map<string, BreakpointInfo>;
  onToggle: (node: Node) => void;
  onToggleEnabled: (nodeId: string) => void;
  onSetCondition: (nodeId: string, condition: string) => void;
  onClearAll: () => void;
  onHighlightNode: (nodeId: string | null) => void;
}

export const DebugBreakpoints = memo(function DebugBreakpoints({
  nodes, breakpoints, onToggle, onToggleEnabled, onSetCondition, onClearAll, onHighlightNode,
}: Props) {
  return (
    <>
      <div className="text-[10px] text-muted-foreground mb-2">
        Clique nos nós para adicionar/remover breakpoints.
      </div>
      {nodes.map((node) => {
        const bp = breakpoints.get(node.id);
        const isActive = !!bp;
        return (
          <div
            key={node.id}
            className={`rounded-lg border p-2.5 cursor-pointer transition-colors ${
              isActive ? "border-destructive/50 bg-destructive/5" : "border-border hover:bg-accent/50"
            }`}
            onMouseEnter={() => onHighlightNode(node.id)}
            onMouseLeave={() => onHighlightNode(null)}
          >
            <div className="flex items-center gap-2">
              <button onClick={() => onToggle(node)} className="shrink-0">
                {isActive
                  ? <CircleDot className="h-4 w-4 text-destructive" />
                  : <Circle className="h-4 w-4 text-muted-foreground" />}
              </button>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-medium truncate">{(node.data?.label as string) || node.id}</span>
                  <Badge variant="secondary" className="text-[9px] px-1 py-0">{node.type}</Badge>
                </div>
              </div>
              {bp && (
                <div className="flex items-center gap-1">
                  {bp.hitCount > 0 && (
                    <Badge variant="outline" className="text-[9px] px-1 py-0">{bp.hitCount}×</Badge>
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); onToggleEnabled(node.id); }}
                    className={`text-[9px] px-1.5 py-0.5 rounded ${bp.enabled ? "bg-destructive/20 text-destructive" : "bg-muted text-muted-foreground"}`}
                  >
                    {bp.enabled ? "ON" : "OFF"}
                  </button>
                </div>
              )}
            </div>
            {bp && (
              <div className="mt-2">
                <Input
                  value={bp.condition || ""}
                  onChange={(e) => onSetCondition(node.id, e.target.value)}
                  placeholder="Condição (ex: output.status === 'error')"
                  className="h-6 text-[10px] font-mono"
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
            )}
          </div>
        );
      })}
      {breakpoints.size > 0 && (
        <Button variant="ghost" size="sm" className="w-full text-xs text-muted-foreground" onClick={onClearAll}>
          <Trash2 className="h-3 w-3 mr-1" />
          Limpar todos
        </Button>
      )}
    </>
  );
});
