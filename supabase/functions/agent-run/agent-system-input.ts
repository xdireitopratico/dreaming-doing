/**
 * Montagem única do system input do agente FORGE.
 *
 * Esquema (ordem fixa):
 * 1. Identidade (vibe core)
 * 2. Sessão (banner Plan/Build)
 * 3. Ferramentas (referência → JSON schemas)
 * 4. Stack do projeto + flex + enforcement
 * 5. Design (só templates web)
 * 6. Skills / sessão
 * 7. Execução (tail Plan ou Build)
 * 8. Anti-leak
 */
import { ANTI_LEAK_RULE } from "./run-context.ts";
import {
  buildToolsReference,
  forgeSessionModeBanner,
  VIBE_CODING_CORE,
  VIBE_EXECUTE_TAIL,
  VIBE_PLAN_TAIL,
} from "./vibe-coding-prompt.ts";
import {
  buildStackEnforcement,
  DESIGN_GUIDE,
  getProjectStackPrompt,
  STACK_FLEX,
  type ProjectTemplateId,
} from "./prompts.ts";
import { getTasteStartSystemPrompt } from "./prompts-taste.ts";

const WEB_UI_TEMPLATES = new Set<ProjectTemplateId>([
  "vite-react",
  "nextjs-app-router",
  "tanstack-start",
  "expo",
  "astro",
  "node-api",
  "static-html",
  "custom",
]);

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

/** System prompt enxuto — pedido do usuário vem por último nas messages, não aqui. */
export function buildForgeAgentSystemInput(opts: ForgeAgentSystemInputOpts): string {
  const templateId = (opts.projectTemplate ?? "vite-react") as ProjectTemplateId;

  const stackParts = [
    getProjectStackPrompt(templateId),
    STACK_FLEX,
    buildStackEnforcement(opts.projectTemplate),
    opts.stackAddon?.trim(),
  ].filter(Boolean);

  let stackBlock = stackParts.join("\n\n");
  if (opts.tasteStart) stackBlock = getTasteStartSystemPrompt(stackBlock);

  const parts: string[] = [
    VIBE_CODING_CORE,
    forgeSessionModeBanner(opts.planMode),
    buildToolsReference(opts.planMode),
    stackBlock,
  ];

  if (WEB_UI_TEMPLATES.has(templateId)) parts.push(DESIGN_GUIDE);
  if (opts.skillPrompt?.trim()) parts.push(opts.skillPrompt.trim());
  if (opts.sessionAddon?.trim()) parts.push(opts.sessionAddon.trim());
  parts.push(opts.planMode ? VIBE_PLAN_TAIL : VIBE_EXECUTE_TAIL);
  parts.push(opts.antiLeakRule ?? ANTI_LEAK_RULE);

  return parts.filter(Boolean).join(SECTION);
}