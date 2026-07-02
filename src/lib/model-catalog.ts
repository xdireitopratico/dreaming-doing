/**
 * Catálogo FORGE — ranking jun/2026.
 * Slugs no formato OpenRouter são referência de ID; cada modelo roteia para o
 * provedor nativo (Anthropic, OpenAI, Gemini, xAI, NVIDIA) quando o FORGE tem conector.
 * Só modelos sem API dedicada no app usam env openrouter (ex.: Zhipu).
 */
import { providerWire } from "@/lib/ai-provider-registry";
import {
  normalizePresetId as normalizePresetIdContract,
  TASTE_PLATFORM_MODEL_PRESET_ID,
  slugToPresetId,
} from "@/lib/preset-contract";

export {
  normalizePresetIdContract as normalizePresetId,
  TASTE_PLATFORM_MODEL_PRESET_ID,
  PLATFORM_ROBIN_TASTE_PRESET_ID,
} from "@/lib/preset-contract";

export type AiEnvId =
  | "alibaba"
  | "anthropic"
  | "deepseek"
  | "gemini"
  | "groq"
  | "minimax"
  | "moonshotai"
  | "nvidia"
  | "ollama"
  | "openai"
  | "openrouter"
  | "xai"
  | "xiaomi";

export type ModelTier = "frontier" | "balanced" | "fast" | "pool";

export type ModelEnvId = AiEnvId | `custom-${string}`;

export interface ForgeModelPreset {
  id: string;
  env: ModelEnvId;
  /** Ordem de força no ambiente (menor = mais forte). */
  envStrength?: number;
  /** ID enviado à API do provedor escolhido em `env` */
  model: string;
  /** Slug de referência (como listado no OpenRouter) — útil no campo custom */
  openRouterSlug: string;
  label: string;
  description: string;
  tier: ModelTier;
  brand: string;
  rank: number;
  llmProvider: "anthropic" | "openai" | "gemini" | "ollama";
  baseUrl?: string;
  secretKey: string;
  recommended?: boolean;
  /** Atalho no dropdown compacto do editor */
  editorPick?: boolean;
}

const OPENROUTER_BASE = "https://openrouter.ai/api/v1";

/** Ambientes na ordem alfabética (regra do produto). */
export const AI_ENVS_SORTED: AiEnvId[] = [
  "alibaba",
  "anthropic",
  "deepseek",
  "gemini",
  "groq",
  "minimax",
  "moonshotai",
  "nvidia",
  "ollama",
  "openai",
  "openrouter",
  "xai",
  "xiaomi",
];

export const AI_ENV_META: Record<
  AiEnvId,
  { label: string; docUrl: string; keyPrefix: string; supportsPool?: boolean }
> = {
  alibaba: {
    label: "Alibaba (DashScope / Qwen)",
    docUrl: "https://dashscope.console.aliyun.com",
    keyPrefix: "sk-",
  },
  anthropic: {
    label: "Anthropic",
    docUrl: "https://console.anthropic.com",
    keyPrefix: "sk-ant-",
  },
  deepseek: {
    label: "DeepSeek",
    docUrl: "https://platform.deepseek.com",
    keyPrefix: "sk-",
  },
  gemini: {
    label: "Google Gemini",
    docUrl: "https://aistudio.google.com/apikey",
    keyPrefix: "AIza",
  },
  openai: {
    label: "OpenAI",
    docUrl: "https://platform.openai.com",
    keyPrefix: "sk-proj-",
  },
  xai: {
    label: "xAI (Grok)",
    docUrl: "https://console.x.ai",
    keyPrefix: "xai-",
  },
  groq: {
    label: "Groq",
    docUrl: "https://console.groq.com",
    keyPrefix: "gsk_",
    supportsPool: true,
  },
  minimax: {
    label: "MiniMax",
    docUrl: "https://platform.minimax.io",
    keyPrefix: "sk-",
  },
  moonshotai: {
    label: "Moonshot (Kimi)",
    docUrl: "https://platform.kimi.ai",
    keyPrefix: "sk-",
  },
  nvidia: {
    label: "NVIDIA NIM",
    docUrl: "https://build.nvidia.com",
    keyPrefix: "nvapi-",
    supportsPool: true,
  },
  ollama: {
    label: "Ollama (local)",
    docUrl: "https://github.com/ollama/ollama/blob/main/docs/faq.md",
    keyPrefix: "http",
  },
  openrouter: {
    label: "OpenRouter (roteador)",
    docUrl: "https://openrouter.ai/keys",
    keyPrefix: "sk-or-",
  },
  xiaomi: {
    label: "Xiaomi (MiMo)",
    docUrl: "https://platform.xiaomimimo.com",
    keyPrefix: "sk-",
  },
};

type RankedInput = {
  rank: number;
  label: string;
  brand: string;
  openRouterSlug: string;
  tier: ModelTier;
  recommended?: boolean;
  editorPick?: boolean;
  /** Força dentro do ambiente (1 = mais forte). Se omitido, usa ordem em ENV_DISPLAY_ORDER. */
  envStrength?: number;
  /** Ambiente quando o slug não basta (ex.: Qwen no NIM NVIDIA). */
  env?: AiEnvId;
};

/** Ordem do mais forte ao mais fraco, por ambiente. */
const ENV_DISPLAY_ORDER: Partial<Record<AiEnvId, string[]>> = {
  anthropic: [
    "anthropic--claude-opus-4-8",
    "anthropic--claude-opus-4-7",
    "anthropic--claude-sonnet-4-6",
    "anthropic--claude-opus-4-8-fast",
  ],
  nvidia: [
    "nvidia--nemotron-3-ultra-550b",
    "qwen--qwen3-5-397b-a17b",
    "nvidia--nemotron-3-super-120b",
  ],
  openai: [
    "openai--gpt-5-5",
    "openai--gpt-5-3-codex",
    "openai--gpt-5-5-instant",
    "openai--gpt-5-4",
  ],
  gemini: ["google--gemini-3-1-pro", "google--gemini-3-5-flash", "google--gemma-4-31b-it"],
  xai: ["xai--grok-4-3", "xai--grok-build-0-1"],
  deepseek: ["deepseek--deepseek-v4-pro", "deepseek--deepseek-v4-flash", "deepseek--deepseek-v3"],
  alibaba: [
    "qwen--qwen3-7-max",
    "qwen--qwen3-7-plus",
    "qwen--qwen3-6-plus",
    "qwen--qwen3-coder",
    "qwen--qwen3-6-flash",
  ],
  moonshotai: ["moonshotai--kimi-k2-6", "moonshotai--kimi-k2-5"],
  minimax: ["minimax--minimax-m3", "minimax--minimax-m2-7", "minimax--minimax-m2-5"],
  openrouter: ["zhipu--glm-5-1", "zhipu--glm-5"],
  xiaomi: ["xiaomi--mimo-v2-5-pro"],
  groq: ["pool-groq-flash"],
  ollama: [
    "ollama--llama3-2",
    "ollama--qwen2-5-coder",
    "ollama--deepseek-r1-8b",
    "ollama--mistral",
  ],
};

export type UserModelEntry = {
  slug: string;
  /** Built-in (AiEnvId) ou custom-* cadastrado em Providers & Keys. */
  env: AiEnvId | `custom-${string}`;
  label?: string;
};

export function userModelPresetId(slug: string): string {
  const s = slug.trim();
  return `custom--${s.replace(/\//g, "--").replace(/\./g, "-")}`;
}

export function inferEnvFromSlug(slug: string): AiEnvId {
  const s = slug.trim();
  if (s.startsWith("anthropic/")) return "anthropic";
  if (s.startsWith("openai/")) return "openai";
  if (s.startsWith("google/")) return "gemini";
  if (s.startsWith("xai/")) return "xai";
  if (s.startsWith("nvidia/")) return "nvidia";
  if (s.startsWith("deepseek/")) return "deepseek";
  if (s.startsWith("qwen/")) return "alibaba";
  if (s.startsWith("minimax/")) return "minimax";
  if (s.startsWith("moonshotai/")) return "moonshotai";
  if (s.startsWith("xiaomi/")) return "xiaomi";
  if (s.startsWith("ollama/")) return "ollama";
  return "openrouter";
}

export function buildUserModelPreset(entry: UserModelEntry): ForgeModelPreset {
  // For custom providers, the slug is just the model name (e.g. "mercury-2").
  // For built-in providers, the slug includes the provider prefix (e.g. "anthropic/claude-opus-4-8").
  const slug = entry.slug.includes("/") ? entry.slug : `${entry.env}/${entry.slug}`;
  const env = entry.env;
  const wire = wireForEnv(env);
  // apiModelForEnv strips the provider prefix for custom providers, returning just the model name.
  const model = typeof env === "string" && env.startsWith("custom-")
    ? entry.slug  // Already the bare model name for custom providers
    : apiModelForEnv(env, slug);
  return {
    id: userModelPresetId(entry.slug),
    env,
    model,
    openRouterSlug: entry.slug,
    label: entry.label?.trim() || entry.slug,
    description: `Você adicionou · ${entry.slug}`,
    tier: "balanced",
    brand: "Custom",
    rank: 5000,
    envStrength: 5000,
    llmProvider: wire.llmProvider,
    baseUrl: wire.baseUrl,
    secretKey: wire.secretKey,
  };
}

function sortPresetsForDisplay(env: AiEnvId, presets: ForgeModelPreset[]): ForgeModelPreset[] {
  const order = ENV_DISPLAY_ORDER[env];
  if (order) {
    const idx = new Map(order.map((id, i) => [id, i]));
    return [...presets].sort(
      (a, b) => (a.envStrength ?? idx.get(a.id) ?? 999) - (b.envStrength ?? idx.get(b.id) ?? 999),
    );
  }
  return [...presets].sort((a, b) => (a.envStrength ?? a.rank) - (b.envStrength ?? b.rank));
}

function isAiEnv(env: ModelEnvId): env is AiEnvId {
  return env in AI_ENV_META;
}

/** Roteamento: provedor nativo vs OpenRouter só quando não há conector dedicado */
function routeEnv(brand: string, slug: string): AiEnvId {
  if (slug.startsWith("anthropic/")) return "anthropic";
  if (slug.startsWith("openai/")) return "openai";
  if (slug.startsWith("google/")) return "gemini";
  if (slug.startsWith("xai/")) return "xai";
  if (slug.startsWith("nvidia/")) return "nvidia";
  if (slug.startsWith("minimax/")) return "minimax";
  if (slug.startsWith("moonshotai/")) return "moonshotai";
  if (slug.startsWith("xiaomi/")) return "xiaomi";
  if (brand === "DeepSeek") return "deepseek";
  if (brand === "Qwen") return "alibaba";
  if (brand === "MiniMax") return "minimax";
  if (brand === "Moonshot") return "moonshotai";
  if (brand === "Xiaomi") return "xiaomi";
  if (brand === "Groq") return "groq";
  return "openrouter";
}

function apiModelForEnv(env: AiEnvId | string, slug: string): string {
  const slash = slug.indexOf("/");
  const bare = slash >= 0 ? slug.slice(slash + 1) : slug;
  if (typeof env === "string" && env.startsWith("custom-")) return bare;
  if (env === "openrouter") return slug;
  if (env === "nvidia") {
    if (bare.includes("nemotron-3-ultra-550b") && !bare.includes("-a55b")) {
      return "nvidia/nemotron-3-ultra-550b-a55b";
    }
    if (bare.includes("nemotron-3-super-120b") && !bare.includes("-a12b")) {
      return "nvidia/nemotron-3-super-120b-a12b";
    }
    return slug.includes("/") ? slug : `nvidia/${bare}`;
  }
  if (env === "minimax") {
    if (bare.includes("m3")) return "MiniMax-M3";
    if (bare.includes("2.7")) return "MiniMax-M2.7";
    if (bare.includes("2.5")) return "MiniMax-M2.5";
    return "MiniMax-M3";
  }
  if (env === "moonshotai") {
    if (bare.includes("k2.6") || bare.includes("k2-6")) return "kimi-k2.6";
    if (bare.includes("k2.5") || bare.includes("k2-5")) return "kimi-k2.5";
    return bare.replace(/-/g, ".");
  }
  if (env === "xiaomi") {
    return bare.includes("v2-5") || bare.includes("v2.5") ? "mimo-v2.5-pro" : bare;
  }
  if (env === "deepseek") {
    return "deepseek-chat";
  }
  if (env === "alibaba") {
    if (bare.includes("qwen3.7-max") || bare.includes("qwen3-7-max")) return "qwen-max";
    if (bare.includes("qwen3.7-plus") || bare.includes("qwen3-7-plus")) return "qwen-plus";
    if (bare.includes("qwen3.6-plus") || bare.includes("qwen3-6-plus")) return "qwen-plus";
    if (bare.includes("qwen3.6-flash") || bare.includes("qwen3-6-flash")) return "qwen-turbo";
    if (bare.includes("coder")) return "qwen-coder-plus";
    return bare;
  }
  return bare;
}

function wireForEnv(env: AiEnvId | string): {
  llmProvider: ForgeModelPreset["llmProvider"];
  secretKey: string;
  baseUrl?: string;
} {
  if (typeof env === "string" && env.startsWith("custom-")) {
    return providerWire(env);
  }
  switch (env) {
    case "anthropic":
      return { llmProvider: "anthropic", secretKey: "ANTHROPIC_API_KEY" };
    case "gemini":
      return { llmProvider: "gemini", secretKey: "GEMINI_API_KEY" };
    case "openai":
      return { llmProvider: "openai", secretKey: "OPENAI_API_KEY" };
    case "xai":
      return {
        llmProvider: "openai",
        secretKey: "XAI_API_KEY",
        baseUrl: "https://api.x.ai/v1",
      };
    case "groq":
      return {
        llmProvider: "openai",
        secretKey: "GROQ_API_KEY",
        baseUrl: "https://api.groq.com/openai/v1",
      };
    case "nvidia":
      return {
        llmProvider: "openai",
        secretKey: "NVIDIA_API_KEY",
        baseUrl: "https://integrate.api.nvidia.com/v1",
      };
    case "deepseek":
      return {
        llmProvider: "openai",
        secretKey: "DEEPSEEK_API_KEY",
        baseUrl: "https://api.deepseek.com",
      };
    case "alibaba":
      return {
        llmProvider: "openai",
        secretKey: "DASHSCOPE_API_KEY",
        baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
      };
    case "minimax":
      return {
        llmProvider: "openai",
        secretKey: "MINIMAX_API_KEY",
        baseUrl: "https://api.minimax.io/v1",
      };
    case "moonshotai":
      return {
        llmProvider: "openai",
        secretKey: "MOONSHOT_API_KEY",
        baseUrl: "https://api.moonshot.ai/v1",
      };
    case "xiaomi":
      return {
        llmProvider: "openai",
        secretKey: "MIMO_API_KEY",
        baseUrl: "https://api.xiaomimimo.com/v1",
      };
    case "ollama":
      return { llmProvider: "ollama", secretKey: "OLLAMA_BASE_URL" };
    default:
      return {
        llmProvider: "openai",
        secretKey: "OPENROUTER_API_KEY",
        baseUrl: OPENROUTER_BASE,
      };
  }
}

function slugToId(slug: string): string {
  return slugToPresetId(slug);
}

function buildPreset(row: RankedInput): ForgeModelPreset {
  const env = row.env ?? routeEnv(row.brand, row.openRouterSlug);
  const wire = wireForEnv(env);
  const id = slugToId(row.openRouterSlug);
  const orderIdx = ENV_DISPLAY_ORDER[env]?.indexOf(id) ?? -1;
  return {
    id,
    env,
    model: apiModelForEnv(env, row.openRouterSlug),
    openRouterSlug: row.openRouterSlug,
    label: row.label,
    description: `#${row.rank} · ${row.brand} · ${env === "openrouter" ? "via OpenRouter" : `API ${AI_ENV_META[env].label}`}`,
    tier: row.tier,
    brand: row.brand,
    rank: row.rank,
    envStrength: row.envStrength ?? (orderIdx >= 0 ? orderIdx + 1 : row.rank),
    llmProvider: wire.llmProvider,
    baseUrl: wire.baseUrl,
    secretKey: wire.secretKey,
    recommended: row.recommended,
    editorPick: row.editorPick,
  };
}

const RANKED: RankedInput[] = [
  {
    rank: 1,
    label: "Claude Opus 4.8",
    brand: "Anthropic",
    openRouterSlug: "anthropic/claude-opus-4-8",
    tier: "frontier",
    editorPick: true,
  },
  {
    rank: 2,
    label: "Claude Opus 4.7",
    brand: "Anthropic",
    openRouterSlug: "anthropic/claude-opus-4-7",
    tier: "frontier",
  },
  {
    rank: 3,
    label: "Claude Sonnet 4.6",
    brand: "Anthropic",
    openRouterSlug: "anthropic/claude-sonnet-4-6",
    tier: "frontier",
    editorPick: true,
  },
  {
    rank: 4,
    label: "GPT-5.5",
    brand: "OpenAI",
    openRouterSlug: "openai/gpt-5.5",
    tier: "frontier",
    editorPick: true,
  },
  {
    rank: 5,
    label: "GPT-5.5 Instant",
    brand: "OpenAI",
    openRouterSlug: "openai/gpt-5.5-instant",
    tier: "frontier",
  },
  {
    rank: 6,
    label: "GPT-5.3 Codex",
    brand: "OpenAI",
    openRouterSlug: "openai/gpt-5.3-codex",
    tier: "frontier",
    recommended: true,
    editorPick: true,
  },
  {
    rank: 7,
    label: "Gemini 3.5 Flash",
    brand: "Google",
    openRouterSlug: "google/gemini-3.5-flash",
    tier: "frontier",
    editorPick: true,
  },
  {
    rank: 8,
    label: "Gemini 3.1 Pro",
    brand: "Google",
    openRouterSlug: "google/gemini-3.1-pro",
    tier: "frontier",
    recommended: true,
  },
  {
    rank: 9,
    label: "Grok 4.3",
    brand: "xAI",
    openRouterSlug: "xai/grok-4.3",
    tier: "frontier",
    editorPick: true,
  },
  {
    rank: 10,
    label: "Grok Build 0.1",
    brand: "xAI",
    openRouterSlug: "xai/grok-build-0.1",
    tier: "frontier",
    recommended: true,
  },
  {
    rank: 11,
    label: "DeepSeek V4 Pro",
    brand: "DeepSeek",
    openRouterSlug: "deepseek/deepseek-v4-pro",
    tier: "balanced",
  },
  {
    rank: 12,
    label: "DeepSeek V4 Flash",
    brand: "DeepSeek",
    openRouterSlug: "deepseek/deepseek-v4-flash",
    tier: "balanced",
  },
  {
    rank: 13,
    label: "Qwen 3.7 Max",
    brand: "Qwen",
    openRouterSlug: "qwen/qwen3.7-max",
    tier: "balanced",
  },
  {
    rank: 14,
    label: "Qwen 3.7 Plus",
    brand: "Qwen",
    openRouterSlug: "qwen/qwen3.7-plus",
    tier: "balanced",
  },
  {
    rank: 15,
    label: "Qwen 3.6 Plus",
    brand: "Qwen",
    openRouterSlug: "qwen/qwen3.6-plus",
    tier: "balanced",
  },
  {
    rank: 16,
    label: "Kimi K2.6",
    brand: "Moonshot",
    openRouterSlug: "moonshotai/kimi-k2.6",
    tier: "balanced",
  },
  {
    rank: 17,
    label: "Kimi K2.5",
    brand: "Moonshot",
    openRouterSlug: "moonshotai/kimi-k2.5",
    tier: "balanced",
  },
  {
    rank: 18,
    label: "MiniMax M3",
    brand: "MiniMax",
    openRouterSlug: "minimax/minimax-m3",
    tier: "balanced",
  },
  {
    rank: 19,
    label: "MiniMax M2.7",
    brand: "MiniMax",
    openRouterSlug: "minimax/minimax-m2.7",
    tier: "balanced",
  },
  { rank: 20, label: "GLM-5.1", brand: "Zhipu", openRouterSlug: "zhipu/glm-5.1", tier: "balanced" },
  {
    rank: 21,
    label: "Nemotron 3 Ultra (550B)",
    brand: "NVIDIA",
    openRouterSlug: "nvidia/nemotron-3-ultra-550b",
    tier: "pool",
    envStrength: 1,
  },
  {
    rank: 22,
    label: "Nemotron 3 Super (120B)",
    brand: "NVIDIA",
    openRouterSlug: "nvidia/nemotron-3-super-120b",
    tier: "pool",
    envStrength: 3,
  },
  {
    rank: 23,
    label: "Qwen3 Coder",
    brand: "Qwen",
    openRouterSlug: "qwen/qwen3-coder",
    tier: "pool",
    recommended: true,
  },
  {
    rank: 24,
    label: "Gemma 4 31B",
    brand: "Google",
    openRouterSlug: "google/gemma-4-31b-it",
    tier: "fast",
  },
  {
    rank: 25,
    label: "Claude Opus 4.8 Fast",
    brand: "Anthropic",
    openRouterSlug: "anthropic/claude-opus-4-8-fast",
    tier: "fast",
  },
  { rank: 26, label: "GPT-5.4", brand: "OpenAI", openRouterSlug: "openai/gpt-5.4", tier: "fast" },
  {
    rank: 27,
    label: "DeepSeek V3",
    brand: "DeepSeek",
    openRouterSlug: "deepseek/deepseek-v3",
    tier: "fast",
  },
  {
    rank: 28,
    label: "Qwen 3.6 Flash",
    brand: "Qwen",
    openRouterSlug: "qwen/qwen3.6-flash",
    tier: "fast",
  },
  {
    rank: 29,
    label: "MiniMax M2.5",
    brand: "MiniMax",
    openRouterSlug: "minimax/minimax-m2.5",
    tier: "fast",
  },
  { rank: 30, label: "GLM-5", brand: "Zhipu", openRouterSlug: "zhipu/glm-5", tier: "fast" },
  {
    rank: 31,
    label: "Qwen3.5 397B (NVIDIA NIM)",
    brand: "Qwen",
    openRouterSlug: "qwen/qwen3.5-397b-a17b",
    tier: "pool",
    env: "nvidia",
    envStrength: 2,
  },
  {
    rank: 32,
    label: "MiMo V2.5 Pro",
    brand: "Xiaomi",
    openRouterSlug: "xiaomi/mimo-v2.5-pro",
    tier: "balanced",
    recommended: true,
  },
];

/** Ranking completo — Estúdio IA em /models */
export const RANKED_MODEL_PRESETS: ForgeModelPreset[] = RANKED.map(buildPreset);

/** Pool ROBIN — APIs nativas Groq/NVIDIA (usuário escolhe; sem default silencioso) */
const NATIVE_POOL: ForgeModelPreset[] = [
  {
    id: "pool-groq-flash",
    env: "groq",
    model: "llama-3.3-70b-versatile",
    openRouterSlug: "meta-llama/llama-3.3-70b",
    label: "Groq · Llama 3.3 70B",
    description: "Pool ROBIN Groq",
    tier: "pool",
    brand: "Groq",
    rank: 90,
    llmProvider: "openai",
    baseUrl: "https://api.groq.com/openai/v1",
    secretKey: "GROQ_API_KEY",
  },
  {
    id: TASTE_PLATFORM_MODEL_PRESET_ID,
    env: "nvidia",
    model: "nvidia/nemotron-3-ultra-550b-a55b",
    openRouterSlug: "nvidia/nemotron-3-ultra-550b",
    label: "NVIDIA · Nemotron 3 Ultra (550B)",
    description: "Taste da plataforma (onboarding) — não é default do usuário",
    tier: "pool",
    brand: "NVIDIA",
    rank: 91,
    llmProvider: "openai",
    baseUrl: "https://integrate.api.nvidia.com/v1",
    secretKey: "NVIDIA_API_KEY",
  },
];

/** Modelos locais — exige URL pública do Ollama (túnel) para o agente na nuvem. */
const OLLAMA_NATIVE: ForgeModelPreset[] = [
  {
    id: "ollama--llama3-2",
    env: "ollama",
    model: "llama3.2",
    openRouterSlug: "ollama/llama3.2",
    label: "Llama 3.2",
    description: "Meta · local via Ollama",
    tier: "balanced",
    brand: "Ollama",
    rank: 200,
    envStrength: 1,
    llmProvider: "ollama",
    secretKey: "OLLAMA_BASE_URL",
    recommended: true,
  },
  {
    id: "ollama--qwen2-5-coder",
    env: "ollama",
    model: "qwen2.5-coder:7b",
    openRouterSlug: "ollama/qwen2.5-coder",
    label: "Qwen 2.5 Coder 7B",
    description: "Código · local via Ollama",
    tier: "balanced",
    brand: "Ollama",
    rank: 201,
    envStrength: 2,
    llmProvider: "ollama",
    secretKey: "OLLAMA_BASE_URL",
  },
  {
    id: "ollama--deepseek-r1-8b",
    env: "ollama",
    model: "deepseek-r1:8b",
    openRouterSlug: "ollama/deepseek-r1",
    label: "DeepSeek R1 8B",
    description: "Raciocínio · local via Ollama",
    tier: "fast",
    brand: "Ollama",
    rank: 202,
    envStrength: 3,
    llmProvider: "ollama",
    secretKey: "OLLAMA_BASE_URL",
  },
  {
    id: "ollama--mistral",
    env: "ollama",
    model: "mistral",
    openRouterSlug: "ollama/mistral",
    label: "Mistral",
    description: "Geral · local via Ollama",
    tier: "fast",
    brand: "Ollama",
    rank: 203,
    envStrength: 4,
    llmProvider: "ollama",
    secretKey: "OLLAMA_BASE_URL",
  },
];

export const CODING_MODEL_PRESETS: ForgeModelPreset[] = [
  ...RANKED_MODEL_PRESETS,
  ...NATIVE_POOL,
  ...OLLAMA_NATIVE,
];

export const POOL_MODEL_PRESETS = CODING_MODEL_PRESETS.filter((p) => p.tier === "pool");

/** Dropdown do editor — só atalhos, não os 31 de uma vez */
export const EDITOR_MODEL_PRESETS = RANKED_MODEL_PRESETS.filter(
  (p) => p.editorPick || p.recommended,
);

export {
  STT_OPTIONS,
  STT_DEFAULT_PROVIDER,
  STT_MODEL_BY_PROVIDER,
  sttProviderName,
  sttActiveModelLine,
} from "@/lib/stt-config";
export type { SttProviderId } from "@/lib/stt-config";

const PRESET_BY_ID = new Map(CODING_MODEL_PRESETS.map((p) => [p.id, p]));

/** Provider exibido no studio quando ainda não há modelo ativo — nunca OpenRouter por default. */
export const DEFAULT_STUDIO_ENV: AiEnvId = "groq";

export const UNCONFIGURED_PRESET: ForgeModelPreset = {
  id: "",
  env: DEFAULT_STUDIO_ENV,
  model: "",
  openRouterSlug: "",
  label: "Não configurado",
  description: "Configure em Modelos",
  tier: "balanced",
  brand: "—",
  rank: 9999,
  llmProvider: "openai",
  secretKey: "GROQ_API_KEY",
};

/** Deriva o provider ativo no Model Engine a partir das prefs (inclui modo auto). */
export function resolveStudioSelectedEnv(
  prefs: {
    mode?: "auto" | "robin" | "fixed";
    fixedPresetId?: string;
    robinPoolModelId?: string;
    poolProvider?: string;
    autoAllowedPresetIds?: string[];
    userModelEntries?: UserModelEntry[];
  },
): AiEnvId {
  const mode = prefs.mode ?? "fixed";

  if (mode === "robin") {
    const pool = prefs.poolProvider?.trim();
    if (pool && isAiEnv(pool as ModelEnvId)) return pool as AiEnvId;
    const robin = getPresetById(prefs.robinPoolModelId, prefs.userModelEntries);
    if (robin.id) return robin.env as AiEnvId;
    return DEFAULT_STUDIO_ENV;
  }

  if (mode === "fixed") {
    const fixed = getPresetById(prefs.fixedPresetId, prefs.userModelEntries);
    if (fixed.id) return fixed.env as AiEnvId;
    return DEFAULT_STUDIO_ENV;
  }

  if (mode === "auto") {
    for (const id of prefs.autoAllowedPresetIds ?? []) {
      const p = getPresetById(id, prefs.userModelEntries);
      if (p.id) return p.env as AiEnvId;
    }
    return DEFAULT_STUDIO_ENV;
  }

  return DEFAULT_STUDIO_ENV;
}

export function getPresetById(id?: string, userModels?: UserModelEntry[]): ForgeModelPreset {
  const norm = normalizePresetIdContract(id);
  if (!norm) return UNCONFIGURED_PRESET;
  const catalog = PRESET_BY_ID.get(norm);
  if (catalog) return catalog;
  if (norm.startsWith("custom--") && userModels) {
    const entry = userModels.find((e) => userModelPresetId(e.slug) === norm);
    if (entry) return buildUserModelPreset(entry);
  }
  return UNCONFIGURED_PRESET;
}

export function presetsForEnv(
  env: ModelEnvId,
  opts?: { userModels?: UserModelEntry[] },
): ForgeModelPreset[] {
  const list = RANKED_MODEL_PRESETS.filter((p) => p.env === env);
  if (env === "groq" || env === "nvidia") {
    const ids = new Set(list.map((p) => p.id));
    for (const p of NATIVE_POOL.filter((x) => x.env === env)) {
      if (!ids.has(p.id)) list.push(p);
    }
  }
  const customs = (opts?.userModels ?? []).filter((e) => e.env === env).map(buildUserModelPreset);
  const seen = new Set<string>();
  const merged = [...list, ...customs].filter((p) => {
    const key = `${p.env}:${p.model}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (!isAiEnv(env)) return merged;
  return sortPresetsForDisplay(env, merged);
}

/** Catálogo completo do ambiente + modelos que o usuário adicionou neste provedor. */
export function modelsForStudioStep(
  env: ModelEnvId,
  _mode?: "auto" | "robin" | "fixed" | undefined,
  userModels?: UserModelEntry[],
): ForgeModelPreset[] {
  if (!isAiEnv(env)) {
    return (userModels ?? [])
      .filter((e) => e.env === env)
      .map(buildUserModelPreset);
  }
  return presetsForEnv(env, { userModels });
}

export function presetsByEnvGrouped(): {
  env: AiEnvId;
  meta: (typeof AI_ENV_META)[AiEnvId];
  models: ForgeModelPreset[];
}[] {
  return AI_ENVS_SORTED.map((env) => ({
    env,
    meta: AI_ENV_META[env],
    models: presetsForEnv(env),
  })).filter((g) => g.models.length > 0 || g.env === "groq");
}

export function poolPresetsForProvider(poolProvider: "groq" | "nvidia"): ForgeModelPreset[] {
  return NATIVE_POOL.filter((p) => p.env === poolProvider);
}

export function presetToProviderOption(p: ForgeModelPreset) {
  return {
    id: p.id,
    provider: AI_ENV_META[p.env as AiEnvId].label,
    model: p.model,
    label: p.label,
    description: p.description,
    recommended: p.recommended,
  };
}

export const PROVIDER_PRESETS_FOR_UI = EDITOR_MODEL_PRESETS.map(presetToProviderOption);
