/** Presets de modelo — espelho de src/lib/model-catalog.ts (manter IDs em sync). */

export type PresetWire = {
  provider: string;
  model: string;
  baseUrl?: string;
  label: string;
  secretKey: string;
};

const PRESETS: Record<string, PresetWire> = {
  "anthropic-sonnet": {
    provider: "anthropic",
    model: "claude-sonnet-4-20250514",
    label: "Claude Sonnet 4",
    secretKey: "ANTHROPIC_API_KEY",
  },
  "anthropic-opus": {
    provider: "anthropic",
    model: "claude-opus-4-20250514",
    label: "Claude Opus 4",
    secretKey: "ANTHROPIC_API_KEY",
  },
  "gemini-25-pro": {
    provider: "gemini",
    model: "gemini-2.5-pro",
    label: "Gemini 2.5 Pro",
    secretKey: "GEMINI_API_KEY",
  },
  "gemini-25-flash": {
    provider: "gemini",
    model: "gemini-2.5-flash",
    label: "Gemini 2.5 Flash",
    secretKey: "GEMINI_API_KEY",
  },
  "openai-gpt41": {
    provider: "openai",
    model: "gpt-4.1",
    label: "GPT-4.1",
    secretKey: "OPENAI_API_KEY",
  },
  "openai-gpt4o": {
    provider: "openai",
    model: "gpt-4o",
    label: "GPT-4o",
    secretKey: "OPENAI_API_KEY",
  },
  "xai-grok3": {
    provider: "openai",
    model: "grok-3",
    baseUrl: "https://api.x.ai/v1",
    label: "Grok 3",
    secretKey: "XAI_API_KEY",
  },
  "xai-grok3-mini": {
    provider: "openai",
    model: "grok-3-mini",
    baseUrl: "https://api.x.ai/v1",
    label: "Grok 3 Mini",
    secretKey: "XAI_API_KEY",
  },
  "groq-llama70": {
    provider: "openai",
    model: "llama-3.3-70b-versatile",
    baseUrl: "https://api.groq.com/openai/v1",
    label: "Groq · Llama 3.3 70B",
    secretKey: "GROQ_API_KEY",
  },
  "groq-qwen32": {
    provider: "openai",
    model: "qwen-qwq-32b",
    baseUrl: "https://api.groq.com/openai/v1",
    label: "Groq · Qwen QwQ 32B",
    secretKey: "GROQ_API_KEY",
  },
  "nvidia-llama70": {
    provider: "openai",
    model: "meta/llama-3.3-70b-instruct",
    baseUrl: "https://integrate.api.nvidia.com/v1",
    label: "NVIDIA · Llama 3.3 70B",
    secretKey: "NVIDIA_API_KEY",
  },
  "nvidia-nemotron": {
    provider: "openai",
    model: "nvidia/nemotron-4-340b-instruct",
    baseUrl: "https://integrate.api.nvidia.com/v1",
    label: "NVIDIA · Nemotron 4 340B",
    secretKey: "NVIDIA_API_KEY",
  },
};

const LEGACY: Record<string, string> = {
  "xai-grok": "xai-grok3-mini",
  "groq-llama": "groq-llama70",
  "anthropic-sonnet": "anthropic-sonnet",
};

export function normalizePresetId(id?: string): string {
  if (!id) return "anthropic-sonnet";
  return LEGACY[id] ?? id;
}

export function getPresetWire(id?: string): PresetWire {
  const key = normalizePresetId(id);
  return PRESETS[key] ?? PRESETS["anthropic-sonnet"]!;
}

export function resolveFixedFromKeys(
  presetId: string | undefined,
  keys: Record<string, string>,
): PresetWire & { apiKey: string } | null {
  const preset = getPresetWire(presetId);
  const apiKey = keys[preset.secretKey];
  if (!apiKey) return null;
  return { ...preset, apiKey };
}

/** Modelo padrão do pool ROBIN por provedor */
export function defaultRobinModel(poolProvider: "nvidia" | "groq", modelPresetId?: string): PresetWire {
  if (modelPresetId) {
    const p = getPresetWire(modelPresetId);
    if (poolProvider === "groq" && p.secretKey === "GROQ_API_KEY") return p;
    if (poolProvider === "nvidia" && p.secretKey === "NVIDIA_API_KEY") return p;
  }
  return poolProvider === "nvidia" ? PRESETS["nvidia-llama70"]! : PRESETS["groq-llama70"]!;
}