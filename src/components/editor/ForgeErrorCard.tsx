type ForgeErrorCardProps = {
  message: string;
  onResume?: () => void;
  onOpenInspector?: () => void;
};

export function ForgeErrorCard({ message, onResume, onOpenInspector }: ForgeErrorCardProps) {
  return (
    <section
      className="forge-error-card rounded-lg border border-[var(--status-failed)]/35 bg-[var(--status-failed)]/8 px-3 py-2.5"
      data-testid="forge-error-card"
    >
      <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{message}</p>
      <div className="mt-2 flex flex-wrap gap-3">
        {onResume && (
          <button
            type="button"
            className="font-mono text-[10px] text-[var(--status-working)] hover:underline"
            onClick={onResume}
          >
            Continuar execução
          </button>
        )}
        {onOpenInspector && (
          <button
            type="button"
            className="font-mono text-[10px] text-[var(--status-working)] hover:underline"
            onClick={onOpenInspector}
          >
            Ver detalhes no inspector
          </button>
        )}
      </div>
    </section>
  );
}