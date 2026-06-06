import type { AgentProgress } from "@/hooks/useSSE";
import { Button } from "@/components/ui/button";
import { RefreshCw, AlertTriangle } from "lucide-react";

interface AgentPanelProps {
  running: boolean;
  progress: AgentProgress;
  onResume?: () => void;
}

const PHASE_LABELS: Record<string, string> = {
  gather: "Analisando projeto",
  classify: "Classificando",
  plan: "Planejando",
  execute: "Gerando código",
  observe: "Verificando build",
  summarize: "Finalizando",
};

export function AgentPanel({ running, progress, onResume }: AgentPanelProps) {
  const showBar = running || progress.resumable || progress.statusHint;

  if (!showBar) return null;

  const label = PHASE_LABELS[progress.phase ?? ""] ?? progress.message ?? "Trabalhando";

  return (
    <div className="forge-agent-bar flex flex-col gap-2">
      {running && (
        <div>
          <strong>FORGE</strong> — {label}
          {progress.currentStep != null && progress.totalSteps != null && (
            <span className="ml-2 opacity-70">
              ({progress.currentStep}/{progress.totalSteps})
            </span>
          )}
        </div>
      )}

      {progress.statusHint && (
        <p className="font-mono text-[10px] text-amber-400/90 leading-relaxed">{progress.statusHint}</p>
      )}

      {!running && progress.resumable && !progress.autoResuming && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-400/25 bg-amber-400/10 px-3 py-2">
          <AlertTriangle className="size-4 text-amber-400 shrink-0" />
          <p className="flex-1 min-w-[200px] font-mono text-[10px] text-[var(--forge-silver)] leading-relaxed">
            {progress.error ??
              "Execução pausada. O histórico do chat foi salvo — o agente continua de onde parou."}
          </p>
          {onResume && (
            <Button
              type="button"
              size="sm"
              className="bg-[var(--forge-primary)] text-[#0a0a0a] hover:bg-[var(--forge-primary-hot)]"
              onClick={onResume}
            >
              <RefreshCw className="size-3.5 mr-1" />
              Continuar
            </Button>
          )}
        </div>
      )}
    </div>
  );
}