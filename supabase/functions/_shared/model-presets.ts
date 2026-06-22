/** Presets — sync com src/lib/model-catalog.ts (IDs = slug com / → --) */

import {
  customProviderBaseUrlKey,
  wireFromProviderEntry,
} from "./provider-wire.ts";

export type ModelTier = "frontier" | "balanced" | "fast" | "pool";

export type PresetWire = {
  provider: string;
  model: string;
  baseUrl?: string;
  label: string;
  secretKey: string;
};

type PresetMeta = { tier: ModelTier; rank: number };

/** Tier + rank — sync com src/lib/model-catalog.ts (menor rank = mais forte). */
const PRESET_META: Record<string, PresetMeta> = {
  "anthropic--claude-opus-4-8": { tier: "frontier", rank: 1 },
  "anthropic--claude-opus-4-7": { tier: "frontier", rank: 2 },
  "anthropic--claude-sonnet-4-6": { tier: "frontier", rank: 3 },
  "openai--gpt-5-5": { tier: "frontier", rank: 4 },
  "openai--gpt-5-5-instant": { tier: "frontier", rank: 5 },
  "openai--gpt-5-3-codex": { tier: "frontier", rank: 6 },
  "google--gemini-3-5-flash": { tier: "frontier", rank: 7 },
  "google--gemini-3-1-pro": { tier: "frontier", rank: 8 },
  "xai--grok-4-3": { tier: "frontier", rank: 9 },
  "xai--grok-build-0-1": { tier: "frontier", rank: 10 },
  "deepseek--deepseek-v4-pro": { tier: "balanced", rank: 11 },
  "deepseek--deepseek-v4-flash": { tier: "balanced", rank: 12 },
  "qwen--qwen3-7-max": { tier: "balanced", rank: 13 },
  "qwen--qwen3-7-plus": { tier: "balanced", rank: 14 },
  "qwen--qwen3-6-plus": { tier: "balanced", rank: 15 },
  "moonshotai--kimi-k2-6": { tier: "balanced", rank: 16 },
  "moonshotai--kimi-k2-5": { tier: "balanced", rank: 17 },
  "minimax--minimax-m3": { tier: "balanced", rank: 18 },
  "minimax--minimax-m2-7": { tier: "balanced", rank: 19 },
  "zhipu--glm-5-1": { tier: "balanced", rank: 20 },
  "xiaomi--mimo-v2-5-pro": { tier: "balanced", rank: 32 },
  "google--gemma-4-31b-it": { tier: "fast", rank: 24 },
  "anthropic--claude-opus-4-8-fast": { tier: "fast", rank: 25 },
  "openai--gpt-5-4": { tier: "fast", rank: 26 },
  "deepseek--deepseek-v3": { tier: "fast", rank: 27 },
  "qwen--qwen3-6-flash": { tier: "fast", rank: 28 },
  "minimax--minimax-m2-5": { tier: "fast", rank: 29 },
  "zhipu--glm-5": { tier: "fast", rank: 30 },
  "qwen--qwen3-coder": { tier: "pool", rank: 23 },
  "nvidia--nemotron-3-ultra-550b": { tier: "pool", rank: 21 },
  "nvidia--nemotron-3-super-120b": { tier: "pool", rank: 22 },
  "qwen--qwen3-5-397b-a17b": { tier: "pool", rank: 31 },
  "pool-groq-flash": { tier: "pool", rank: 90 },
  "pool-nemotron-ultra-550b": { tier: "pool", rank: 91 },
  "pool-nemotron-super": { tier: "pool", rank: 91 },
  "ollama--llama3-2": { tier: "fast", rank: 200 },
  "ollama--qwen2-5-coder": { tier: "balanced", rank: 201 },
  "ollama--deepseek-r1-8b": { tier: "fast", rank: 202 },
  "ollama--mistral": { tier: "fast", rank: 203 },
};

function metaForPresetId(id: string): PresetMeta {
  return PRESET_META[normalizePresetId(id)] ?? { tier: "balanced", rank: 9999 };
}

/** Ordem de tiers a tentar conforme complexidade (1=leve, 5=pesado). */
export function autoTierSearchOrder(complexity: number): ModelTier[] {
  const c = Math.min(5, Math.max(1, complexity));
  if (c <= 2) return ["fast", "balanced", "frontier"];
  if (c === 3) return ["balanced", "frontier", "fast"];
  return ["frontier", "balanced", "fast"];
}

type AutoCandidate = {
  id: string;
  wire: PresetWire & { apiKey: string };
  tier: ModelTier;
  rank: number;
};

function listAutoCandidates(
  keys: Record<string, string>,
  allowedPresetIds?: string[],
  userModels?: UserModelEntryPayload[],
): AutoCandidate[] {
  const allowlist = allowedPresetIds?.map(normalizePresetId).filter(Boolean) ?? [];
  const ids =
    allowlist.length > 0
      ? allowlist
      : Object.keys(PRESETS).filter((id) => metaForPresetId(id).tier !== "pool");

  const out: AutoCandidate[] = [];
  for (const id of ids) {
    const wire = resolveWireFromPresetId(id, userModels) ?? getPresetWire(id);
    if (!wire) continue;
    const resolved = wireWithKey(wire, keys);
    if (!resolved) continue;
    const meta = metaForPresetId(id);
    if (meta.tier === "pool") continue;
    out.push({ id, wire: resolved, tier: meta.tier, rank: meta.rank });
  }
  out.sort((a, b) => a.rank - b.rank);
  return out;
}

function pickAutoByTierOrder(
  candidates: AutoCandidate[],
  tierOrder: ModelTier[],
): (PresetWire & { apiKey: string }) | null {
  for (const tier of tierOrder) {
    const inTier = candidates.filter((c) => c.tier === tier);
    if (inTier.length > 0) return inTier[0]!.wire;
  }
  return candidates[0]?.wire ?? null;
}

/** Classify no Auto — sempre tier fast (demanda leve). */
export function resolveAutoClassifyProvider(
  keys: Record<string, string>,
  allowedPresetIds?: string[],
  userModels?: UserModelEntryPayload[],
): (PresetWire & { apiKey: string }) | null {
  const candidates = listAutoCandidates(keys, allowedPresetIds, userModels);
  return pickAutoByTierOrder(candidates, ["fast", "balanced", "frontier"]);
}

/** Execução no Auto — modelo conforme complexidade / potência da demanda. */
export function resolveAutoForComplexity(
  keys: Record<string, string>,
  complexity: number,
  allowedPresetIds?: string[],
  userModels?: UserModelEntryPayload[],
): (PresetWire & { apiKey: string }) | null {
  const candidates = listAutoCandidates(keys, allowedPresetIds, userModels);
  return pickAutoByTierOrder(candidates, autoTierSearchOrder(complexity));
}

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
  return {
    provider: "openai",
    model,
    baseUrl: "https://api.x.ai/v1",
    label,
    secretKey: "XAI_API_KEY",
  };
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
  return {
    provider: "openrouter",
    model: slug,
    baseUrl: OR,
    label,
    secretKey: "OPENROUTER_API_KEY",
  };
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
function ollama(model: string, label: string): PresetWire {
  return { provider: "ollama", model, label, secretKey: "OLLAMA_BASE_URL" };
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
  "nvidia--nemotron-3-ultra-550b": nvidia(
    "nvidia/nemotron-3-ultra-550b-a55b",
    "Nemotron 3 Ultra (550B)",
  ),
  "nvidia--nemotron-3-super-120b": nvidia("nvidia/nemotron-3-super-120b", "Nemotron 3 Super"),
  "pool-groq-flash": {
    provider: "openai",
    model: "llama-3.3-70b-versatile",
    baseUrl: "https://api.groq.com/openai/v1",
    label: "Groq · Llama 3.3 70B",
    secretKey: "GROQ_API_KEY",
  },
  "pool-nemotron-ultra-550b": nvidia(
    "nvidia/nemotron-3-ultra-550b-a55b",
    "NVIDIA · Nemotron 3 Ultra (550B)",
  ),
  "pool-nemotron-super": nvidia(
    "nvidia/nemotron-3-ultra-550b-a55b",
    "NVIDIA · Nemotron 3 Ultra (550B)",
  ),
  "ollama--llama3-2": ollama("llama3.2", "Llama 3.2"),
  "ollama--qwen2-5-coder": ollama("qwen2.5-coder:7b", "Qwen 2.5 Coder 7B"),
  "ollama--deepseek-r1-8b": ollama("deepseek-r1:8b", "DeepSeek R1 8B"),
  "ollama--mistral": ollama("mistral", "Mistral"),
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

function wireFromUserEntry(entry: UserModelEntryPayload): PresetWire | null {
  return wireFromProviderEntry(entry);
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
  if (preset.provider === "ollama" || preset.secretKey === "OLLAMA_BASE_URL") {
    const baseUrl = keys.OLLAMA_BASE_URL;
    if (!baseUrl) return null;
    const model = keys.OLLAMA_MODEL || preset.model;
    return { ...preset, model, baseUrl, apiKey: "ollama" };
  }
  const apiKey = keys[preset.secretKey];
  if (!apiKey) return null;
  const baseUrl = preset.baseUrl ?? keys[customProviderBaseUrlKey(preset.secretKey)];
  return baseUrl ? { ...preset, apiKey, baseUrl } : { ...preset, apiKey };
}

type PrefsLike = {
  fixedPresetId?: string;
  customModelId?: string;
  useCustomModel?: boolean;
  userModelEntries?: UserModelEntryPayload[];
};

export function wireWithKey(
  wire: PresetWire,
  keys: Record<string, string>,
): (PresetWire & { apiKey: string }) | null {
  if (wire.provider === "ollama" || wire.secretKey === "OLLAMA_BASE_URL") {
    const baseUrl = keys.OLLAMA_BASE_URL;
    if (!baseUrl) return null;
    return { ...wire, baseUrl, model: keys.OLLAMA_MODEL || wire.model, apiKey: "ollama" };
  }
  const apiKey = keys[wire.secretKey];
  if (!apiKey) return null;
  const baseUrl = wire.baseUrl ?? keys[customProviderBaseUrlKey(wire.secretKey)];
  return baseUrl ? { ...wire, apiKey, baseUrl } : { ...wire, apiKey };
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

export function defaultRobinModel(
  poolProvider: string,
  modelPresetId?: string,
): PresetWire {
  if (modelPresetId) {
    const p = getPresetWire(modelPresetId);
    if (p) return p;
  }
  if (poolProvider === "nvidia") return PRESETS[PLATFORM_ROBIN_TASTE_PRESET_ID]!;
  if (poolProvider === "groq") {
    const groq = PRESETS["pool-groq-flash"];
    if (!groq) throw new Error("Preset pool Groq ausente");
    return groq;
  }
  throw new Error(
    `Selecione um modelo para o pool ${poolProvider} em Modelos → ROBIN.`,
  );
}
