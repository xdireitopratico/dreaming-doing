/** Presets de modelo — manter IDs em sync com src/lib/model-catalog.ts */

export type PresetWire = {
  provider: string;
  model: string;
  baseUrl?: string;
  label: string;
  secretKey: string;
};

const OR = "https://openrouter.ai/api/v1";

function or(model: string, label: string, secretKey = "OPENROUTER_API_KEY"): PresetWire {
  return { provider: "openai", model, baseUrl: OR, label, secretKey };
}

const PRESETS: Record<string, PresetWire> = {
  "or-anthropic--claude-sonnet-4-6": or("anthropic/claude-sonnet-4-6", "Claude Sonnet 4.6"),
  "or-anthropic--claude-opus-4-8": or("anthropic/claude-opus-4-8", "Claude Opus 4.8"),
  "or-anthropic--claude-opus-4-7": or("anthropic/claude-opus-4-7", "Claude Opus 4.7"),
  "or-anthropic--claude-opus-4-8-fast": or("anthropic/claude-opus-4-8-fast", "Claude Opus 4.8 Fast"),
  "or-openai--gpt-5-5": or("openai/gpt-5.5", "GPT-5.5"),
  "or-openai--gpt-5-5-instant": or("openai/gpt-5.5-instant", "GPT-5.5 Instant"),
  "or-openai--gpt-5-3-codex": or("openai/gpt-5.3-codex", "GPT-5.3 Codex"),
  "or-openai--gpt-5-4": or("openai/gpt-5.4", "GPT-5.4"),
  "or-google--gemini-3-5-flash": or("google/gemini-3.5-flash", "Gemini 3.5 Flash"),
  "or-google--gemini-3-1-pro": or("google/gemini-3.1-pro", "Gemini 3.1 Pro"),
  "or-google--gemma-4-31b-it": or("google/gemma-4-31b-it", "Gemma 4 31B"),
  "or-xai--grok-4-3": or("xai/grok-4.3", "Grok 4.3"),
  "or-xai--grok-build-0-1": or("xai/grok-build-0.1", "Grok Build 0.1"),
  "or-deepseek--deepseek-v4-pro": or("deepseek/deepseek-v4-pro", "DeepSeek V4 Pro"),
  "or-deepseek--deepseek-v4-flash": or("deepseek/deepseek-v4-flash", "DeepSeek V4 Flash"),
  "or-deepseek--deepseek-v3": or("deepseek/deepseek-v3", "DeepSeek V3"),
  "or-qwen--qwen3-7-max": or("qwen/qwen3.7-max", "Qwen 3.7 Max"),
  "or-qwen--qwen3-7-plus": or("qwen/qwen3.7-plus", "Qwen 3.7 Plus"),
  "or-qwen--qwen3-6-plus": or("qwen/qwen3.6-plus", "Qwen 3.6 Plus"),
  "or-qwen--qwen3-6-flash": or("qwen/qwen3.6-flash", "Qwen 3.6 Flash"),
  "or-qwen--qwen3-coder": or("qwen/qwen3-coder", "Qwen3 Coder"),
  "or-qwen--qwen3-5-397b-a17b": or("qwen/qwen3.5-397b-a17b", "Qwen3.5 397B"),
  "or-moonshotai--kimi-k2-6": or("moonshotai/kimi-k2.6", "Kimi K2.6"),
  "or-moonshotai--kimi-k2-5": or("moonshotai/kimi-k2.5", "Kimi K2.5"),
  "or-minimax--minimax-m3": or("minimax/minimax-m3", "MiniMax M3"),
  "or-minimax--minimax-m2-7": or("minimax/minimax-m2.7", "MiniMax M2.7"),
  "or-minimax--minimax-m2-5": or("minimax/minimax-m2.5", "MiniMax M2.5"),
  "or-zhipu--glm-5-1": or("zhipu/glm-5.1", "GLM-5.1"),
  "or-zhipu--glm-5": or("zhipu/glm-5", "GLM-5"),
  "or-nvidia--nemotron-3-ultra-550b": or("nvidia/nemotron-3-ultra-550b", "Nemotron 3 Ultra"),
  "or-nvidia--nemotron-3-super-120b": or("nvidia/nemotron-3-super-120b", "Nemotron 3 Super"),
  "pool-groq-flash": {
    provider: "openai",
    model: "llama-3.3-70b-versatile",
    baseUrl: "https://api.groq.com/openai/v1",
    label: "Groq · Llama 3.3 70B",
    secretKey: "GROQ_API_KEY",
  },
  "pool-nemotron-super": {
    provider: "openai",
    model: "nvidia/nemotron-3-super-120b",
    baseUrl: "https://integrate.api.nvidia.com/v1",
    label: "NVIDIA · Nemotron 3 Super",
    secretKey: "NVIDIA_API_KEY",
  },
  "pool-nemotron-ultra": {
    provider: "openai",
    model: "nvidia/nemotron-3-ultra-550b",
    baseUrl: "https://integrate.api.nvidia.com/v1",
    label: "NVIDIA · Nemotron 3 Ultra",
    secretKey: "NVIDIA_API_KEY",
  },
};

const DEFAULT_ID = "or-anthropic--claude-sonnet-4-6";

const LEGACY: Record<string, string> = {
  "anthropic-sonnet": DEFAULT_ID,
  "anthropic-opus": "or-anthropic--claude-opus-4-8",
  "openrouter-custom": DEFAULT_ID,
  "xai-grok": "or-xai--grok-4-3",
  "xai-grok3": "or-xai--grok-4-3",
  "xai-grok3-mini": "or-xai--grok-build-0-1",
  "groq-llama": "pool-groq-flash",
  "groq-llama70": "pool-groq-flash",
  "nvidia-llama70": "pool-nemotron-super",
  "nvidia-nemotron": "pool-nemotron-ultra",
};

export function normalizePresetId(id?: string): string {
  if (!id) return DEFAULT_ID;
  return LEGACY[id] ?? id;
}

export function getPresetWire(id?: string): PresetWire {
  const key = normalizePresetId(id);
  return PRESETS[key] ?? PRESETS[DEFAULT_ID]!;
}

export function resolveFixedFromKeys(
  presetId: string | undefined,
  keys: Record<string, string>,
): (PresetWire & { apiKey: string }) | null {
  const preset = getPresetWire(presetId);
  const apiKey = keys[preset.secretKey];
  if (!apiKey) return null;
  return { ...preset, apiKey };
}

type PrefsLike = {
  fixedPresetId?: string;
  customModelId?: string;
  useCustomModel?: boolean;
};

export function resolveModelFromPreferences(
  preferences: PrefsLike | undefined,
  keys: Record<string, string>,
): (PresetWire & { apiKey: string }) | null {
  const base = resolveFixedFromKeys(preferences?.fixedPresetId, keys);
  if (!base) return null;
  const custom = preferences?.customModelId?.trim();
  if (preferences?.useCustomModel && custom) {
    return { ...base, model: custom, label: `${base.label} · ${custom}` };
  }
  return base;
}

export function defaultRobinModel(poolProvider: "nvidia" | "groq", modelPresetId?: string): PresetWire {
  if (modelPresetId) {
    const p = getPresetWire(modelPresetId);
    if (poolProvider === "groq" && p.secretKey === "GROQ_API_KEY") return p;
    if (poolProvider === "nvidia" && p.secretKey === "NVIDIA_API_KEY") return p;
  }
  return poolProvider === "nvidia" ? PRESETS["pool-nemotron-super"]! : PRESETS["pool-groq-flash"]!;
}