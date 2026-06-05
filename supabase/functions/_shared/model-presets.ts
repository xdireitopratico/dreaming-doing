/** Presets — sync com src/lib/model-catalog.ts (IDs = slug com / → --) */

export type PresetWire = {
  provider: string;
  model: string;
  baseUrl?: string;
  label: string;
  secretKey: string;
};

const OR = "https://openrouter.ai/api/v1";

function anthropic(model: string, label: string): PresetWire {
  return { provider: "anthropic", model, label, secretKey: "ANTHROPIC_API_KEY" };
}
function openai(model: string, label: string, baseUrl?: string): PresetWire {
  return { provider: "openai", model, label, secretKey: "OPENAI_API_KEY", baseUrl };
}
function gemini(model: string, label: string): PresetWire {
  return { provider: "gemini", model, label, secretKey: "GEMINI_API_KEY" };
}
function xai(model: string, label: string): PresetWire {
  return { provider: "openai", model, baseUrl: "https://api.x.ai/v1", label, secretKey: "XAI_API_KEY" };
}
function nvidia(model: string, label: string): PresetWire {
  return {
    provider: "openai",
    model,
    baseUrl: "https://integrate.api.nvidia.com/v1",
    label,
    secretKey: "NVIDIA_API_KEY",
  };
}
function openrouter(slug: string, label: string): PresetWire {
  return { provider: "openrouter", model: slug, baseUrl: OR, label, secretKey: "OPENROUTER_API_KEY" };
}

const PRESETS: Record<string, PresetWire> = {
  "anthropic--claude-opus-4-8": anthropic("claude-opus-4-8", "Claude Opus 4.8"),
  "anthropic--claude-opus-4-7": anthropic("claude-opus-4-7", "Claude Opus 4.7"),
  "anthropic--claude-sonnet-4-6": anthropic("claude-sonnet-4-6", "Claude Sonnet 4.6"),
  "anthropic--claude-opus-4-8-fast": anthropic("claude-opus-4-8-fast", "Claude Opus 4.8 Fast"),
  "openai--gpt-5-5": openai("gpt-5.5", "GPT-5.5"),
  "openai--gpt-5-5-instant": openai("gpt-5.5-instant", "GPT-5.5 Instant"),
  "openai--gpt-5-3-codex": openai("gpt-5.3-codex", "GPT-5.3 Codex"),
  "openai--gpt-5-4": openai("gpt-5.4", "GPT-5.4"),
  "google--gemini-3-5-flash": gemini("gemini-3.5-flash", "Gemini 3.5 Flash"),
  "google--gemini-3-1-pro": gemini("gemini-3.1-pro", "Gemini 3.1 Pro"),
  "google--gemma-4-31b-it": gemini("gemma-4-31b-it", "Gemma 4 31B"),
  "xai--grok-4-3": xai("grok-4.3", "Grok 4.3"),
  "xai--grok-build-0-1": xai("grok-build-0.1", "Grok Build 0.1"),
  "deepseek--deepseek-v4-pro": openrouter("deepseek/deepseek-v4-pro", "DeepSeek V4 Pro"),
  "deepseek--deepseek-v4-flash": openrouter("deepseek/deepseek-v4-flash", "DeepSeek V4 Flash"),
  "deepseek--deepseek-v3": openrouter("deepseek/deepseek-v3", "DeepSeek V3"),
  "qwen--qwen3-7-max": openrouter("qwen/qwen3.7-max", "Qwen 3.7 Max"),
  "qwen--qwen3-7-plus": openrouter("qwen/qwen3.7-plus", "Qwen 3.7 Plus"),
  "qwen--qwen3-6-plus": openrouter("qwen/qwen3.6-plus", "Qwen 3.6 Plus"),
  "qwen--qwen3-6-flash": openrouter("qwen/qwen3.6-flash", "Qwen 3.6 Flash"),
  "qwen--qwen3-coder": openrouter("qwen/qwen3-coder", "Qwen3 Coder"),
  "qwen--qwen3-5-397b-a17b": openrouter("qwen/qwen3.5-397b-a17b", "Qwen3.5 397B"),
  "moonshotai--kimi-k2-6": openrouter("moonshotai/kimi-k2.6", "Kimi K2.6"),
  "moonshotai--kimi-k2-5": openrouter("moonshotai/kimi-k2.5", "Kimi K2.5"),
  "minimax--minimax-m3": openrouter("minimax/minimax-m3", "MiniMax M3"),
  "minimax--minimax-m2-7": openrouter("minimax/minimax-m2.7", "MiniMax M2.7"),
  "minimax--minimax-m2-5": openrouter("minimax/minimax-m2.5", "MiniMax M2.5"),
  "zhipu--glm-5-1": openrouter("zhipu/glm-5.1", "GLM-5.1"),
  "zhipu--glm-5": openrouter("zhipu/glm-5", "GLM-5"),
  "nvidia--nemotron-3-ultra-550b": nvidia("nvidia/nemotron-3-ultra-550b", "Nemotron 3 Ultra"),
  "nvidia--nemotron-3-super-120b": nvidia("nvidia/nemotron-3-super-120b", "Nemotron 3 Super"),
  "pool-groq-flash": {
    provider: "openai",
    model: "llama-3.3-70b-versatile",
    baseUrl: "https://api.groq.com/openai/v1",
    label: "Groq · Llama 3.3 70B",
    secretKey: "GROQ_API_KEY",
  },
  "pool-nemotron-super": nvidia("nvidia/nemotron-3-super-120b", "NVIDIA · Nemotron 3 Super"),
};

const DEFAULT_ID = "anthropic--claude-sonnet-4-6";

const LEGACY: Record<string, string> = {
  "or-anthropic--claude-sonnet-4-6": DEFAULT_ID,
  "anthropic-sonnet": DEFAULT_ID,
  "openrouter-custom": DEFAULT_ID,
  "groq-llama70": "pool-groq-flash",
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

/** Slug custom (formato OpenRouter) → sempre roteador OpenRouter se houver chave */
export function resolveModelFromPreferences(
  preferences: PrefsLike | undefined,
  keys: Record<string, string>,
): (PresetWire & { apiKey: string }) | null {
  const custom = preferences?.customModelId?.trim();
  if (preferences?.useCustomModel && custom) {
    const orKey = keys.OPENROUTER_API_KEY;
    if (!orKey) return null;
    return {
      provider: "openrouter",
      model: custom,
      baseUrl: OR,
      apiKey: orKey,
      label: `Custom · ${custom}`,
      secretKey: "OPENROUTER_API_KEY",
    };
  }
  return resolveFixedFromKeys(preferences?.fixedPresetId, keys);
}

export function defaultRobinModel(poolProvider: "nvidia" | "groq", modelPresetId?: string): PresetWire {
  if (modelPresetId) {
    const p = getPresetWire(modelPresetId);
    if (poolProvider === "groq" && p.secretKey === "GROQ_API_KEY") return p;
    if (poolProvider === "nvidia" && p.secretKey === "NVIDIA_API_KEY") return p;
  }
  return poolProvider === "nvidia" ? PRESETS["pool-nemotron-super"]! : PRESETS["pool-groq-flash"]!;
}