export type SkillCatalogEntry = {
  id: string;
  name: string;
  description: string;
  category: string;
};

/** Skills pré-carregadas no servidor — ativar com + injeta no contexto do LLM. */
export const SKILLS_CATALOG: SkillCatalogEntry[] = [
  { id: "brainstorming", name: "Brainstorming", description: "Explorar requisitos antes de implementar.", category: "Planejamento" },
  { id: "writing-plans", name: "Writing plans", description: "Planos de implementação em etapas.", category: "Planejamento" },
  { id: "systematic-debugging", name: "Debug sistemático", description: "Investigar bugs com evidência.", category: "Qualidade" },
  { id: "test-driven-development", name: "TDD", description: "Testes antes do código.", category: "Qualidade" },
  { id: "verification-before-completion", name: "Verificação", description: "Provar que funciona antes de concluir.", category: "Qualidade" },
  { id: "nextjs", name: "Next.js", description: "Convenções e cache Next.js.", category: "Framework" },
  { id: "react-best-practices", name: "React performance", description: "Otimização React/Next da Vercel.", category: "Framework" },
  { id: "shadcn", name: "shadcn/ui", description: "Componentes e theming.", category: "UI" },
  { id: "web-design-guidelines", name: "Web UI", description: "Acessibilidade e UX.", category: "UI" },
  { id: "deploy-to-vercel", name: "Deploy Vercel", description: "Publicar na Vercel.", category: "Deploy" },
  { id: "vercel-cli", name: "Vercel CLI", description: "CLI, env e logs.", category: "Deploy" },
  { id: "ai-sdk", name: "AI SDK", description: "Vercel AI SDK e streaming.", category: "IA" },
  { id: "ai-gateway", name: "AI Gateway", description: "Roteamento multi-provedor.", category: "IA" },
  { id: "context7", name: "Context7 docs", description: "Docs de libs no prompt.", category: "IA" },
  { id: "xlsx", name: "Planilhas", description: "Ler e editar .xlsx/.csv.", category: "Dados" },
  { id: "docx", name: "Word", description: "Documentos .docx.", category: "Dados" },
  { id: "pptx", name: "Apresentações", description: "Slides .pptx.", category: "Dados" },
  { id: "implement", name: "Implement loop", description: "Implementar + revisar até zero issues.", category: "Agente" },
  { id: "review", name: "Code review", description: "Revisão de diff ou PR.", category: "Agente" },
  { id: "design", name: "Design doc", description: "Spec técnica com consenso.", category: "Agente" },
  { id: "pr-babysit", name: "PR babysit", description: "CI, reviews e merge.", category: "Agente" },
  { id: "finishing-branch", name: "Finalizar branch", description: "Merge, PR ou descartar.", category: "Git" },
  { id: "using-git-worktrees", name: "Git worktrees", description: "Isolamento de features.", category: "Git" },
  { id: "vercel-optimize", name: "Otimizar custo", description: "Métricas e cache Vercel.", category: "Plataforma" },
  { id: "vercel-firewall", name: "Firewall", description: "WAF e rate limit.", category: "Plataforma" },
  { id: "auth-clerk", name: "Auth", description: "Login em apps Next.", category: "Plataforma" },
  { id: "imagine", name: "Imagens", description: "Geração e edição visual.", category: "Mídia" },
  { id: "create-skill", name: "Criar skill", description: "Scaffold de SKILL.md.", category: "Meta" },
  { id: "help-grok", name: "Ajuda FORGE", description: "Setup e atalhos do produto.", category: "Meta" },
  { id: "check-work", name: "Check work", description: "Subagente verificador.", category: "Meta" },
];

const STORAGE_KEY = "forge:enabled-skill-ids";

export function loadEnabledSkillIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as unknown;
    return Array.isArray(arr) ? arr.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function saveEnabledSkillIds(ids: string[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  window.dispatchEvent(new Event("forge:skills-updated"));
}

export function toggleSkillId(id: string): string[] {
  const cur = loadEnabledSkillIds();
  const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
  saveEnabledSkillIds(next);
  return next;
}