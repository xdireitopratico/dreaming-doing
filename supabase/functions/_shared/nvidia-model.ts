/** Slugs oficiais NVIDIA NIM — sync com src/lib/editor-readiness.ts */

const NEMOTRON_ULTRA_SLUG = "nvidia/nemotron-3-ultra-550b-a55b";
const NEMOTRON_SUPER_SLUG = "nvidia/nemotron-3-super-120b-a12b";

/**
 * UI antiga prefixava `nvidia/` em modelos de terceiros no NIM.
 * O slug correto vem do build.nvidia.com (ex.: moonshotai/kimi-k2.6).
 */
const NIM_MISPREFIX_ALIASES: Record<string, string> = {
  "nvidia/kimi-k2.6": "moonshotai/kimi-k2.6",
  "nvidia/kimi-k2-6": "moonshotai/kimi-k2.6",
};

/**
 * Normaliza slug para chat/completions no integrate.api.nvidia.com.
 *
 * Regra: `env=nvidia` escolhe a API key + base URL; o `model` no payload é o
 * slug **exato** do catálogo NIM (vendor/model), ex. moonshotai/kimi-k2.6,
 * stepfun-ai/step-3.7-flash, nvidia/nemotron-3-ultra-550b-a55b.
 *
 * Só reescreve Nemotron (sufixos -a55b / -a12b) e aliases de migração.
 */
export function normalizeNvidiaApiModel(slug: string): string {
  const s = slug.trim();
  if (!s) return s;

  const aliased = NIM_MISPREFIX_ALIASES[s];
  if (aliased) return aliased;

  const bare = s.includes("/") ? s.slice(s.indexOf("/") + 1) : s;
  if (bare.includes("nemotron-3-ultra-550b") && !bare.includes("-a55b")) {
    return NEMOTRON_ULTRA_SLUG;
  }
  if (bare.includes("nemotron-3-super-120b") && !bare.includes("-a12b")) {
    return NEMOTRON_SUPER_SLUG;
  }

  // vendor/model do NIM — pass-through (moonshotai/, stepfun-ai/, qwen/, …)
  if (s.includes("/")) return s;

  // Id sem vendor: só prefixa nvidia/ para famílias NVIDIA nativas conhecidas
  if (bare.includes("nemotron") || bare.startsWith("qwen")) {
    return `nvidia/${bare}`;
  }

  return s;
}

/** Base URL OpenAI-compatible para NIM (sem /chat/completions duplicado). */
export function normalizeNimBaseUrl(baseUrl?: string): string | undefined {
  if (!baseUrl?.trim()) return undefined;

  let u = baseUrl.trim().replace(/\/+$/, "");
  u = u.replace(/\/chat\/completions$/i, "");
  if (!u.endsWith("/v1")) {
    if (u.endsWith("/v1/")) u = u.slice(0, -1);
    else if (!u.includes("/v1")) u = `${u}/v1`;
  }
  return u;
}

export function isNvidiaNimModel(model: string): boolean {
  const m = model.toLowerCase();
  return (
    m.startsWith("nvidia/") ||
    m.startsWith("qwen/") ||
    m.startsWith("moonshotai/") ||
    m.startsWith("stepfun-ai/")
  );
}