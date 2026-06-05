/** Skills/MCP escolhidos no painel FORGE — injetados no system prompt do agent-run. */

export type ForgeSkillDef = { name: string; prompt: string };
export type ForgeMcpDef = { name: string; prompt: string };

export const FORGE_SKILL_BY_ID: Record<string, ForgeSkillDef> = {
  brainstorming: {
    name: "brainstorming",
    prompt:
      "Antes de codar, explore intenção, restrições e critérios de sucesso. Faça perguntas curtas se faltar contexto.",
  },
  "writing-plans": {
    name: "writing-plans",
    prompt:
      "Produza plano em etapas numeradas (arquivos, ordem, riscos). Só implemente após plano visível ao usuário.",
  },
  "systematic-debugging": {
    name: "systematic-debugging",
    prompt:
      "Debug com hipótese → evidência (logs, repro, diff). Não chute fixes sem reproduzir o erro.",
  },
  "test-driven-development": {
    name: "test-driven-development",
    prompt: "Prefira teste mínimo que falha → implementação → verde. Mencione comando de teste usado.",
  },
  "verification-before-completion": {
    name: "verification-before-completion",
    prompt:
      "Antes de concluir: build/test/preview quando aplicável. Não afirme sucesso sem verificação.",
  },
  nextjs: {
    name: "nextjs",
    prompt:
      "Next.js App Router: RSC por padrão, 'use client' só se necessário, cache tags, route handlers tipados.",
  },
  "react-best-practices": {
    name: "react-best-practices",
    prompt:
      "React/Next performático: evite waterfalls, memo só com motivo, listas com keys estáveis, bundle enxuto.",
  },
  shadcn: {
    name: "shadcn",
    prompt: "UI com shadcn/ui + Tailwind: composição, acessibilidade, tokens do tema existente.",
  },
  "web-design-guidelines": {
    name: "web-design-guidelines",
    prompt: "Acessibilidade (contraste, foco, labels), hierarquia visual e estados de loading/erro claros.",
  },
  "deploy-to-vercel": {
    name: "deploy-to-vercel",
    prompt: "Deploy Vercel: build command, env vars, preview URL. Guie o usuário se faltar token Vercel.",
  },
  "vercel-cli": {
    name: "vercel-cli",
    prompt: "Vercel CLI: link, env pull, logs. Não exponha tokens no chat.",
  },
  "ai-sdk": {
    name: "ai-sdk",
    prompt: "Vercel AI SDK: streaming, tools, structured output. Use pacote `ai` do projeto.",
  },
  "ai-gateway": {
    name: "ai-gateway",
    prompt: "AI Gateway: roteamento/failover entre provedores; custos e modelos explícitos.",
  },
  context7: {
    name: "context7",
    prompt: "Consulte documentação atualizada de libs antes de APIs novas; cite versão quando relevante.",
  },
  xlsx: {
    name: "xlsx",
    prompt: "Planilhas: preserve fórmulas/formatos; entregue .xlsx quando pedido.",
  },
  docx: {
    name: "docx",
    prompt: "Word .docx: estrutura profissional (títulos, tabelas) sem quebrar estilos.",
  },
  pptx: {
    name: "pptx",
    prompt: "Slides .pptx: uma ideia por slide, layout consistente.",
  },
  implement: {
    name: "implement",
    prompt: "Implementar em passos pequenos; auto-revisar diff antes de declarar pronto.",
  },
  review: {
    name: "review",
    prompt: "Code review: bugs, segurança, regressões, nitpicks separados por severidade.",
  },
  design: {
    name: "design",
    prompt: "Design doc: problema, opções, decisão, plano de PRs, riscos.",
  },
  "pr-babysit": {
    name: "pr-babysit",
    prompt: "CI/review/merge: priorize falhas reproduzíveis e patches mínimos.",
  },
  "finishing-branch": {
    name: "finishing-branch",
    prompt: "Ao encerrar feature: testes verdes, opções merge/PR/descartar explicadas.",
  },
  "using-git-worktrees": {
    name: "using-git-worktrees",
    prompt: "Worktrees para isolar features sem poluir branch principal.",
  },
  "vercel-optimize": {
    name: "vercel-optimize",
    prompt: "Otimize custo/latência Vercel com métricas (cache, ISR, funções).",
  },
  "vercel-firewall": {
    name: "vercel-firewall",
    prompt: "Segurança edge: WAF, rate limit, regras antes de expor rotas sensíveis.",
  },
  "auth-clerk": {
    name: "auth-clerk",
    prompt: "Auth em Next: middleware, sessão, rotas protegidas — padrão marketplace Vercel.",
  },
  imagine: {
    name: "imagine",
    prompt: "Assets visuais: descreva estilo antes de gerar; consistência com design do app.",
  },
  "create-skill": {
    name: "create-skill",
    prompt: "Skills SKILL.md: frontmatter, gatilhos claros, passos acionáveis.",
  },
  "help-grok": {
    name: "help-grok",
    prompt: "Ajude setup FORGE: API Keys, E2B, modelos, conectores — sem pedir senha no chat.",
  },
  "check-work": {
    name: "check-work",
    prompt: "Verifique diff com checklist: requisitos, testes, edge cases.",
  },
};

export const FORGE_MCP_BY_ID: Record<string, ForgeMcpDef> = {
  context7: {
    name: "context7",
    prompt:
      "MCP Context7 disponível: busque docs oficiais de libs/frameworks antes de inventar APIs.",
  },
  github: {
    name: "github",
    prompt:
      "MCP GitHub ativo: issues/PRs/repos — use token do usuário (Conectores), nunca vaze o token.",
  },
  supabase: {
    name: "supabase",
    prompt:
      "MCP Supabase FORGE ativo: schema, SQL read-only, auth users (admin). projectId = projeto atual.",
  },
  vercel: {
    name: "vercel",
    prompt: "MCP Vercel: deploys e logs — requer token Vercel do usuário.",
  },
  playwright: {
    name: "playwright",
    prompt: "MCP Playwright: testes E2E/browser quando validar UI for necessário.",
  },
  filesystem: {
    name: "filesystem",
    prompt: "MCP Filesystem: leitura/escrita no sandbox do projeto via ferramentas do agente.",
  },
};

export function normalizeIdList(raw: unknown, max = 40): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const x of raw) {
    if (typeof x !== "string") continue;
    const id = x.trim();
    if (!id || out.includes(id)) continue;
    out.push(id);
    if (out.length >= max) break;
  }
  return out;
}

export function buildSessionExtensionsPrompt(
  enabledSkillIds: string[],
  enabledMcpIds: string[],
): { addon: string; skillNames: string[]; mcpNames: string[] } {
  const skillNames: string[] = [];
  const mcpNames: string[] = [];
  const blocks: string[] = [];

  const skillLines: string[] = [];
  for (const id of enabledSkillIds) {
    const s = FORGE_SKILL_BY_ID[id];
    if (!s) continue;
    skillNames.push(s.name);
    skillLines.push(`- **${s.name}**: ${s.prompt}`);
  }
  if (skillLines.length > 0) {
    blocks.push(
      `## Skills ativas (painel FORGE)\nO usuário ativou estas skills — siga-as nesta sessão:\n${skillLines.join("\n")}`,
    );
  }

  const mcpLines: string[] = [];
  for (const id of enabledMcpIds) {
    const m = FORGE_MCP_BY_ID[id];
    if (!m) continue;
    mcpNames.push(m.name);
    mcpLines.push(`- **${m.name}**: ${m.prompt}`);
  }
  if (mcpLines.length > 0) {
    blocks.push(
      `## MCPs ativos (painel FORGE)\nIntegrações habilitadas pelo usuário:\n${mcpLines.join("\n")}`,
    );
  }

  return {
    addon: blocks.join("\n\n"),
    skillNames,
    mcpNames,
  };
}