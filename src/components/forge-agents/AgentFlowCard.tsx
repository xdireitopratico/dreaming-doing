/**
 * AgentFlowCard — Card individual de agente na listagem
 * ROADMAP-02: Fase 5.1 (confirmação exclusão) + Fase 5.2 (botão testar)
 */
import { Copy, Trash2, Zap, Clock, BarChart3, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import type { AgentFlow } from "./hooks/useAgentFlows";

const statusColor: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  published: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  archived: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
};

interface AgentFlowCardProps {
  flow: AgentFlow;
  onOpen: (id: string) => void;
  onDuplicate: (flow: AgentFlow) => void;
  onDelete: (id: string) => void;
  onTest?: (id: string) => void;
}

export function AgentFlowCard({ flow, onOpen, onDuplicate, onDelete, onTest }: AgentFlowCardProps) {
  return (
    <Card
      className="cursor-pointer hover:border-primary/50 transition-colors"
      onClick={() => onOpen(flow.id)}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-semibold truncate">{flow.name}</h3>
              <Badge variant="secondary" className={statusColor[flow.status] || ""}>
                {flow.status}
              </Badge>
              <span className="text-xs text-muted-foreground">v{flow.version}</span>
            </div>
            {flow.description && (
              <p className="text-sm text-muted-foreground truncate">{flow.description}</p>
            )}
            <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Zap className="h-3 w-3" />
                {flow.total_executions || 0} execuções
              </span>
              {flow.avg_latency_ms && (
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {flow.avg_latency_ms}ms
                </span>
              )}
              {flow.avg_quality_score && (
                <span className="flex items-center gap-1">
                  <BarChart3 className="h-3 w-3" />
                  {flow.avg_quality_score}
                </span>
              )}
              {flow.channels?.length > 0 && (
                <span>{flow.channels.join(", ")}</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            {onTest && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-primary"
                title="Testar agente"
                onClick={() => onTest(flow.id)}
              >
                <Play className="h-4 w-4" />
              </Button>
            )}
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onDuplicate(flow)}>
              <Copy className="h-4 w-4" />
            </Button>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Excluir agente</AlertDialogTitle>
                  <AlertDialogDescription>
                    Tem certeza que deseja excluir "{flow.name}"? Esta ação não pode ser desfeita.
                    Todas as execuções e dados associados serão removidos.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={() => onDelete(flow.id)}
                  >
                    Excluir
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
