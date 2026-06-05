export type DeployTarget = "e2b" | "vercel" | "netlify" | "cloudflare";

export type StackContext = {
  deployTarget: DeployTarget;
  preview: "e2b-live";
  github: boolean;
  vercel: boolean;
  netlify: boolean;
  cloudflare: boolean;
  supabaseForge: boolean;
  supabaseOwn: boolean;
};

export function buildStackContext(
  integrationPrefsRaw: unknown,
  projectMeta: Record<string, unknown>,
  connectorKeys: Record<string, string>,
): StackContext {
  const prefs = (integrationPrefsRaw && typeof integrationPrefsRaw === "object"
    ? integrationPrefsRaw
    : {}) as Record<string, string>;

  const metaTarget = projectMeta.deployTarget as DeployTarget | undefined;
  let deployTarget: DeployTarget = metaTarget ?? "vercel";
  if (prefs.vercel === "own" && connectorKeys.VERCEL_TOKEN) deployTarget = "vercel";
  else if (prefs.netlify === "own" && connectorKeys.NETLIFY_TOKEN) deployTarget = "netlify";
  else if (prefs.cloudflare === "own" && connectorKeys.CLOUDFLARE_API_TOKEN) {
    deployTarget = "cloudflare";
  }

  return {
    deployTarget,
    preview: "e2b-live",
    github: prefs.github === "own" || !!connectorKeys.GITHUB_TOKEN,
    vercel: prefs.vercel === "own" && !!connectorKeys.VERCEL_TOKEN,
    netlify: prefs.netlify === "own" && !!connectorKeys.NETLIFY_TOKEN,
    cloudflare: prefs.cloudflare === "own" && !!connectorKeys.CLOUDFLARE_API_TOKEN,
    supabaseForge: prefs.supabase !== "own",
    supabaseOwn: prefs.supabase === "own",
  };
}

export function stackPromptAddon(ctx: StackContext): string {
  const deployLines: Record<DeployTarget, string> = {
    e2b: "Deploy produção: aguardar instrução; preview ao vivo já usa E2B.",
    vercel: "Deploy produção preferido: **Vercel** (use `vercel deploy` / API com token do usuário se disponível). O app gerado NÃO precisa usar Supabase se o usuário pedir só Vercel.",
    netlify: "Deploy produção preferido: **Netlify** (`netlify deploy` ou API). Static/Vite: `npm run build` → publish dist.",
    cloudflare: "Deploy produção preferido: **Cloudflare Pages** (wrangler/pages).",
  };

  return `## Stack FORGE (integrações do usuário)
- **Preview ao vivo (diferencial):** um sandbox por projeto (criado quando a IA começa a programar); Vite com HMR no painel Preview. Não recriar ambiente — usuário exclui o projeto para encerrar.
- **Repositório:** ${ctx.github ? "GitHub conectado (push quando fizer sentido)" : "GitHub modo FORGE ou não conectado"}.
- **Hospedagem alvo:** ${deployLines[ctx.deployTarget]}
- **Supabase no app gerado:** ${ctx.supabaseOwn ? "usuário pode usar projeto Supabase próprio" : "padrão FORGE (auth/DB) salvo que peça outro backend"}.

Quando o usuário disser "tudo na Vercel" ou "só Netlify": priorize essa plataforma para deploy; não force Supabase no código gerado.`;
}