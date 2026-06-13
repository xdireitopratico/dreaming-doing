/**
 * PrometheusBoardroomFeedbackBar — Chat input bar for boardroom
 * BUG 4 FIX: Use state instead of ref for isSending to trigger re-renders
 */
import { useState, useCallback } from "react";

interface Props {
  isStreaming: boolean;
  onSendFeedback: (text: string) => void;
}

export function PrometheusBoardroomFeedbackBar({ isStreaming, onSendFeedback }: Props) {
  const [feedbackText, setFeedbackText] = useState("");
  // BUG 4 FIX: Use state instead of ref so UI re-renders on change
  const [isSending, setIsSending] = useState(false);

  const handleSend = useCallback(() => {
    if (!feedbackText.trim() || isSending) return;
    setIsSending(true);
    onSendFeedback(feedbackText.trim());
    setFeedbackText("");
    setTimeout(() => { setIsSending(false); }, 700);
  }, [feedbackText, onSendFeedback, isSending]);

  return (
    <div className="flex-shrink-0 px-6 py-3" style={{ borderTop: "1px solid var(--ps-border)", background: "rgba(10,12,20,0.8)", backdropFilter: "blur(8px)" }}>
      {isStreaming && (
        <p className="text-[10px] italic mb-1.5" style={{ color: "var(--ps-cream-25)" }}>
          💡 Seu direcionamento será aplicado na próxima fase automaticamente.
        </p>
      )}
      <div className="flex gap-2">
        <input
          value={feedbackText}
          onChange={e => setFeedbackText(e.target.value)}
          placeholder="Interromper, corrigir rumo, ou responder à equipe..."
          className="flex-1 rounded-lg px-3 py-2 text-[12px] outline-none"
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid var(--ps-border)", color: "var(--ps-cream)" }}
          onKeyDown={e => { if (e.key === "Enter" && feedbackText.trim()) handleSend(); }}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          name="prometheus-boardroom-feedback"
          data-form-type="other"
          data-lpignore="true"
        />
        <button
          onClick={handleSend}
          disabled={!feedbackText.trim() || isSending}
          className="px-4 py-2 rounded-lg text-[11px] font-semibold transition-opacity"
          style={{
            background: "var(--ps-accent)",
            color: "#000",
            opacity: feedbackText.trim() && !isSending ? 1 : 0.4,
          }}
        >
          Enviar
        </button>
      </div>
    </div>
  );
}
