/**
 * Catálogo FORGE — ranking jun/2026.
 * Slugs no formato OpenRouter são referência de ID; cada modelo roteia para o
 * provedor nativo (Anthropic, OpenAI, Gemini, xAI, NVIDIA) quando o FORGE tem conector.
 * Só modelos sem API dedicada no app usam env openrouter (DeepSeek, Qwen, Kimi, etc.).
 */

export type AiEnvId = "anthropic" | "gemini" | "openai" | "xai" | "groq" | "nvidia" | "openrouter";

export type ModelTier = "frontier" | "balanced" | "fast" | "pool";

export interface ForgeModelPreset {
  id: string;
  env: AiEnvId;
  /** ID enviado à API do provedor escolhido em `env` */
  model: string;
  /** Slug de referência (como listado no OpenRouter) — útil no campo custom */
  openRouterSlug: string;
  label: string;
  description: string;
  tier: ModelTier;
  brand: string;
  rank: number;
  llmProvider: "anthropic" | "openai" | "gemini";
  baseUrl?: string;
  secretKey: string;
  recommended?: boolean;
  /** Atalho no dropdown compacto do editor */
  editorPick?: boolean;
}

const OPENROUTER_BASE = "https://openrouter.ai/api/v1";

export const AI_ENV_META: Record<
  AiEnvId,
  { label: string; docUrl: string; keyPrefix: string; supportsPool?: boolean }
> = {
  anthropic: {
    label: "Anthropic",
    docUrl: "https://console.anthropic.com",
    keyPrefix: "sk-ant-",
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
  nvidia: {
    label: "NVIDIA NIM",
    docUrl: "https://build.nvidia.com",
    keyPrefix: "nvapi-",
    supportsPool: true,
  },
  openrouter: {
    label: "OpenRouter (roteador)",
    docUrl: "https://openrouter.ai/keys",
    keyPrefix: "sk-or-",
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
};

/** Roteamento: provedor nativo vs OpenRouter só quando não há conector dedicado */
function routeEnv(brand: string, slug: string): AiEnvId {
  if (slug.startsWith("anthropic/")) return "anthropic";
  if (slug.startsWith("openai/")) return "openai";
  if (slug.startsWith("google/")) return "gemini";
  if (slug.startsWith("xai/")) return "xai";
  if (slug.startsWith("nvidia/")) return "nvidia";
  if (brand === "Groq") return "groq";
  return "openrouter";
}

function apiModelForEnv(env: AiEnvId, slug: string): string {
  const slash = slug.indexOf("/");
  const bare = slash >= 0 ? slug.slice(slash + 1) : slug;
  if (env === "openrouter") return slug;
  if (env === "nvidia") return slug;
  return bare;
}

function wireForEnv(env: AiEnvId): {
  llmProvider: ForgeModelPreset["llmProvider"];
  secretKey: string;
  baseUrl?: string;
} {
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
    default:
      return {
        llmProvider: "openai",
        secretKey: "OPENROUTER_API_KEY",
        baseUrl: OPENROUTER_BASE,
      };
  }
}

function slugToId(slug: string): string {
  return slug.replace(/\//g, "--").replace(/\./g, "-");
}

function buildPreset(row: RankedInput): ForgeModelPreset {
  const env = routeEnv(row.brand, row.openRouterSlug);
  const wire = wireForEnv(env);
  return {
    id: slugToId(row.openRouterSlug),
    env,
    model: apiModelForEnv(env, row.openRouterSlug),
    openRouterSlug: row.openRouterSlug,
    label: row.label,
    description: `#${row.rank} · ${row.brand} · ${env === "openrouter" ? "via OpenRouter" : `API ${AI_ENV_META[env].label}`}`,
    tier: row.tier,
    brand: row.brand,
    rank: row.rank,
    llmProvider: wire.llmProvider,
    baseUrl: wire.baseUrl,
    secretKey: wire.secretKey,
    recommended: row.recommended,
    editorPick: row.editorPick,
  };
}

const RANKED: RankedInput[] = [
  { rank: 1, label: "Claude Opus 4.8", brand: "Anthropic", openRouterSlug: "anthropic/claude-opus-4-8", tier: "frontier", editorPick: true },
  { rank: 2, label: "Claude Opus 4.7", brand: "Anthropic", openRouterSlug: "anthropic/claude-opus-4-7", tier: "frontier" },
  { rank: 3, label: "Claude Sonnet 4.6", brand: "Anthropic", openRouterSlug: "anthropic/claude-sonnet-4-6", tier: "frontier", recommended: true, editorPick: true },
  { rank: 4, label: "GPT-5.5", brand: "OpenAI", openRouterSlug: "openai/gpt-5.5", tier: "frontier", editorPick: true },
  { rank: 5, label: "GPT-5.5 Instant", brand: "OpenAI", openRouterSlug: "openai/gpt-5.5-instant", tier: "frontier" },
  { rank: 6, label: "GPT-5.3 Codex", brand: "OpenAI", openRouterSlug: "openai/gpt-5.3-codex", tier: "frontier", recommended: true, editorPick: true },
  { rank: 7, label: "Gemini 3.5 Flash", brand: "Google", openRouterSlug: "google/gemini-3.5-flash", tier: "frontier", editorPick: true },
  { rank: 8, label: "Gemini 3.1 Pro", brand: "Google", openRouterSlug: "google/gemini-3.1-pro", tier: "frontier", recommended: true },
  { rank: 9, label: "Grok 4.3", brand: "xAI", openRouterSlug: "xai/grok-4.3", tier: "frontier", editorPick: true },
  { rank: 10, label: "Grok Build 0.1", brand: "xAI", openRouterSlug: "xai/grok-build-0.1", tier: "frontier", recommended: true },
  { rank: 11, label: "DeepSeek V4 Pro", brand: "DeepSeek", openRouterSlug: "deepseek/deepseek-v4-pro", tier: "balanced" },
  { rank: 12, label: "DeepSeek V4 Flash", brand: "DeepSeek", openRouterSlug: "deepseek/deepseek-v4-flash", tier: "balanced" },
  { rank: 13, label: "Qwen 3.7 Max", brand: "Qwen", openRouterSlug: "qwen/qwen3.7-max", tier: "balanced" },
  { rank: 14, label: "Qwen 3.7 Plus", brand: "Qwen", openRouterSlug: "qwen/qwen3.7-plus", tier: "balanced" },
  { rank: 15, label: "Qwen 3.6 Plus", brand: "Qwen", openRouterSlug: "qwen/qwen3.6-plus", tier: "balanced" },
  { rank: 16, label: "Kimi K2.6", brand: "Moonshot", openRouterSlug: "moonshotai/kimi-k2.6", tier: "balanced" },
  { rank: 17, label: "Kimi K2.5", brand: "Moonshot", openRouterSlug: "moonshotai/kimi-k2.5", tier: "balanced" },
  { rank: 18, label: "MiniMax M3", brand: "MiniMax", openRouterSlug: "minimax/minimax-m3", tier: "balanced" },
  { rank: 19, label: "MiniMax M2.7", brand: "MiniMax", openRouterSlug: "minimax/minimax-m2.7", tier: "balanced" },
  { rank: 20, label: "GLM-5.1", brand: "Zhipu", openRouterSlug: "zhipu/glm-5.1", tier: "balanced" },
  { rank: 21, label: "Nemotron 3 Ultra (550B)", brand: "NVIDIA", openRouterSlug: "nvidia/nemotron-3-ultra-550b", tier: "pool" },
  { rank: 22, label: "Nemotron 3 Super (120B)", brand: "NVIDIA", openRouterSlug: "nvidia/nemotron-3-super-120b", tier: "pool", recommended: true },
  { rank: 23, label: "Qwen3 Coder", brand: "Qwen", openRouterSlug: "qwen/qwen3-coder", tier: "pool", recommended: true },
  { rank: 24, label: "Gemma 4 31B", brand: "Google", openRouterSlug: "google/gemma-4-31b-it", tier: "fast" },
  { rank: 25, label: "Claude Opus 4.8 Fast", brand: "Anthropic", openRouterSlug: "anthropic/claude-opus-4-8-fast", tier: "fast" },
  { rank: 26, label: "GPT-5.4", brand: "OpenAI", openRouterSlug: "openai/gpt-5.4", tier: "fast" },
  { rank: 27, label: "DeepSeek V3", brand: "DeepSeek", openRouterSlug: "deepseek/deepseek-v3", tier: "fast" },
  { rank: 28, label: "Qwen 3.6 Flash", brand: "Qwen", openRouterSlug: "qwen/qwen3.6-flash", tier: "fast" },
  { rank: 29, label: "MiniMax M2.5", brand: "MiniMax", openRouterSlug: "minimax/minimax-m2.5", tier: "fast" },
  { rank: 30, label: "GLM-5", brand: "Zhipu", openRouterSlug: "zhipu/glm-5", tier: "fast" },
  { rank: 31, label: "Qwen3.5 397B (NVIDIA)", brand: "Qwen", openRouterSlug: "qwen/qwen3.5-397b-a17b", tier: "pool" },
];

/** Ranking completo — Estúdio IA em /api-keys */
export const RANKED_MODEL_PRESETS: ForgeModelPreset[] = RANKED.map(buildPreset);

/** Pool ROBIN — APIs nativas Groq/NVIDIA */
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
    recommended: true,
  },
  {
    id: "pool-nemotron-super",
    env: "nvidia",
    model: "nvidia/nemotron-3-super-120b",
    openRouterSlug: "nvidia/nemotron-3-super-120b",
    label: "NVIDIA · Nemotron 3 Super",
    description: "Pool ROBIN NVIDIA (#22)",
    tier: "pool",
    brand: "NVIDIA",
    rank: 91,
    llmProvider: "openai",
    baseUrl: "https://integrate.api.nvidia.com/v1",
    secretKey: "NVIDIA_API_KEY",
    recommended: true,
  },
];

export const CODING_MODEL_PRESETS: ForgeModelPreset[] = [
  ...RANKED_MODEL_PRESETS,
  ...NATIVE_POOL,
];

export const POOL_MODEL_PRESETS = CODING_MODEL_PRESETS.filter((p) => p.tier === "pool");

/** Dropdown do editor — só atalhos, não os 31 de uma vez */
export const EDITOR_MODEL_PRESETS = RANKED_MODEL_PRESETS.filter((p) => p.editorPick || p.recommended);

const DEFAULT_PRESET_ID = slugToId("anthropic/claude-sonnet-4-6");

const LEGACY_PRESET_IDS: Record<string, string> = {
  "or-anthropic--claude-sonnet-4-6": DEFAULT_PRESET_ID,
  "anthropic-sonnet": DEFAULT_PRESET_ID,
  "anthropic-opus": slugToId("anthropic/claude-opus-4-8"),
  "openrouter-custom": DEFAULT_PRESET_ID,
  "xai-grok3": slugToId("xai/grok-4.3"),
  "groq-llama70": "pool-groq-flash",
  "pool-groq-flash": "pool-groq-flash",
  "nvidia-llama70": "pool-nemotron-super",
};

export const STT_OPTIONS = [
  {
    id: "grok" as const,
    label: "Grok STT (xAI)",
    description: "Melhor para português — exige chave xAI.",
    requiresEnv: "xai" as AiEnvId,
    recommended: true,
  },
  {
    id: "groq" as const,
    label: "Groq Whisper Large v3 Turbo",
    description: "Fallback — exige chave Groq.",
    requiresEnv: "groq" as AiEnvId,
  },
];

const PRESET_BY_ID = new Map(CODING_MODEL_PRESETS.map((p) => [p.id, p]));

export function normalizePresetId(id?: string): string {
  if (!id) return DEFAULT_PRESET_ID;
  return LEGACY_PRESET_IDS[id] ?? id;
}

export function getPresetById(id?: string): ForgeModelPreset {
  const norm = normalizePresetId(id);
  return PRESET_BY_ID.get(norm) ?? PRESET_BY_ID.get(DEFAULT_PRESET_ID)!;
}

export function presetsForEnv(env: AiEnvId): ForgeModelPreset[] {
  if (env === "groq" || env === "nvidia") {
    return CODING_MODEL_PRESETS.filter((p) => p.env === env).sort((a, b) => a.rank - b.rank);
  }
  return RANKED_MODEL_PRESETS.filter((p) => p.env === env).sort((a, b) => a.rank - b.rank);
}

export function presetsByEnvGrouped(): {
  env: AiEnvId;
  meta: (typeof AI_ENV_META)[AiEnvId];
  models: ForgeModelPreset[];
}[] {
  const envs: AiEnvId[] = ["anthropic", "openai", "gemini", "xai", "nvidia", "openrouter", "groq"];
  return envs
    .map((env) => ({
      env,
      meta: AI_ENV_META[env],
      models: presetsForEnv(env),
    }))
    .filter((g) => g.models.length > 0 || g.env === "groq");
}

export function poolPresetsForProvider(poolProvider: "groq" | "nvidia"): ForgeModelPreset[] {
  return NATIVE_POOL.filter((p) => p.env === poolProvider);
}

export function presetToProviderOption(p: ForgeModelPreset) {
  return {
    id: p.id,
    provider: AI_ENV_META[p.env].label,
    model: p.model,
    label: p.label,
    description: p.description,
    recommended: p.recommended,
  };
}

export const PROVIDER_PRESETS_FOR_UI = EDITOR_MODEL_PRESETS.map(presetToProviderOption);