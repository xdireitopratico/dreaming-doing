type ForgeErrorCardProps = {
  message: string;
  onResume?: () => void;
  onOpenInspector?: () => void;
};

export function ForgeErrorCard({ message, onResume, onOpenInspector }: ForgeErrorCardProps) {
  return (
    <section
      className="my-2 rounded-lg border border-amber-400/35 bg-amber-400/8 px-3 py-2.5"
      data-testid="forge-error-card"
    >
      <p className="text-[12px] text-[var(--forge-silver)] leading-relaxed">{message}</p>
      <div className="mt-2 flex flex-wrap gap-3">
        {onResume && (
          <button
            type="button"
            className="font-mono text-[10px] text-[var(--forge-primary)] hover:underline"
            onClick={onResume}
          >
            Continuar execução
          </button>
        )}
        {onOpenInspector && (
          <button
            type="button"
            className="font-mono text-[10px] text-[var(--forge-primary)] hover:underline"
            onClick={onOpenInspector}
          >
            Ver detalhes no inspector
          </button>
        )}
      </div>
    </section>
  );
}