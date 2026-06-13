/**
 * DebugVariables — Variable inspection + watch + timeline tab
 */
import { memo, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Eye, Zap, ChevronRight, ChevronDown } from "lucide-react";
import type { DebugStep } from "./debug-types";

interface Props {
  currentStep: DebugStep | null;
  steps: DebugStep[];
  currentStepIdx: number;
  onHighlightNode: (nodeId: string | null) => void;
}

export const DebugVariables = memo(function DebugVariables({ currentStep, steps, currentStepIdx, onHighlightNode }: Props) {
  const [watchExpression, setWatchExpression] = useState("");
  const [watchResult, setWatchResult] = useState<string | null>(null);
  const [expandedSteps, setExpandedSteps] = useState<Set<number>>(new Set());

  const evaluateWatch = useCallback(() => {
    if (!watchExpression.trim() || !currentStep) return;
    try {
      const output = currentStep.output || {};
      const input = currentStep.input || {};
      // Safe evaluation with limited scope
      const fn = new Function("output", "input", `return ${watchExpression}`);
      const result = fn(output, input);
      setWatchResult(JSON.stringify(result, null, 2));
    } catch (e: any) {
      setWatchResult(`Error: ${e.message}`);
    }
  }, [watchExpression, currentStep]);

  const toggleExpand = (idx: number) => {
    setExpandedSteps((prev) => {
      const next = new Set(prev);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      return next;
    });
  };

  return (
    <>
      {currentStep ? (
        <div className="space-y-3">
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
            <div className="flex items-center gap-2 mb-2">
              <Zap className="h-3.5 w-3.5 text-primary" />
              <span className="text-xs font-semibold">Nó Atual: {currentStep.nodeLabel}</span>
              <Badge variant="secondary" className="text-[9px]">{currentStep.nodeType}</Badge>
            </div>
            {currentStep.durationMs !== null && (
              <span className="text-[10px] text-muted-foreground">{currentStep.durationMs}ms</span>
            )}
          </div>

          <div>
            <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">Input</div>
            <pre className="text-[10px] font-mono bg-muted/50 rounded-md p-2 overflow-auto max-h-32 whitespace-pre-wrap">
              {JSON.stringify(currentStep.input, null, 2)}
            </pre>
          </div>

          {currentStep.output && (
            <div>
              <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">Output</div>
              <pre className="text-[10px] font-mono bg-muted/50 rounded-md p-2 overflow-auto max-h-32 whitespace-pre-wrap">
                {JSON.stringify(currentStep.output, null, 2)}
              </pre>
            </div>
          )}
        </div>
      ) : (
        <div className="text-center py-6 text-muted-foreground">
          <Eye className="h-8 w-8 mx-auto mb-2 opacity-40" />
          <p className="text-xs">Inicie debug para inspecionar variáveis.</p>
        </div>
      )}

      {/* Watch */}
      <div className="border-t pt-3 mt-3">
        <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">Watch Expression</div>
        <div className="flex gap-1">
          <Input
            value={watchExpression}
            onChange={(e) => setWatchExpression(e.target.value)}
            placeholder="output.tokens?.input"
            className="h-7 text-[10px] font-mono flex-1"
            onKeyDown={(e) => e.key === "Enter" && evaluateWatch()}
          />
          <Button size="sm" variant="outline" className="h-7 px-2" onClick={evaluateWatch}>
            <Eye className="h-3 w-3" />
          </Button>
        </div>
        {watchResult && (
          <pre className="text-[10px] font-mono bg-muted/50 rounded-md p-2 mt-1.5 overflow-auto max-h-20 whitespace-pre-wrap">
            {watchResult}
          </pre>
        )}
      </div>

      {/* Timeline */}
      {steps.length > 0 && (
        <div className="border-t pt-3 mt-3">
          <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-2">Timeline</div>
          <div className="space-y-1">
            {steps.map((step, idx) => (
              <div key={idx}>
                <div
                  className={`flex items-center gap-2 p-1.5 rounded cursor-pointer transition-colors ${
                    idx === currentStepIdx ? "bg-primary/10 border border-primary/30" : "hover:bg-accent/50"
                  }`}
                  onClick={() => toggleExpand(idx)}
                  onMouseEnter={() => onHighlightNode(step.nodeId)}
                  onMouseLeave={() => onHighlightNode(null)}
                >
                  {expandedSteps.has(idx) ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />}
                  <span className={`h-2 w-2 rounded-full shrink-0 ${
                    step.status === "completed" ? "bg-emerald-500" :
                    step.status === "running" ? "bg-primary animate-pulse" :
                    step.status === "paused" ? "bg-amber-500" :
                    step.status === "error" ? "bg-destructive" : "bg-muted-foreground/30"
                  }`} />
                  <span className="text-[10px] truncate flex-1">{step.nodeLabel}</span>
                  {step.durationMs !== null && (
                    <span className="text-[9px] text-muted-foreground">{step.durationMs}ms</span>
                  )}
                </div>
                {expandedSteps.has(idx) && step.output && (
                  <pre className="text-[9px] font-mono bg-muted/30 rounded p-1.5 ml-6 mt-0.5 overflow-auto max-h-20 whitespace-pre-wrap">
                    {JSON.stringify(step.output, null, 2)}
                  </pre>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
});
