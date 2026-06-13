/**
 * AgentHealthCard — Per-agent health indicator with expandable details
 */
import { memo } from "react";
import { ChevronDown, ChevronUp, Clock, Zap, AlertTriangle, Cpu, DollarSign } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { AgentHealth } from "./monitoring-types";

const HEALTH_CONFIG = {
  healthy: { label: "Saudável", color: "bg-emerald-500", badgeClass: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
  degraded: { label: "Degradado", color: "bg-amber-500", badgeClass: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
  critical: { label: "Crítico", color: "bg-destructive", badgeClass: "bg-destructive/10 text-destructive" },
  inactive: { label: "Inativo", color: "bg-muted-foreground/30", badgeClass: "bg-muted text-muted-foreground" },
} as const;

interface AgentHealthCardProps {
  agent: AgentHealth;
  expanded: boolean;
  onToggle: () => void;
}

export const AgentHealthCard = memo(function AgentHealthCard({ agent, expanded, onToggle }: AgentHealthCardProps) {
  const cfg = HEALTH_CONFIG[agent.health];
  const timeAgo = agent.lastExec ? getRelativeTime(agent.lastExec) : "Nunca";

  return (
    <Card className={`transition-colors ${agent.health === "critical" ? "border-destructive/50" : ""}`}>
      <CardContent className="p-3">
        {/* Main row */}
        <div className="flex items-center gap-3 cursor-pointer" onClick={onToggle}>
          {/* Health dot */}
          <div className={`h-3 w-3 rounded-full shrink-0 ${cfg.color}`} />

          {/* Name + status */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm truncate">{agent.name}</span>
              <Badge variant="secondary" className={`text-[10px] ${cfg.badgeClass}`}>
                {cfg.label}
              </Badge>
              <Badge variant="outline" className="text-[10px]">{agent.status}</Badge>
            </div>
          </div>

          {/* Quick metrics */}
          <div className="hidden sm:flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Zap className="h-3 w-3" />
              {agent.executions}
            </span>
            <span className={`flex items-center gap-1 ${agent.errorRate > 10 ? "text-destructive" : ""}`}>
              <AlertTriangle className="h-3 w-3" />
              {agent.errorRate.toFixed(1)}%
            </span>
            <span className={`flex items-center gap-1 ${agent.avgLatency > 5000 ? "text-destructive" : ""}`}>
              <Clock className="h-3 w-3" />
              {agent.avgLatency}ms
            </span>
            <span className="text-[10px]">{timeAgo}</span>
          </div>

          {/* Expand toggle */}
          {expanded
            ? <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
            : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
          }
        </div>

        {/* Expanded details */}
        {expanded && (
          <div className="mt-3 pt-3 border-t space-y-3">
            {/* Metrics grid */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              <MetricCell icon={Zap} label="Execuções" value={agent.executions.toString()} />
              <MetricCell
                icon={AlertTriangle}
                label="Taxa erro"
                value={`${agent.errorRate.toFixed(1)}%`}
                warning={agent.errorRate > 10}
              />
              <MetricCell
                icon={Clock}
                label="Latência"
                value={`${agent.avgLatency}ms`}
                warning={agent.avgLatency > 5000}
              />
              <MetricCell icon={Cpu} label="Tokens" value={agent.tokens.toLocaleString()} />
              <MetricCell icon={DollarSign} label="Custo" value={`$${agent.cost.toFixed(4)}`} />
            </div>

            {/* Recent errors */}
            {agent.recentErrors.length > 0 && (
              <div className="space-y-1">
                <div className="text-[10px] font-semibold text-destructive">Erros recentes:</div>
                {agent.recentErrors.map(err => (
                  <div key={err.id} className="text-[10px] text-muted-foreground bg-destructive/5 rounded px-2 py-1 border border-destructive/10">
                    <span className="text-destructive font-mono">{err.error.slice(0, 80)}</span>
                    <span className="ml-2 opacity-60">{getRelativeTime(err.at)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
});

function MetricCell({ icon: Icon, label, value, warning }: {
  icon: React.ElementType;
  label: string;
  value: string;
  warning?: boolean;
}) {
  return (
    <div className={`text-center p-2 rounded border ${warning ? "border-destructive/20 bg-destructive/5" : "bg-muted/20"}`}>
      <Icon className={`h-3 w-3 mx-auto mb-0.5 ${warning ? "text-destructive" : "text-muted-foreground"}`} />
      <div className={`text-sm font-bold ${warning ? "text-destructive" : ""}`}>{value}</div>
      <div className="text-[9px] text-muted-foreground">{label}</div>
    </div>
  );
}

function getRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "agora";
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}min`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h`;
  return `${Math.floor(diff / 86400_000)}d`;
}
