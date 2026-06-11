import { ANTI_GENERIC_CHECKLIST, ANTI_GENERIC_MISSION } from "../tokens/anti-generic";

export function formatAntiGenericPrompt(): string {
  return `${ANTI_GENERIC_MISSION}

Checklist obrigatório antes de finalizar UI:
${ANTI_GENERIC_CHECKLIST.map((item, i) => `${i + 1}. ${item}`).join("\n")}`;
}

export { ANTI_GENERIC_CHECKLIST, ANTI_GENERIC_MISSION };
