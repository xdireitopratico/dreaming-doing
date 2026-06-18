import { useState, useCallback } from "react";
import { Copy, RotateCcw } from "lucide-react";
import { copyToClipboard } from "@/lib/copy-to-clipboard";

type ChatToolbarProps = {
  text: string;
  align?: "start" | "end";
  canRollback?: boolean;
  onRollback?: () => void;
  /** Turn em progresso: esconde a toolbar inteira (cópia só no done). */
  isActive?: boolean;
};

export function ChatToolbar({
  text,
  align = "end",
  canRollback,
  onRollback,
  isActive,
}: ChatToolbarProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [text]);

  if (isActive || !text.trim()) return null;

  return (
    <footer
      className={`forge-message-toolbar forge-message-toolbar--${align}`}
      data-testid="chat-message-toolbar"
    >
      <button
        type="button"
        className="forge-message-action"
        onClick={handleCopy}
        title={copied ? "Copiado!" : "Copiar"}
        aria-label={copied ? "Copiado" : "Copiar mensagem"}
      >
        <Copy className="size-3.5" />
      </button>
      {canRollback && onRollback && (
        <button
          type="button"
          className="forge-message-action"
          onClick={onRollback}
          title="Voltar ao estado anterior"
          aria-label="Rollback"
        >
          <RotateCcw className="size-3.5" />
        </button>
      )}
    </footer>
  );
}