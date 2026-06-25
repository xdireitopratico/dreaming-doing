// tools/skills.ts — find_skills + load_skill: descoberta e carga on-demand de skills.
// O LLM não recebe catálogo no prompt (bloat). Ele descobre via find_skills e carrega o
// conteúdo COMPLETO só da skill que vai usar via load_skill. Pull, não push.
import type { ToolRegistry } from "../registry.ts";
import type { ToolResult } from "../types.ts";
import { FORGE_SKILLS_INDEX, type ForgeSkillIndexEntry } from "../../_shared/forge-skills-index.generated.ts";
import { loadForgeSkill } from "../../_shared/forge-skill-loader.ts";

function ok(output: unknown): ToolResult {
  return { toolCallId: "", ok: true, output };
}
function fail(error: string): ToolResult {
  return { toolCallId: "", ok: false, error, output: null };
}

export function registerSkillsTools(reg: ToolRegistry): void {
  reg.register(
    {
      name: "find_skills",
      description:
        "Descubra skills FORGE disponíveis por query (id, nome ou descrição). " +
        "Retorna lista compacta (id + descrição curta). Use para achar capability antes de carregar. " +
        'Ex: find_skills({ query: "design" }); query vazio lista todas (máx 30).',
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Termo de busca (vazio = lista todas)." },
        },
      },
    },
    async (args) => {
      const q = typeof args.query === "string" ? args.query.trim().toLowerCase() : "";
      const matches = (q
        ? FORGE_SKILLS_INDEX.filter(
          (e: ForgeSkillIndexEntry) =>
            e.id.toLowerCase().includes(q) ||
            e.name.toLowerCase().includes(q) ||
            e.description.toLowerCase().includes(q),
        )
        : FORGE_SKILLS_INDEX
      ).slice(0, 30);
      return ok({
        count: matches.length,
        skills: matches.map((e: ForgeSkillIndexEntry) => ({
          id: e.id,
          name: e.name,
          description: e.description.slice(0, 200),
          forgeNative: e.forgeNative,
        })),
        hint: "Para carregar o conteúdo completo, chame load_skill({ id }) com o id escolhido.",
      });
    },
  );

  reg.register(
    {
      name: "load_skill",
      description:
        "Carrega o conteúdo completo (SKILL.md) de uma skill pelo id, on-demand. " +
        "Use DEPOIS de find_skills ou quando já sabe o id (ex: design-system, extract-design). " +
        "O conteúdo entra na conversa como resultado desta tool — leia e siga as instruções da skill.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: "id da skill (ex: design-system, extract-design, nextjs, shadcn)" },
        },
        required: ["id"],
      },
    },
    async (args) => {
      const id = typeof args.id === "string" ? args.id.trim() : "";
      if (!id) return fail("load_skill requer id");
      const exists = FORGE_SKILLS_INDEX.some((e: ForgeSkillIndexEntry) => e.id === id);
      if (!exists) {
        return fail(`Skill "${id}" não encontrada. Use find_skills para listar disponíveis.`);
      }
      // ponytail: carrega o body compactado (loader já comprime ao budget). 12k chars é suficiente
      // para a maioria das skills sem inflar a conversa.
      const skill = await loadForgeSkill(id, 12_000);
      return ok({
        id: skill.id,
        name: skill.name,
        bundled: skill.bundled,
        body: skill.body,
        charCount: skill.charCount,
      });
    },
  );
}