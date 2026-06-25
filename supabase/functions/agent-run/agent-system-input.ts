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
import { buildDesignManifestSummary } from "./design-manifest.ts";
import { FORGE_SKILLS_INDEX } from "../_shared/forge-skills-index.generated.ts";

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

function isDesignManifestInjectionEnabled(): boolean {
  try {
    return Deno.env.get("FORGE_DESIGN_MANIFEST") !== "0";
  } catch {
    return true;
  }
}

/** Bloco compacto de skills FORGE nativas — one-liner cada (id + descrição).
 * Sem bloat: só as curadas/forge-native entram no prompt; a cauda longa fica atrás de `find_skills`.
 * O conteúdo COMPLETO da skill carrega on-demand via `load_skill`. */
function buildAvailableSkillsBlock(): string {
  const forgeNative = FORGE_SKILLS_INDEX.filter((e) => e.forgeNative);
  if (forgeNative.length === 0) return "";
  const lines = forgeNative
    .map((e) => `- ${e.id}: ${(e.description || e.name).slice(0, 160)}`)
    .join("\n");
  return [
    "<available_skills>",
    "Skills FORGE nativas disponíveis. Você vê só o resumo — carregue o conteúdo completo só quando for usar:",
    lines,
    "",
    "Para descobrir OUTRAS skills (cauda longa), chame a tool `find_skills` com uma query (ex: find_skills({ query: \"design\" })). Para carregar o conteúdo completo de uma skill, chame `load_skill` com o id (ex: load_skill({ id: \"design-system\" })).",
    "</available_skills>",
  ].join("\n");
}

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
    buildAvailableSkillsBlock(),
    stackBlock,
  ];

  if (WEB_UI_TEMPLATES.has(templateId)) {
    parts.push(DESIGN_GUIDE);
    if (isDesignManifestInjectionEnabled()) {
      parts.push(buildDesignManifestSummary());
    }
  }
  if (opts.skillPrompt?.trim()) parts.push(opts.skillPrompt.trim());
  if (opts.sessionAddon?.trim()) parts.push(opts.sessionAddon.trim());
  parts.push(opts.planMode ? VIBE_PLAN_TAIL : VIBE_EXECUTE_TAIL);
  parts.push(opts.antiLeakRule ?? ANTI_LEAK_RULE);

  return parts.filter(Boolean).join(SECTION);
}