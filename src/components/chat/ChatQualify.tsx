import type { QualifyPrompt } from "@/lib/chat/types";

type ChatQualifyProps = {
  data: QualifyPrompt;
  disabled?: boolean;
  onSelect: (label: string) => void;
};

export function ChatQualify({ data, disabled, onSelect }: ChatQualifyProps) {
  return (
    <section className="forge-qualify-prompt">
      {data.intro && <p className="forge-qualify-prompt-intro">{data.intro}</p>}
      {data.question && <p className="forge-qualify-prompt-question">{data.question}</p>}
      <ul className="forge-qualify-prompt-options">
        {data.choices.map((choice) => (
          <li key={choice.label}>
            <button
              type="button"
              className="forge-qualify-option"
              disabled={disabled}
              onClick={() => onSelect(choice.label)}
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
