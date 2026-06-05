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
function deepseek(model: string, label: string): PresetWire {
  return {
    provider: "openai",
    model,
    baseUrl: "https://api.deepseek.com",
    label,
    secretKey: "DEEPSEEK_API_KEY",
  };
}
function dashscope(model: string, label: string): PresetWire {
  return {
    provider: "openai",
    model,
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    label,
    secretKey: "DASHSCOPE_API_KEY",
  };
}
function minimax(model: string, label: string): PresetWire {
  return {
    provider: "openai",
    model,
    baseUrl: "https://api.minimax.io/v1",
    label,
    secretKey: "MINIMAX_API_KEY",
  };
}
function moonshot(model: string, label: string): PresetWire {
  return {
    provider: "openai",
    model,
    baseUrl: "https://api.moonshot.ai/v1",
    label,
    secretKey: "MOONSHOT_API_KEY",
  };
}
function mimo(model: string, label: string): PresetWire {
  return {
    provider: "openai",
    model,
    baseUrl: "https://api.xiaomimimo.com/v1",
    label,
    secretKey: "MIMO_API_KEY",
  };
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
  "deepseek--deepseek-v4-pro": deepseek("deepseek-chat", "DeepSeek V4 Pro"),
  "deepseek--deepseek-v4-flash": deepseek("deepseek-chat", "DeepSeek V4 Flash"),
  "deepseek--deepseek-v3": deepseek("deepseek-chat", "DeepSeek V3"),
  "qwen--qwen3-7-max": dashscope("qwen-max", "Qwen 3.7 Max"),
  "qwen--qwen3-7-plus": dashscope("qwen-plus", "Qwen 3.7 Plus"),
  "qwen--qwen3-6-plus": dashscope("qwen-plus", "Qwen 3.6 Plus"),
  "qwen--qwen3-6-flash": dashscope("qwen-turbo", "Qwen 3.6 Flash"),
  "qwen--qwen3-coder": dashscope("qwen-coder-plus", "Qwen3 Coder"),
  "qwen--qwen3-5-397b-a17b": nvidia("qwen/qwen3.5-397b-a17b", "Qwen3.5 397B (NVIDIA NIM)"),
  "moonshotai--kimi-k2-6": moonshot("kimi-k2.6", "Kimi K2.6"),
  "moonshotai--kimi-k2-5": moonshot("kimi-k2.5", "Kimi K2.5"),
  "minimax--minimax-m3": minimax("MiniMax-M3", "MiniMax M3"),
  "minimax--minimax-m2-7": minimax("MiniMax-M2.7", "MiniMax M2.7"),
  "minimax--minimax-m2-5": minimax("MiniMax-M2.5", "MiniMax M2.5"),
  "xiaomi--mimo-v2-5-pro": mimo("mimo-v2.5-pro", "MiMo V2.5 Pro"),
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
  "pool-nemotron-ultra-550b": nvidia("nvidia/nemotron-3-ultra-550b", "NVIDIA · Nemotron 3 Ultra (550B)"),
  "pool-nemotron-super": nvidia("nvidia/nemotron-3-ultra-550b", "NVIDIA · Nemotron 3 Ultra (550B)"),
};

/** Gosto da plataforma — único preset ROBIN NVIDIA do FORGE */
export const PLATFORM_ROBIN_TASTE_PRESET_ID = "pool-nemotron-ultra-550b";

const LEGACY: Record<string, string> = {
  "groq-llama70": "pool-groq-flash",
  "nvidia-llama70": PLATFORM_ROBIN_TASTE_PRESET_ID,
  "pool-nemotron-super": PLATFORM_ROBIN_TASTE_PRESET_ID,
};

export function normalizePresetId(id?: string): string {
  if (!id?.trim()) return "";
  return LEGACY[id] ?? id;
}

export function getPresetWire(id?: string): PresetWire | null {
  const key = normalizePresetId(id);
  if (!key) return null;
  return PRESETS[key] ?? null;
}

/** Restringe chaves BYOK aos presets permitidos no modo Auto. */
type UserModelEntryPayload = { slug: string; env: string; label?: string };

const ENV_SECRET: Record<string, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  gemini: "GEMINI_API_KEY",
  xai: "XAI_API_KEY",
  groq: "GROQ_API_KEY",
  nvidia: "NVIDIA_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
  deepseek: "DEEPSEEK_API_KEY",
  alibaba: "DASHSCOPE_API_KEY",
  minimax: "MINIMAX_API_KEY",
  moonshotai: "MOONSHOT_API_KEY",
  xiaomi: "MIMO_API_KEY",
};

function wireFromUserEntry(entry: UserModelEntryPayload): PresetWire | null {
  const key = ENV_SECRET[entry.env];
  if (!key) return null;
  const slug = entry.slug.includes("/") ? entry.slug : `${entry.env}/${entry.slug}`;
  if (entry.env === "openrouter") {
    return openrouter(slug, entry.label ?? slug);
  }
  if (entry.env === "anthropic") return anthropic(slug.split("/").pop() ?? slug, entry.label ?? slug);
  if (entry.env === "deepseek") return deepseek("deepseek-chat", entry.label ?? slug);
  if (entry.env === "alibaba") return dashscope("qwen-max", entry.label ?? slug);
  if (entry.env === "minimax") return minimax("MiniMax-M3", entry.label ?? slug);
  if (entry.env === "moonshotai") return moonshot("kimi-k2.6", entry.label ?? slug);
  if (entry.env === "xiaomi") return mimo("mimo-v2.5-pro", entry.label ?? slug);
  if (entry.env === "nvidia") return nvidia(slug, entry.label ?? slug);
  return openai(slug.split("/").pop() ?? slug, entry.label ?? slug, "https://api.openai.com/v1");
}

export function resolveWireFromPresetId(
  id: string | undefined,
  userModels?: UserModelEntryPayload[],
): PresetWire | null {
  const norm = normalizePresetId(id);
  if (!norm) return null;
  const catalog = getPresetWire(norm);
  if (catalog) return catalog;
  if (norm.startsWith("custom--") && userModels?.length) {
    const entry = userModels.find((e) => {
      const slug = e.slug.includes("/") ? e.slug : `${e.env}/${e.slug}`;
      const customId = `custom--${slug.replace(/\//g, "--").replace(/\./g, "-")}`;
      return customId === norm;
    });
    if (entry) return wireFromUserEntry(entry);
  }
  return null;
}

export function filterKeysForAutoAllowlist(
  keys: Record<string, string>,
  allowedPresetIds?: string[],
  userModels?: UserModelEntryPayload[],
): Record<string, string> {
  const list = allowedPresetIds?.map(normalizePresetId).filter(Boolean) ?? [];
  if (list.length === 0) return keys;
  const secretKeys = new Set<string>();
  for (const id of list) {
    const wire = resolveWireFromPresetId(id, userModels) ?? getPresetWire(id);
    if (wire?.secretKey) secretKeys.add(wire.secretKey);
  }
  if (secretKeys.size === 0) return keys;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(keys)) {
    if (secretKeys.has(k)) out[k] = v;
  }
  return out;
}

export function resolveFixedFromKeys(
  presetId: string | undefined,
  keys: Record<string, string>,
): (PresetWire & { apiKey: string }) | null {
  const preset = getPresetWire(presetId);
  if (!preset) return null;
  const apiKey = keys[preset.secretKey];
  if (!apiKey) return null;
  return { ...preset, apiKey };
}

type PrefsLike = {
  fixedPresetId?: string;
  customModelId?: string;
  useCustomModel?: boolean;
  userModelEntries?: UserModelEntryPayload[];
};

function wireWithKey(wire: PresetWire, keys: Record<string, string>): (PresetWire & { apiKey: string }) | null {
  const apiKey = keys[wire.secretKey];
  if (!apiKey) return null;
  return { ...wire, apiKey };
}

/** Slug custom (formato OpenRouter) → sempre roteador OpenRouter se houver chave */
export function resolveModelFromPreferences(
  preferences: PrefsLike | undefined,
  keys: Record<string, string>,
): (PresetWire & { apiKey: string }) | null {
  const id = preferences?.fixedPresetId?.trim();
  if (id) {
    const customWire = resolveWireFromPresetId(id, preferences?.userModelEntries);
    if (customWire) {
      const resolved = wireWithKey(customWire, keys);
      if (resolved) return resolved;
    }
    const fromCatalog = resolveFixedFromKeys(id, keys);
    if (fromCatalog) return fromCatalog;
  }

  const custom = preferences?.customModelId?.trim();
  if (preferences?.useCustomModel && custom) {
    const env = custom.includes("/") ? custom.split("/")[0] : "openrouter";
    const entry = { slug: custom, env };
    const wire = wireFromUserEntry(entry);
    if (wire) {
      const resolved = wireWithKey(wire, keys);
      if (resolved) return resolved;
    }
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
    if (p) {
      if (poolProvider === "groq" && p.secretKey === "GROQ_API_KEY") return p;
      if (poolProvider === "nvidia" && p.secretKey === "NVIDIA_API_KEY") return p;
    }
  }
  if (poolProvider === "nvidia") return PRESETS[PLATFORM_ROBIN_TASTE_PRESET_ID]!;
  const groq = PRESETS["pool-groq-flash"];
  if (!groq) throw new Error("Preset pool Groq ausente");
  return groq;
}