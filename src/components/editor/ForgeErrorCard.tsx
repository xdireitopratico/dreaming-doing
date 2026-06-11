type ForgeErrorCardProps = {
  message: string;
  onResume?: () => void;
  onOpenInspector?: () => void;
};

export function ForgeErrorCard({ message, onResume, onOpenInspector }: ForgeErrorCardProps) {
  return (
    <section className="forge-error-card" data-testid="forge-error-card">
      <p className="forge-error-card-text">{message}</p>
      <div className="forge-error-card-actions">
        {onResume && (
          <button type="button" className="forge-error-card-link" onClick={onResume}>
            Continuar execução
          </button>
        )}
        {onOpenInspector && (
          <button type="button" className="forge-error-card-link" onClick={onOpenInspector}>
            Ver detalhes no inspector
          </button>
        )}
      </div>
    </section>
  );
}
