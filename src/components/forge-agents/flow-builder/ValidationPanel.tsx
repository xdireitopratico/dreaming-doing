/**
 * ValidationPanel — Painel de erros e warnings de validação do flow
 */
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  X,
  AlertTriangle,
  AlertCircle,
  Info,
  CheckCircle2,
  Lightbulb,
} from "lucide-react";
import type { Node, Edge } from "@xyflow/react";
import { validateFlow, type ValidationIssue } from "./utils/schema-validator";

interface ValidationPanelProps {
  nodes: Node[];
  edges: Edge[];
  onHighlightNode: (nodeId: string | null) => void;
  onClose: () => void;
}

const SEVERITY_CONFIG = {
  error: {
    icon: AlertCircle,
    color: "text-destructive",
    bg: "bg-destructive/10",
    border: "border-destructive/30",
    badge: "bg-destructive/20 text-destructive",
    label: "Erro",
  },
  warning: {
    icon: AlertTriangle,
    color: "text-amber-500",
    bg: "bg-amber-500/10",
    border: "border-amber-500/30",
    badge: "bg-amber-500/20 text-amber-600 dark:text-amber-400",
    label: "Aviso",
  },
  info: {
    icon: Info,
    color: "text-blue-500",
    bg: "bg-blue-500/10",
    border: "border-blue-500/30",
    badge: "bg-blue-500/20 text-blue-600 dark:text-blue-400",
    label: "Info",
  },
};

export function ValidationPanel({ nodes, edges, onHighlightNode, onClose }: ValidationPanelProps) {
  const issues = useMemo(() => validateFlow(nodes, edges), [nodes, edges]);

  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");
  const infos = issues.filter((i) => i.severity === "info");

  const isValid = errors.length === 0;

  return (
    <div className="w-80 border-l bg-background flex flex-col shrink-0 h-full">
      {/* Header */}
      <div className="p-3 border-b flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          {isValid ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          ) : (
            <AlertCircle className="h-4 w-4 text-destructive" />
          )}
          <span className="text-sm font-semibold">Validação</span>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Summary */}
      <div className="p-3 border-b flex gap-2 shrink-0">
        <Badge variant="secondary" className={errors.length > 0 ? SEVERITY_CONFIG.error.badge : "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400"}>
          {errors.length} erro(s)
        </Badge>
        <Badge variant="secondary" className={warnings.length > 0 ? SEVERITY_CONFIG.warning.badge : "bg-muted text-muted-foreground"}>
          {warnings.length} aviso(s)
        </Badge>
        {infos.length > 0 && (
          <Badge variant="secondary" className={SEVERITY_CONFIG.info.badge}>
            {infos.length} info
          </Badge>
        )}
      </div>

      {/* Issues List */}
      <ScrollArea className="flex-1">
        <div className="p-3 space-y-2">
          {issues.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <CheckCircle2 className="h-10 w-10 mx-auto mb-3 text-emerald-500" />
              <p className="text-sm font-medium">Flow válido!</p>
              <p className="text-xs mt-1">Nenhum problema encontrado.</p>
            </div>
          ) : (
            issues.map((issue) => {
              const config = SEVERITY_CONFIG[issue.severity];
              const Icon = config.icon;

              return (
                <div
                  key={issue.id}
                  className={`rounded-lg border p-3 cursor-pointer transition-colors hover:bg-accent/50 ${config.border} ${config.bg}`}
                  onMouseEnter={() => onHighlightNode(issue.nodeId || issue.sourceNodeId || issue.targetNodeId || null)}
                  onMouseLeave={() => onHighlightNode(null)}
                >
                  <div className="flex items-start gap-2">
                    <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${config.color}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium leading-snug">{issue.message}</p>
                      {issue.suggestion && (
                        <div className="flex items-start gap-1.5 mt-1.5">
                          <Lightbulb className="h-3 w-3 mt-0.5 shrink-0 text-muted-foreground" />
                          <p className="text-[10px] text-muted-foreground leading-snug">{issue.suggestion}</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </ScrollArea>

      {/* Footer */}
      <div className="p-3 border-t shrink-0">
        <div className={`text-xs text-center font-medium ${isValid ? "text-emerald-500" : "text-destructive"}`}>
          {isValid ? "✓ Pronto para publicar" : "✗ Corrija os erros antes de publicar"}
        </div>
      </div>
    </div>
  );
}
