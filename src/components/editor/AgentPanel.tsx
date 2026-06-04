import type { AgentProgress } from "@/hooks/useSSE";

interface AgentPanelProps {
  running: boolean;
  progress: AgentProgress;
}

const PHASE_LABELS: Record<string, string> = {
  gather: "Analisando projeto",
  classify: "Classificando",
  plan: "Planejando",
  execute: "Gerando código",
  observe: "Verificando build",
  summarize: "Finalizando",
};

export function AgentPanel({ running, progress }: AgentPanelProps) {
  if (!running) return null;

  const label = PHASE_LABELS[progress.phase ?? ""] ?? progress.message ?? "Trabalhando";

  return (
    <div className="forge-agent-bar">
      <strong>FORGE</strong> — {label}
      {progress.currentStep != null && progress.totalSteps != null && (
        <span className="ml-2 opacity-70">
          ({progress.currentStep}/{progress.totalSteps})
        </span>
      )}
    </div>
  );
}