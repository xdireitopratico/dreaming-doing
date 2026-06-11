import { useState, useCallback } from "react";
import { Copy, RotateCcw } from "lucide-react";

type ChatToolbarProps = {
  text: string;
  msgId: string;
  align?: "start" | "end";
  canRollback?: boolean;
  onRollback?: () => void;
};

export function ChatToolbar({
  text,
  msgId,
  align = "start",
  canRollback,
  onRollback,
}: ChatToolbarProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [text]);

  if (!text.trim()) return null;

  return (
    <footer
      className="forge-message-toolbar"
      style={{ justifyContent: align === "end" ? "flex-end" : "flex-start" }}
    >
      <button
        type="button"
        className="forge-msg-action"
        onClick={handleCopy}
        title={copied ? "Copiado!" : "Copiar"}
      >
        <Copy className="size-3.5" />
      </button>
      {canRollback && onRollback && (
        <button
          type="button"
          className="forge-msg-action"
          onClick={onRollback}
          title="Voltar ao estado anterior"
        >
          <RotateCcw className="size-3.5" />
        </button>
      )}
    </footer>
  );
}
