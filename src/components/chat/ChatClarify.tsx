import type { ClarifyChoice, ClarifyPrompt } from "@/lib/chat/types";

type ChatClarifyProps = {
  data: ClarifyPrompt;
  disabled?: boolean;
  onSelect?: (choice: ClarifyChoice) => void;
};

export function ChatClarify({ data, disabled, onSelect }: ChatClarifyProps) {
  return (
    <section className="forge-qualify-prompt" data-testid="chat-clarify">
      {data.intro && <p className="forge-qualify-prompt-intro">{data.intro}</p>}
      {data.question && <p className="forge-qualify-prompt-question">{data.question}</p>}
      <ul className="forge-qualify-prompt-options">
        {data.choices.map((choice) => (
          <li key={choice.label}>
            <button
              type="button"
              className={`forge-qualify-option${disabled ? " forge-qualify-option--disabled" : ""}`}
              disabled={disabled}
              onClick={() => onSelect?.(choice)}
            >
              <span className="forge-qualify-option-label">{choice.label}</span>
              {choice.description && (
                <span className="forge-qualify-option-desc">{choice.description}</span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** @deprecated Use ChatClarify */
export const ChatQualify = ChatClarify;