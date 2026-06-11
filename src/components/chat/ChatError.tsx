import { AlertTriangle } from "lucide-react";

type ChatErrorProps = {
  message: string;
  onResume?: () => void;
  onOpenInspector?: () => void;
};

export function ChatError({ message, onResume, onOpenInspector }: ChatErrorProps) {
  return (
    <div className="forge-error-card">
      <div className="forge-error-card-text">
        <AlertTriangle className="size-4 shrink-0 text-red-500" />
        <p>{message}</p>
      </div>
      <div className="forge-error-card-actions">
        {onResume && (
          <button type="button" className="forge-error-action" onClick={onResume}>
            Continuar execução
          </button>
        )}
        {onOpenInspector && (
          <button type="button" className="forge-error-action" onClick={onOpenInspector}>
            Ver detalhes no inspector
          </button>
        )}
      </div>
    </div>
  );
}
