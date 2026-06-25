import { isSkillBundled } from "@/lib/forge-skills-bundled";

export type SkillCatalogEntry = {
  id: string;
  name: string;
  description: string;
  category: string;
  /** SKILL.md empacotado no servidor (conteúdo completo no agent-run) */
  bundled: boolean;
};

function skill(id: string, name: string, description: string, category: string): SkillCatalogEntry {
  return { id, name, description, category, bundled: isSkillBundled(id) };
}

/** Skills com SKILL.md no bundle do servidor — ativar com + injeta conteúdo real no LLM. */
export const SKILLS_CATALOG: SkillCatalogEntry[] = [
  skill(
    "brainstorming",
    "Brainstorming",
    "Explorar requisitos antes de implementar.",
    "Planejamento",
  ),
  skill("writing-plans", "Writing plans", "Planos de implementação em etapas.", "Planejamento"),
  skill("systematic-debugging", "Debug sistemático", "Investigar bugs com evidência.", "Qualidade"),
  skill("test-driven-development", "TDD", "Testes antes do código.", "Qualidade"),
  skill(
    "verification-before-completion",
    "Verificação",
    "Provar que funciona antes de concluir.",
    "Qualidade",
  ),
  skill("nextjs", "Next.js", "Convenções e cache Next.js.", "Framework"),
  skill(
    "react-best-practices",
    "React performance",
    "Otimização React/Next da Vercel.",
    "Framework",
  ),
  skill("shadcn", "shadcn/ui", "Componentes e theming.", "UI"),
  skill(
    "design-system",
    "FORGE Design",
    "Composto criacional: peça única por projeto. /designsystem",
    "UI",
  ),
  skill(
    "extract-design",
    "FORGE Extract",
    "Extrair DNA de referências e aplicar no design. /extractdesign",
    "UI",
  ),
  skill("web-design-guidelines", "Web UI", "Acessibilidade e UX.", "UI"),
  skill("deploy-to-vercel", "Deploy Vercel", "Publicar na Vercel.", "Deploy"),
  skill("vercel-cli", "Vercel CLI", "CLI, env e logs.", "Deploy"),
  skill("ai-sdk", "AI SDK", "Vercel AI SDK e streaming.", "IA"),
  skill("ai-gateway", "AI Gateway", "Roteamento multi-provedor.", "IA"),
  skill("context7", "Context7 docs", "Docs de libs via MCP + skill.", "IA"),
  skill("xlsx", "Planilhas", "Ler e editar .xlsx/.csv.", "Dados"),
  skill("docx", "Word", "Documentos .docx.", "Dados"),
  skill("pptx", "Apresentações", "Slides .pptx.", "Dados"),
  skill("implement", "Implement loop", "Implementar + revisar até zero issues.", "Agente"),
  skill("review", "Code review", "Revisão de diff ou PR.", "Agente"),
  skill("design", "Design doc", "Spec técnica com consenso.", "Agente"),
  skill("pr-babysit", "PR babysit", "CI, reviews e merge.", "Agente"),
  skill("finishing-branch", "Finalizar branch", "Merge, PR ou descartar.", "Git"),
  skill("using-git-worktrees", "Git worktrees", "Isolamento de features.", "Git"),
  skill("vercel-optimize", "Otimizar custo", "Métricas e cache Vercel.", "Plataforma"),
  skill("vercel-firewall", "Firewall", "WAF e rate limit.", "Plataforma"),
  skill("auth-clerk", "Auth", "Login em apps Next.", "Plataforma"),
  skill("imagine", "Imagens", "Geração e edição visual.", "Mídia"),
  skill("create-skill", "Criar skill", "Scaffold de SKILL.md.", "Meta"),
  skill("help-grok", "Ajuda FORGE", "Setup e atalhos do produto.", "Meta"),
  skill("check-work", "Check work", "Subagente verificador.", "Meta"),
];

import { loadEnabledSkillIdsLocal } from "@/lib/agent-extensions-prefs";

export function loadEnabledSkillIds(): string[] {
  return loadEnabledSkillIdsLocal();
}
