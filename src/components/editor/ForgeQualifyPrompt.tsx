import { cn } from "@/lib/utils";
import type { ParsedQualifyPrompt } from "@/lib/qualify-choices";

type ForgeQualifyPromptProps = {
  data: ParsedQualifyPrompt;
  onSelect: (label: string) => void;
  disabled?: boolean;
};

export function ForgeQualifyPrompt({
  data,
  onSelect,
  disabled = false,
}: ForgeQualifyPromptProps) {
  return (
    <section className="forge-qualify-prompt" data-testid="forge-qualify-prompt">
      {data.intro && <p className="forge-qualify-prompt-intro">{data.intro}</p>}
      {data.question && <p className="forge-qualify-prompt-question">{data.question}</p>}

      <ul className="forge-qualify-prompt-options">
        {data.choices.map((choice) => (
          <li key={choice.id}>
            <button
              type="button"
              className={cn("forge-qualify-option", disabled && "forge-qualify-option--disabled")}
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