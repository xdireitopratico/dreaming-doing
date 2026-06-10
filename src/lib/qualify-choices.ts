export type QualifyChoice = {
  id: string;
  label: string;
  description?: string;
};

export type ParsedQualifyPrompt = {
  intro: string;
  question: string | null;
  choices: QualifyChoice[];
};

function cleanInline(text: string): string {
  return text.replace(/\*\*/g, "").replace(/\*/g, "").trim();
}

/**
 * Extrai opções de múltipla escolha de perguntas qualify (bullets, A/B/C, numeradas).
 * Retorna null se não houver pelo menos 2 opções clicáveis.
 */
export function parseQualifyChoices(text: string): ParsedQualifyPrompt | null {
  const lines = text.split("\n");
  const choices: QualifyChoice[] = [];
  const introLines: string[] = [];
  const questionLines: string[] = [];
  let phase: "intro" | "question" | "choices" = "intro";

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    const bulletBold = line.match(
      /^[-*•]\s+\*\*(.+?)\*\*(?:\s*[—–-]\s*(.+))?$/,
    );
    const bulletPlain = line.match(/^[-*•]\s+(.+)$/);
    const letter = line.match(/^([A-Da-d])[.)]\s+(.+)$/);
    const numbered = line.match(/^(\d+)[.)]\s+(.+)$/);

    if (bulletBold) {
      phase = "choices";
      choices.push({
        id: `c${choices.length}`,
        label: cleanInline(bulletBold[1]),
        description: bulletBold[2] ? cleanInline(bulletBold[2]) : undefined,
      });
      continue;
    }

    if (letter) {
      phase = "choices";
      choices.push({
        id: letter[1].toLowerCase(),
        label: cleanInline(letter[2]),
      });
      continue;
    }

    if (numbered && phase !== "intro") {
      phase = "choices";
      choices.push({
        id: `n${numbered[1]}`,
        label: cleanInline(numbered[2]),
      });
      continue;
    }

    if (phase === "choices") continue;

    if (/\?\s*$/.test(line) || /qual caminho|qual opção|qual prefere|o que prefere/i.test(line)) {
      phase = "question";
      questionLines.push(cleanInline(line));
      continue;
    }

    if (phase === "question") {
      questionLines.push(cleanInline(line));
      continue;
    }

    introLines.push(cleanInline(line));
  }

  if (choices.length < 2) return null;

  return {
    intro: introLines.join("\n").trim(),
    question: questionLines.join(" ").trim() || null,
    choices,
  };
}

export function formatQualifyChoiceReply(choice: QualifyChoice): string {
  return choice.description ? `${choice.label} — ${choice.description}` : choice.label;
}