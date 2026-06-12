/**
 * Montagem única do system input do agente FORGE.
 * Espelha buildAgentSystemPrompt (loop.ts) — mesmas strings e ordem; só separadores estáveis.
 */
import { ANTI_LEAK_RULE } from "./run-context.ts";
import { forgeSessionModeBanner, VIBE_CLARIFY_HINT } from "./vibe-coding-prompt.ts";
import { buildStackEnforcement, EXECUTE_RULES, getSystemPrompt } from "./prompts.ts";
import { getTasteStartSystemPrompt } from "./prompts-taste.ts";

export type ForgeAgentSystemInputOpts = {
  planMode: boolean;
  projectTemplate: string;
  stackAddon?: string;
  skillPrompt?: string;
  sessionAddon?: string;
  antiLeakRule?: string;
  tasteStart?: boolean;
};

const SECTION = "\n\n---\n\n";

/** System prompt — uma fonte; Plan e Build diferem só em banner + catálogo de tools (planMode). */
export function buildForgeAgentSystemInput(opts: ForgeAgentSystemInputOpts): string {
  const base = getSystemPrompt(opts.projectTemplate, opts.planMode);
  const stackEnforcement = buildStackEnforcement(opts.projectTemplate);
  const withStack = opts.stackAddon?.trim() ? `${base}\n\n${opts.stackAddon.trim()}` : base;
  const withEnforcement = stackEnforcement ? `${withStack}\n\n${stackEnforcement}` : withStack;
  const tasteWrapped = opts.tasteStart
    ? getTasteStartSystemPrompt(withEnforcement)
    : withEnforcement;

  return [
    tasteWrapped,
    opts.skillPrompt?.trim(),
    opts.sessionAddon?.trim(),
    forgeSessionModeBanner(opts.planMode),
    EXECUTE_RULES,
    VIBE_CLARIFY_HINT,
    opts.antiLeakRule ?? ANTI_LEAK_RULE,
  ]
    .filter(Boolean)
    .join(SECTION);
}