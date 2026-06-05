/**
 * Catálogo curado de modelos para programação no FORGE.
 * Somente modelos frontier / fortes em código — sem defaults fracos (ex.: Llama 8B).
 */

export type AiEnvId = "anthropic" | "gemini" | "openai" | "xai" | "groq" | "nvidia";

export type ModelTier = "frontier" | "balanced" | "fast" | "pool";

export interface ForgeModelPreset {
  id: string;
  env: AiEnvId;
  model: string;
  label: string;
  description: string;
  tier: ModelTier;
  /** Provider string para createLLMProvider na Edge */
  llmProvider: "anthropic" | "openai" | "gemini";
  baseUrl?: string;
  costPerMInput?: number;
  costPerMOutput?: number;
  recommended?: boolean;
  /** Chave em connectorKeys / env */
  secretKey: string;
}

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
};

/** Modelos fixos / router — apenas aptos para agente de código */
export const CODING_MODEL_PRESETS: ForgeModelPreset[] = [
  {
    id: "anthropic-sonnet",
    env: "anthropic",
    model: "claude-sonnet-4-20250514",
    label: "Claude Sonnet 4",
    description: "Melhor equilíbrio para código, refatoração e raciocínio longo.",
    tier: "frontier",
    llmProvider: "anthropic",
    secretKey: "ANTHROPIC_API_KEY",
    costPerMInput: 3,
    costPerMOutput: 15,
    recommended: true,
  },
  {
    id: "anthropic-opus",
    env: "anthropic",
    model: "claude-opus-4-20250514",
    label: "Claude Opus 4",
    description: "Máxima qualidade — arquitetura difícil e bugs complexos.",
    tier: "frontier",
    llmProvider: "anthropic",
    secretKey: "ANTHROPIC_API_KEY",
    costPerMInput: 15,
    costPerMOutput: 75,
  },
  {
    id: "gemini-25-pro",
    env: "gemini",
    model: "gemini-2.5-pro",
    label: "Gemini 2.5 Pro",
    description: "Contexto longo e código multimodal — ideal com chave Google AI.",
    tier: "frontier",
    llmProvider: "gemini",
    secretKey: "GEMINI_API_KEY",
    costPerMInput: 1.25,
    costPerMOutput: 5,
    recommended: true,
  },
  {
    id: "gemini-25-flash",
    env: "gemini",
    model: "gemini-2.5-flash",
    label: "Gemini 2.5 Flash",
    description: "Rápido e barato — bom para iterações e scaffolding.",
    tier: "fast",
    llmProvider: "gemini",
    secretKey: "GEMINI_API_KEY",
    costPerMInput: 0.15,
    costPerMOutput: 0.6,
  },
  {
    id: "openai-gpt41",
    env: "openai",
    model: "gpt-4.1",
    label: "GPT-4.1",
    description: "OpenAI frontier — código e instruções longas.",
    tier: "frontier",
    llmProvider: "openai",
    secretKey: "OPENAI_API_KEY",
    costPerMInput: 2,
    costPerMOutput: 8,
    recommended: true,
  },
  {
    id: "openai-gpt4o",
    env: "openai",
    model: "gpt-4o",
    label: "GPT-4o",
    description: "Multimodal — UI, visão e código no mesmo modelo.",
    tier: "balanced",
    llmProvider: "openai",
    secretKey: "OPENAI_API_KEY",
    costPerMInput: 2.5,
    costPerMOutput: 10,
  },
  {
    id: "xai-grok3",
    env: "xai",
    model: "grok-3",
    label: "Grok 3",
    description: "xAI frontier — agente e código com boa latência.",
    tier: "frontier",
    llmProvider: "openai",
    baseUrl: "https://api.x.ai/v1",
    secretKey: "XAI_API_KEY",
    costPerMInput: 2,
    costPerMOutput: 10,
    recommended: true,
  },
  {
    id: "xai-grok3-mini",
    env: "xai",
    model: "grok-3-mini",
    label: "Grok 3 Mini",
    description: "Iterações rápidas; mesma conta serve para STT Grok.",
    tier: "fast",
    llmProvider: "openai",
    baseUrl: "https://api.x.ai/v1",
    secretKey: "XAI_API_KEY",
    costPerMInput: 0.5,
    costPerMOutput: 2,
  },
  {
    id: "groq-llama70",
    env: "groq",
    model: "llama-3.3-70b-versatile",
    label: "Llama 3.3 70B",
    description: "Groq LPU — forte em código, gratuito/barato.",
    tier: "balanced",
    llmProvider: "openai",
    baseUrl: "https://api.groq.com/openai/v1",
    secretKey: "GROQ_API_KEY",
    costPerMInput: 0,
    costPerMOutput: 0,
  },
  {
    id: "groq-qwen32",
    env: "groq",
    model: "qwen-qwq-32b",
    label: "Qwen QwQ 32B",
    description: "Raciocínio e debugging — bom custo no Groq.",
    tier: "balanced",
    llmProvider: "openai",
    baseUrl: "https://api.groq.com/openai/v1",
    secretKey: "GROQ_API_KEY",
    costPerMInput: 0,
    costPerMOutput: 0,
  },
  {
    id: "nvidia-llama70",
    env: "nvidia",
    model: "meta/llama-3.3-70b-instruct",
    label: "Llama 3.3 70B (NIM)",
    description: "70B no NIM — use no pool ROBIN, não modelos 8B.",
    tier: "pool",
    llmProvider: "openai",
    baseUrl: "https://integrate.api.nvidia.com/v1",
    secretKey: "NVIDIA_API_KEY",
    costPerMInput: 0,
    costPerMOutput: 0,
    recommended: true,
  },
  {
    id: "nvidia-nemotron",
    env: "nvidia",
    model: "nvidia/nemotron-4-340b-instruct",
    label: "Nemotron 4 340B",
    description: "Máxima capacidade NVIDIA — rate limit mais agressivo.",
    tier: "frontier",
    llmProvider: "openai",
    baseUrl: "https://integrate.api.nvidia.com/v1",
    secretKey: "NVIDIA_API_KEY",
    costPerMInput: 0,
    costPerMOutput: 0,
  },
];

/** Modelos permitidos no modo ROBIN (pool) */
export const POOL_MODEL_PRESETS = CODING_MODEL_PRESETS.filter(
  (p) => p.tier === "pool" || p.env === "groq" || p.env === "nvidia",
).filter((p) => p.env === "groq" || p.env === "nvidia");

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

/** Migra IDs antigos da UI */
const LEGACY_PRESET_IDS: Record<string, string> = {
  "xai-grok": "xai-grok3-mini",
  "groq-llama": "groq-llama70",
};

export function normalizePresetId(id?: string): string {
  if (!id) return "anthropic-sonnet";
  return LEGACY_PRESET_IDS[id] ?? id;
}

export function getPresetById(id?: string): ForgeModelPreset {
  const norm = normalizePresetId(id);
  return PRESET_BY_ID.get(norm) ?? CODING_MODEL_PRESETS[0]!;
}

export function presetsForEnv(env: AiEnvId): ForgeModelPreset[] {
  return CODING_MODEL_PRESETS.filter((p) => p.env === env);
}

export function presetsByEnvGrouped(): { env: AiEnvId; meta: (typeof AI_ENV_META)[AiEnvId]; models: ForgeModelPreset[] }[] {
  const envs: AiEnvId[] = ["anthropic", "gemini", "openai", "xai", "groq", "nvidia"];
  return envs.map((env) => ({
    env,
    meta: AI_ENV_META[env],
    models: presetsForEnv(env),
  }));
}

export function poolPresetsForProvider(poolProvider: "groq" | "nvidia"): ForgeModelPreset[] {
  return POOL_MODEL_PRESETS.filter((p) => p.env === poolProvider);
}

export function presetToProviderOption(p: ForgeModelPreset) {
  return {
    id: p.id,
    provider: AI_ENV_META[p.env].label,
    model: p.model,
    label: p.label,
    description: p.description,
    costPerMInput: p.costPerMInput,
    costPerMOutput: p.costPerMOutput,
    recommended: p.recommended,
  };
}

export const PROVIDER_PRESETS_FOR_UI = CODING_MODEL_PRESETS.map(presetToProviderOption);