/** Carrega SKILL.md empacotados e comprime com orçamento de tokens para o agent-run. */

import { FORGE_SKILL_BUNDLES_B64 } from "./forge-skill-bundles.generated.ts";

function decodeSkillBundle(id: string): string | null {
  const b64 = FORGE_SKILL_BUNDLES_B64[id];
  if (!b64) return null;
  try {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

const SKILLS_DIR = new URL("./forge-skills/", import.meta.url);

export type LoadedForgeSkill = {
  id: string;
  name: string;
  bundled: boolean;
  body: string;
  charCount: number;
};

const FALLBACK_SUMMARY: Record<string, string> = {
  brainstorming: "Explore intenção e critérios antes de implementar.",
  "writing-plans": "Plano numerado com arquivos e ordem antes de codar.",
  "systematic-debugging": "Hipótese → evidência → fix reproduzível.",
  "test-driven-development": "Teste que falha → implementação → verde.",
  "verification-before-completion": "Build/test antes de declarar pronto.",
  nextjs: "App Router, RSC, cache tags, route handlers.",
  "react-best-practices": "Performance React/Next sem waterfalls.",
  shadcn: "shadcn/ui + Tailwind no tema do projeto.",
  "web-design-guidelines": "A11y, foco, hierarquia, estados de erro.",
  "deploy-to-vercel": "Deploy Vercel com env e preview.",
  "vercel-cli": "CLI: link, env pull, logs — sem vazar token.",
  "ai-sdk": "Pacote `ai`, streaming, tools.",
  "ai-gateway": "Roteamento multi-provedor e failover.",
  context7: "Docs atuais via tools context7_* quando MCP ativo.",
  xlsx: "Planilhas .xlsx com fórmulas preservadas.",
  docx: "Documentos Word estruturados.",
  pptx: "Slides consistentes.",
  implement: "Implementar + revisar até zero issues.",
  review: "Review por severidade.",
  design: "Design doc com plano de PRs.",
  "pr-babysit": "CI, reviews, merge.",
  "finishing-branch": "Opções merge/PR/descartar.",
  "using-git-worktrees": "Worktrees isolados.",
  "vercel-optimize": "Custo e cache Vercel com métricas.",
  "vercel-firewall": "WAF e rate limit.",
  "auth-clerk": "Auth Next via marketplace.",
  imagine: "Assets visuais com estilo consistente.",
  "create-skill": "Scaffold SKILL.md.",
  "help-grok": "Setup FORGE: API Keys, modelos, conectores.",
  "check-work": "Verificador antes de concluir.",
};

const DEFAULT_MAX_PER_SKILL = 6_000;
const DEFAULT_TOTAL_BUDGET = 28_000;

function stripFrontmatter(raw: string): { title: string; body: string } {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!m) return { title: "", body: raw.trim() };
  const fm = m[1] ?? "";
  const nameMatch = fm.match(/^name:\s*(.+)$/m);
  return { title: nameMatch?.[1]?.trim() ?? "", body: (m[2] ?? "").trim() };
}

/** Mantém início + seções ## prioritárias dentro do limite. */
export function compressSkillBody(body: string, maxChars: number): string {
  if (body.length <= maxChars) return body;

  const sections: string[] = [];
  const parts = body.split(/\r?\n(?=## )/);
  const intro = parts[0]?.trim() ?? "";
  let budget = maxChars;
  const chunks: string[] = [];

  if (intro) {
    const slice = intro.length > budget * 0.45 ? intro.slice(0, Math.floor(budget * 0.45)) + "\n…" : intro;
    chunks.push(slice);
    budget -= slice.length;
  }

  const priority = /when to use|como usar|workflow|checklist|obrigat|must|debug|test|deploy|next\.?js|react/i;
  const sorted = [...parts.slice(1)].sort((a, b) => {
    const pa = priority.test(a) ? 0 : 1;
    const pb = priority.test(b) ? 0 : 1;
    return pa - pb || a.length - b.length;
  });

  for (const sec of sorted) {
    if (budget <= 200) break;
    const trimmed = sec.trim();
    if (!trimmed) continue;
    if (trimmed.length <= budget) {
      chunks.push(trimmed);
      budget -= trimmed.length;
    } else {
      chunks.push(trimmed.slice(0, budget - 20) + "\n…");
      break;
    }
  }

  return chunks.join("\n\n");
}

async function readBundledSkill(id: string): Promise<string | null> {
  const embedded = decodeSkillBundle(id);
  if (embedded) return embedded;
  try {
    return await Deno.readTextFile(new URL(`${id}.md`, SKILLS_DIR));
  } catch {
    return null;
  }
}

export async function loadForgeSkill(
  id: string,
  maxChars = DEFAULT_MAX_PER_SKILL,
): Promise<LoadedForgeSkill> {
  const raw = await readBundledSkill(id);
  if (raw) {
    const { title, body } = stripFrontmatter(raw);
    const compressed = compressSkillBody(body, maxChars);
    return {
      id,
      name: title || id,
      bundled: true,
      body: compressed,
      charCount: compressed.length,
    };
  }

  const summary = FALLBACK_SUMMARY[id] ?? `Skill ${id} (resumo embutido).`;
  return {
    id,
    name: id,
    bundled: false,
    body: summary,
    charCount: summary.length,
  };
}

export async function loadForgeSkillsForSession(
  enabledIds: string[],
  options?: { totalBudget?: number; maxPerSkill?: number },
): Promise<LoadedForgeSkill[]> {
  if (enabledIds.length === 0) return [];

  const totalBudget = options?.totalBudget ?? DEFAULT_TOTAL_BUDGET;
  const maxPerSkill = Math.min(
    options?.maxPerSkill ?? DEFAULT_MAX_PER_SKILL,
    Math.floor(totalBudget / enabledIds.length),
  );

  const loaded: LoadedForgeSkill[] = [];
  let used = 0;

  for (const id of enabledIds) {
    const remaining = totalBudget - used;
    if (remaining < 400) break;
    const skill = await loadForgeSkill(id, Math.min(maxPerSkill, remaining));
    loaded.push(skill);
    used += skill.charCount;
  }

  return loaded;
}