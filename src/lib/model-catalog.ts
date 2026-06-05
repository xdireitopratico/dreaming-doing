/**
 * Catálogo FORGE — ranking jun/2026 via OpenRouter (slug = Model ID).
 * Chave: OPENROUTER_API_KEY (conector ou vault admin em platform_secrets).
 */

export type AiEnvId = "anthropic" | "gemini" | "openai" | "xai" | "groq" | "nvidia" | "openrouter";

export type ModelTier = "frontier" | "balanced" | "fast" | "pool";

export interface ForgeModelPreset {
  id: string;
  env: AiEnvId;
  model: string;
  label: string;
  description: string;
  tier: ModelTier;
  /** Agrupamento no dropdown (provedor de marca) */
  brand: string;
  rank: number;
  llmProvider: "anthropic" | "openai" | "gemini";
  baseUrl?: string;
  costPerMInput?: number;
  costPerMOutput?: number;
  recommended?: boolean;
  secretKey: string;
}

const OPENROUTER_BASE = "https://openrouter.ai/api/v1";

export const AI_ENV_META: Record<
  AiEnvId,
  { label: string; docUrl: string; keyPrefix: string; supportsPool?: boolean }
> = {
  openrouter: {
    label: "OpenRouter",
    docUrl: "https://openrouter.ai/keys",
    keyPrefix: "sk-or-",
  },
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
};

type RankedRow = {
  rank: number;
  label: string;
  brand: string;
  model: string;
  tier: ModelTier;
  recommended?: boolean;
};

/** Lista aprovada (posição 1–30 + Qwen 3.5 397B NVIDIA) */
const RANKED_MODELS: RankedRow[] = [
  { rank: 1, label: "Claude Opus 4.8", brand: "Anthropic", model: "anthropic/claude-opus-4-8", tier: "frontier" },
  { rank: 2, label: "Claude Opus 4.7", brand: "Anthropic", model: "anthropic/claude-opus-4-7", tier: "frontier" },
  { rank: 3, label: "Claude Sonnet 4.6", brand: "Anthropic", model: "anthropic/claude-sonnet-4-6", tier: "frontier", recommended: true },
  { rank: 4, label: "GPT-5.5", brand: "OpenAI", model: "openai/gpt-5.5", tier: "frontier" },
  { rank: 5, label: "GPT-5.5 Instant", brand: "OpenAI", model: "openai/gpt-5.5-instant", tier: "frontier" },
  { rank: 6, label: "GPT-5.3 Codex", brand: "OpenAI", model: "openai/gpt-5.3-codex", tier: "frontier", recommended: true },
  { rank: 7, label: "Gemini 3.5 Flash", brand: "Google", model: "google/gemini-3.5-flash", tier: "frontier" },
  { rank: 8, label: "Gemini 3.1 Pro", brand: "Google", model: "google/gemini-3.1-pro", tier: "frontier", recommended: true },
  { rank: 9, label: "Grok 4.3", brand: "xAI", model: "xai/grok-4.3", tier: "frontier" },
  { rank: 10, label: "Grok Build 0.1", brand: "xAI", model: "xai/grok-build-0.1", tier: "frontier", recommended: true },
  { rank: 11, label: "DeepSeek V4 Pro", brand: "DeepSeek", model: "deepseek/deepseek-v4-pro", tier: "balanced" },
  { rank: 12, label: "DeepSeek V4 Flash", brand: "DeepSeek", model: "deepseek/deepseek-v4-flash", tier: "balanced" },
  { rank: 13, label: "Qwen 3.7 Max", brand: "Qwen", model: "qwen/qwen3.7-max", tier: "balanced" },
  { rank: 14, label: "Qwen 3.7 Plus", brand: "Qwen", model: "qwen/qwen3.7-plus", tier: "balanced" },
  { rank: 15, label: "Qwen 3.6 Plus", brand: "Qwen", model: "qwen/qwen3.6-plus", tier: "balanced" },
  { rank: 16, label: "Kimi K2.6", brand: "Moonshot", model: "moonshotai/kimi-k2.6", tier: "balanced" },
  { rank: 17, label: "Kimi K2.5", brand: "Moonshot", model: "moonshotai/kimi-k2.5", tier: "balanced" },
  { rank: 18, label: "MiniMax M3", brand: "MiniMax", model: "minimax/minimax-m3", tier: "balanced" },
  { rank: 19, label: "MiniMax M2.7", brand: "MiniMax", model: "minimax/minimax-m2.7", tier: "balanced" },
  { rank: 20, label: "GLM-5.1", brand: "Zhipu", model: "zhipu/glm-5.1", tier: "balanced" },
  { rank: 21, label: "Nemotron 3 Ultra (550B)", brand: "NVIDIA", model: "nvidia/nemotron-3-ultra-550b", tier: "pool" },
  { rank: 22, label: "Nemotron 3 Super (120B)", brand: "NVIDIA", model: "nvidia/nemotron-3-super-120b", tier: "pool", recommended: true },
  { rank: 23, label: "Qwen3 Coder", brand: "Qwen", model: "qwen/qwen3-coder", tier: "pool", recommended: true },
  { rank: 24, label: "Gemma 4 31B", brand: "Google", model: "google/gemma-4-31b-it", tier: "fast" },
  { rank: 25, label: "Claude Opus 4.8 Fast", brand: "Anthropic", model: "anthropic/claude-opus-4-8-fast", tier: "fast" },
  { rank: 26, label: "GPT-5.4", brand: "OpenAI", model: "openai/gpt-5.4", tier: "fast" },
  { rank: 27, label: "DeepSeek V3", brand: "DeepSeek", model: "deepseek/deepseek-v3", tier: "fast" },
  { rank: 28, label: "Qwen 3.6 Flash", brand: "Qwen", model: "qwen/qwen3.6-flash", tier: "fast" },
  { rank: 29, label: "MiniMax M2.5", brand: "MiniMax", model: "minimax/minimax-m2.5", tier: "fast" },
  { rank: 30, label: "GLM-5", brand: "Zhipu", model: "zhipu/glm-5", tier: "fast" },
  { rank: 31, label: "Qwen3.5 397B (NVIDIA)", brand: "Qwen", model: "qwen/qwen3.5-397b-a17b", tier: "pool" },
];

function modelToPresetId(model: string): string {
  return `or-${model.replace(/\//g, "--").replace(/\./g, "-")}`;
}

function tierDescription(tier: ModelTier, rank: number): string {
  if (tier === "frontier") return `#${rank} · Frontier — máxima qualidade em código e arquitetura.`;
  if (tier === "balanced") return `#${rank} · Balanced — forte em dev com bom custo.`;
  if (tier === "pool") return `#${rank} · Pool ROBIN / NVIDIA — alto throughput.`;
  return `#${rank} · Fast — iterações rápidas e scaffolding.`;
}

function buildOpenRouterPreset(row: RankedRow): ForgeModelPreset {
  return {
    id: modelToPresetId(row.model),
    env: "openrouter",
    model: row.model,
    label: row.label,
    description: tierDescription(row.tier, row.rank),
    tier: row.tier,
    brand: row.brand,
    rank: row.rank,
    llmProvider: "openai",
    baseUrl: OPENROUTER_BASE,
    secretKey: "OPENROUTER_API_KEY",
    recommended: row.recommended,
  };
}

/** Presets OpenRouter (lista principal) */
export const OPENROUTER_MODEL_PRESETS: ForgeModelPreset[] = RANKED_MODELS.map(buildOpenRouterPreset);

/** Pool ROBIN — APIs nativas Groq/NVIDIA (não passam pelo slug OpenRouter no endpoint) */
const NATIVE_POOL_PRESETS: ForgeModelPreset[] = [
  {
    id: "pool-groq-flash",
    env: "groq",
    model: "llama-3.3-70b-versatile",
    label: "Groq · Llama 3.3 70B",
    description: "Pool ROBIN Groq — barato e rápido.",
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
    label: "NVIDIA · Nemotron 3 Super",
    description: "Pool ROBIN NVIDIA — alinhado ao ranking #22.",
    tier: "pool",
    brand: "NVIDIA",
    rank: 91,
    llmProvider: "openai",
    baseUrl: "https://integrate.api.nvidia.com/v1",
    secretKey: "NVIDIA_API_KEY",
    recommended: true,
  },
  {
    id: "pool-nemotron-ultra",
    env: "nvidia",
    model: "nvidia/nemotron-3-ultra-550b",
    label: "NVIDIA · Nemotron 3 Ultra",
    description: "Pool ROBIN NVIDIA — máxima capacidade (#21).",
    tier: "pool",
    brand: "NVIDIA",
    rank: 92,
    llmProvider: "openai",
    baseUrl: "https://integrate.api.nvidia.com/v1",
    secretKey: "NVIDIA_API_KEY",
  },
];

/** Catálogo completo para UI e agente (modo fixo = OpenRouter) */
export const CODING_MODEL_PRESETS: ForgeModelPreset[] = [
  ...OPENROUTER_MODEL_PRESETS,
  ...NATIVE_POOL_PRESETS,
];

export const POOL_MODEL_PRESETS = CODING_MODEL_PRESETS.filter((p) => p.tier === "pool");

export const STT_OPTIONS = [
  {
    id: "grok" as const,
    label: "Grok STT (xAI)",
    description: "Melhor para português e baixa latência — exige chave xAI.",
    requiresEnv: "xai" as AiEnvId,
    endpoint: "api.x.ai/v1/stt",
    recommended: true,
  },
  {
    id: "groq" as const,
    label: "Groq Whisper Large v3 Turbo",
    description: "Fallback econômico — exige chave Groq.",
    requiresEnv: "groq" as AiEnvId,
    endpoint: "Groq OpenAI-compatible",
  },
];

const PRESET_BY_ID = new Map(CODING_MODEL_PRESETS.map((p) => [p.id, p]));

const DEFAULT_PRESET_ID = modelToPresetId("anthropic/claude-sonnet-4-6");

/** Migra IDs antigos da UI */
const LEGACY_PRESET_IDS: Record<string, string> = {
  "anthropic-sonnet": DEFAULT_PRESET_ID,
  "anthropic-opus": modelToPresetId("anthropic/claude-opus-4-8"),
  "openrouter-custom": DEFAULT_PRESET_ID,
  "xai-grok": modelToPresetId("xai/grok-4.3"),
  "xai-grok3": modelToPresetId("xai/grok-4.3"),
  "xai-grok3-mini": modelToPresetId("xai/grok-build-0.1"),
  "groq-llama": "pool-groq-flash",
  "groq-llama70": "pool-groq-flash",
  "nvidia-llama70": "pool-nemotron-super",
  "nvidia-nemotron": "pool-nemotron-ultra",
  "gemini-25-pro": modelToPresetId("google/gemini-3.1-pro"),
  "gemini-25-flash": modelToPresetId("google/gemini-3.5-flash"),
  "openai-gpt41": modelToPresetId("openai/gpt-5.5"),
  "openai-gpt4o": modelToPresetId("openai/gpt-5.4"),
};

export function normalizePresetId(id?: string): string {
  if (!id) return DEFAULT_PRESET_ID;
  return LEGACY_PRESET_IDS[id] ?? id;
}

export function getPresetById(id?: string): ForgeModelPreset {
  const norm = normalizePresetId(id);
  return PRESET_BY_ID.get(norm) ?? OPENROUTER_MODEL_PRESETS.find((p) => p.id === DEFAULT_PRESET_ID)!;
}

export function presetsForEnv(env: AiEnvId): ForgeModelPreset[] {
  if (env === "openrouter") {
    return OPENROUTER_MODEL_PRESETS.slice().sort((a, b) => a.rank - b.rank);
  }
  return CODING_MODEL_PRESETS.filter((p) => p.env === env);
}

export function presetsByBrandGrouped(): { brand: string; models: ForgeModelPreset[] }[] {
  const map = new Map<string, ForgeModelPreset[]>();
  for (const m of OPENROUTER_MODEL_PRESETS) {
    const list = map.get(m.brand) ?? [];
    list.push(m);
    map.set(m.brand, list);
  }
  return Array.from(map.entries())
    .map(([brand, models]) => ({ brand, models: models.sort((a, b) => a.rank - b.rank) }))
    .sort((a, b) => (a.models[0]?.rank ?? 0) - (b.models[0]?.rank ?? 0));
}

export function presetsByEnvGrouped(): {
  env: AiEnvId;
  meta: (typeof AI_ENV_META)[AiEnvId];
  models: ForgeModelPreset[];
}[] {
  const envs: AiEnvId[] = ["openrouter", "anthropic", "gemini", "openai", "xai", "groq", "nvidia"];
  return envs.map((env) => ({
    env,
    meta: AI_ENV_META[env],
    models: presetsForEnv(env),
  }));
}

export function poolPresetsForProvider(poolProvider: "groq" | "nvidia"): ForgeModelPreset[] {
  return NATIVE_POOL_PRESETS.filter((p) => p.env === poolProvider);
}

export function presetToProviderOption(p: ForgeModelPreset) {
  return {
    id: p.id,
    provider: p.brand,
    model: p.model,
    label: p.label,
    description: p.description,
    costPerMInput: p.costPerMInput,
    costPerMOutput: p.costPerMOutput,
    recommended: p.recommended,
  };
}

/** Dropdown do editor — top 12 por rank + recomendados */
export const PROVIDER_PRESETS_FOR_UI = OPENROUTER_MODEL_PRESETS.filter(
  (p) => p.recommended || p.rank <= 12,
)
  .sort((a, b) => a.rank - b.rank)
  .map(presetToProviderOption);