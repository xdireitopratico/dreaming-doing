import { useState } from "react";
import { HelpCircle, Loader2, Send, SkipForward } from "lucide-react";
import type { ClarifyChoice, ClarifyPrompt } from "@/lib/chat/types";

type ChatClarifyProps = {
  data: ClarifyPrompt;
  disabled?: boolean;
  onSelect?: (choice: ClarifyChoice) => void;
  /** Resposta de texto livre do usuário (fallback quando nenhuma opção serve). */
  onCustomReply?: (text: string) => void;
  /** Skip — usuário decide pular a pergunta sem responder. */
  onSkip?: () => void;
};

/**
 * Clarify dock — padronizado com o ChatPlanDock.
 *
 * Renderiza a pergunta do agente como um card dock (mesmo visual do plano),
 * com:
 *  - Opções clicáveis (choices) como botões secundários
 *  - Botão Skip (pular sem responder)
 *  - Input de texto próprio (resposta livre) com botão Send
 *
 * Quando o usuário responde (opção, skip ou texto), o ChatPanel envia como
 * mensagem de user normal via onSend — o agente consome e continua.
 */
export function ChatClarify({ data, disabled, onSelect, onCustomReply, onSkip }: ChatClarifyProps) {
  const [customText, setCustomText] = useState("");
  const [busy, setBusy] = useState(false);

  const handleSelect = (choice: ClarifyChoice) => {
    if (disabled || busy) return;
    setBusy(true);
    onSelect?.(choice);
  };

  const handleSkip = () => {
    if (disabled || busy) return;
    setBusy(true);
    onSkip?.();
  };

  const handleSendCustom = () => {
    const text = customText.trim();
    if (!text || disabled || busy || !onCustomReply) return;
    setBusy(true);
    onCustomReply(text);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendCustom();
    }
  };

  return (
    <div className="forge-plan-dock forge-clarify-dock" data-testid="chat-clarify">
      <div className="forge-card-shell forge-clarify-dock-shell">
        <div className="forge-clarify-content">
          <div className="forge-plan-dock-header">
            <p className="forge-plan-dock-label forge-plan-dock-label--icon">
              <HelpCircle className="size-3" aria-hidden />
              Clarify
            </p>
          </div>

          {data.intro && <p className="forge-clarify-intro">{data.intro}</p>}
          {data.question && <p className="forge-clarify-question">{data.question}</p>}

          <ul className="forge-clarify-options">
            {data.choices.map((choice) => (
              <li key={choice.id}>
                <button
                  type="button"
                  className={`forge-clarify-option${disabled ? " forge-clarify-option--disabled" : ""}`}
                  disabled={disabled || busy}
                  onClick={() => handleSelect(choice)}
                >
                  <span className="forge-clarify-option-label">{choice.label}</span>
                  {choice.description && (
                    <span className="forge-clarify-option-desc">{choice.description}</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="forge-clarify-custom">
          <textarea
            className="forge-clarify-input"
            placeholder="Ou digite sua própria resposta…"
            value={customText}
            disabled={disabled || busy}
            onChange={(e) => setCustomText(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
          />
          <div className="forge-composer-row">
            <div className="forge-composer-row-start">
              <button
                type="button"
                className="forge-plan-dock-btn"
                disabled={disabled || busy}
                onClick={handleSkip}
              >
                {busy ? <Loader2 className="size-3.5 animate-spin" /> : <SkipForward className="size-3.5" />}
                Skip
              </button>
            </div>
            <div className="forge-composer-spacer" aria-hidden />
            <div className="forge-composer-row-end">
              <button
                type="button"
                className="forge-plan-dock-btn forge-plan-dock-btn--approve"
                disabled={disabled || busy || !customText.trim() || !onCustomReply}
                onClick={handleSendCustom}
              >
                {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
                Send
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** @deprecated Use ChatClarify */
export const ChatQualify = ChatClarify;
