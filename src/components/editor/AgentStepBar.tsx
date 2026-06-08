type AgentStepBarProps = {
  current: number;
  total: number;
  active?: boolean;
};

export function AgentStepBar({ current, total, active = false }: AgentStepBarProps) {
  if (total <= 0 || current <= 0) return null;

  const pct = Math.min(100, Math.round((current / total) * 100));

  return (
    <div
      className="lovable-step-bar"
      data-testid="agent-step-bar"
      data-active={active ? "true" : "false"}
      aria-label={`Passo ${current} de ${total}`}
    >
      <div className="lovable-step-bar-track" aria-hidden>
        <div className="lovable-step-bar-fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="lovable-step-bar-label">
        Passo {current}/{total}
      </span>
    </div>
  );
}