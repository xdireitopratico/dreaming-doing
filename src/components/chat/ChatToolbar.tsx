import { useState, useCallback } from "react";
import { Copy, RotateCcw } from "lucide-react";

type ChatToolbarProps = {
  text: string;
  align?: "start" | "end";
  canRollback?: boolean;
  onRollback?: () => void;
};

export function ChatToolbar({
  text,
  align = "end",
  canRollback,
  onRollback,
}: ChatToolbarProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    const markCopied = () => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    };

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        markCopied();
        return;
      }
    } catch {
      /* fallback */
    }

    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand("copy");
      markCopied();
    } finally {
      document.body.removeChild(ta);
    }
  }, [text]);

  if (!text.trim()) return null;

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