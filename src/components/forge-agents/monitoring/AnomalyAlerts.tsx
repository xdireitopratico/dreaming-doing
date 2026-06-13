/**
 * AnomalyAlerts — Visual alerts for detected anomalies
 */
import { memo } from "react";
import { AlertTriangle, XCircle, AlertOctagon, Info } from "lucide-react";
import type { Anomaly } from "./monitoring-types";

const SEVERITY_CONFIG = {
  critical: { icon: XCircle, bg: "bg-destructive/10 border-destructive/30", text: "text-destructive", label: "CRÍTICO" },
  high: { icon: AlertOctagon, bg: "bg-destructive/5 border-destructive/20", text: "text-destructive", label: "ALTO" },
  medium: { icon: AlertTriangle, bg: "bg-amber-50 border-amber-200 dark:bg-amber-900/10 dark:border-amber-800/30", text: "text-amber-700 dark:text-amber-400", label: "MÉDIO" },
  low: { icon: Info, bg: "bg-muted border-border", text: "text-muted-foreground", label: "BAIXO" },
} as const;

interface AnomalyAlertsProps {
  anomalies: Anomaly[];
}

export const AnomalyAlerts = memo(function AnomalyAlerts({ anomalies }: AnomalyAlertsProps) {
  if (anomalies.length === 0) return null;

  return (
    <div className="space-y-2">
      {anomalies.map((anomaly, i) => {
        const cfg = SEVERITY_CONFIG[anomaly.severity];
        const Icon = cfg.icon;
        return (
          <div
            key={`${anomaly.type}-${i}`}
            className={`flex items-center gap-3 px-4 py-2.5 rounded-lg border ${cfg.bg}`}
          >
            <Icon className={`h-4 w-4 shrink-0 ${cfg.text}`} />
            <div className="flex-1 min-w-0">
              <span className={`text-xs font-medium ${cfg.text}`}>{anomaly.message}</span>
            </div>
            <span className={`text-[9px] font-bold ${cfg.text} shrink-0`}>{cfg.label}</span>
          </div>
        );
      })}
    </div>
  );
});
