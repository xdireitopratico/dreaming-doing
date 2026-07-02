/**
 * run-setup.ts — fonte única para validação de preferences e resolução de provider LLM.
 * Usado por agent-run/index.ts, run-executor.ts e run-job.ts.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  loadAgentPreferencesFromDb,
} from "./agent-preferences-db.ts";
import {
  loadConnectorKeys,
  loadConnectorPools,
  loadForgeTrialRobinPool,
  type AgentPreferencesPayload,
} from "./connector-keys.ts";
import { type ProviderConfig, detectVisionSupport } from "./providers.ts";
import {
  defaultRobinModel,
  PLATFORM_ROBIN_TASTE_PRESET_ID,
  resolveAutoForComplexity,
  resolveModelFromPreferences,
} from "../_shared/model-presets.ts";
import { RobinKeyPool } from "./robin-pool.ts";
import { normalizeNimBaseUrl, normalizeNvidiaApiModel } from "../_shared/nvidia-model.ts";

export const USER_LLM_KEY_NAMES = [
  "ANTHROPIC_API_KEY",
  "GROQ_API_KEY",
  "XAI_API_KEY",
  "OPENAI_API_KEY",
  "NVIDIA_API_KEY",
  "GEMINI_API_KEY",
  "OPENROUTER_API_KEY",
  "DEEPSEEK_API_KEY",
  "DASHSCOPE_API_KEY",
  "MINIMAX_API_KEY",
  "MOONSHOT_API_KEY",
  "MIMO_API_KEY",
  "OLLAMA_BASE_URL",
] as const;

export function isRobinMode(p?: AgentPreferencesPayload | null): boolean {
  return p?.mode === "robin" || p?.mode === "rob";
}

export function validateAgentPreferences(p?: AgentPreferencesPayload): string | null {
  if (!p?.mode) {
    return "Setup obrigatório: configure modo e modelo em Api & Models (/api-models).";
  }
  if (p.mode === "auto") {
    if ((p.autoAllowedPresetIds?.length ?? 0) > 0) return null;
    return "Setup: selecione de 1 a 5 modelos para o modo Auto em Api & Models (/api-models).";
  }
  if (p.mode === "fixed") {
    if (p.fixedPresetId?.trim()) return null;
    if (p.useCustomModel && p.customModelId?.trim()) return null;
    return "Setup: selecione um modelo fixo em Api & Models (/api-models).";
  }
  if (isRobinMode(p) && !p.robinPoolModelId?.trim()) {
    return "Setup: selecione o modelo do pool ROBIN em Api & Models (/api-models).";
  }
  if (isRobinMode(p) && !p.poolProvider) {
    return "Setup: selecione o provedor do pool ROBIN em Api & Models (/api-models).";
  }
  return null;
}

function finalizeProviderConfig(cfg: ProviderConfig): ProviderConfig {
  const baseUrl = normalizeNimBaseUrl(cfg.baseUrl) ?? cfg.baseUrl;
  const isNim =
    (baseUrl?.includes("integrate.api.nvidia.com") ?? false) ||
    cfg.model.includes("nemotron") ||
    cfg.model.startsWith("nvidia/") ||
    cfg.model.startsWith("qwen/");
  const model = isNim ? normalizeNvidiaApiModel(cfg.model) : cfg.model;
  if (model === cfg.model && baseUrl === cfg.baseUrl) return cfg;
  return { ...cfg, model, baseUrl };
}

export function robinProviderConfig(
  poolProvider: string,
  keys: string[],
  modelPresetId?: string,
  userModels?: Array<{ slug: string; env: string; label?: string }>,
): ProviderConfig {
  if (keys.length === 0) {
    throw new Error(
      `Modo ROBIN ativo, mas nenhuma chave no pool ${poolProvider}. Adicione chaves em /api → Adicionar ao pool.`,
    );
  }
  const wire = defaultRobinModel(poolProvider, modelPresetId, userModels);
  return finalizeProviderConfig({
    provider: wire.provider,
    apiKey: keys[0]!,
    model: wire.model,
    baseUrl: wire.baseUrl,
    label: `ROBIN · ${wire.label} (${keys.length} chaves)`,
    supportsVision: detectVisionSupport(wire.provider, wire.model),
  });
}

function isUserLlmKeyName(key: string): boolean {
  if (key === "OLLAMA_BASE_URL") return true;
  if (USER_LLM_KEY_NAMES.includes(key as (typeof USER_LLM_KEY_NAMES)[number])) return true;
  return key.endsWith("_API_KEY");
}

export function hasUserLlmKeyFromKeys(
  userOnlyKeys: Record<string, string>,
  poolKeys: string[] = [],
  preferences?: AgentPreferencesPayload,
): boolean {
  // FAIL-CLOSE: se o usuário configurou agent_preferences em /api-models, BYOK vale
  // mesmo sem key salva no `connectors` ainda.
  if (preferences?.mode) return true;
  return (
    poolKeys.length > 0 ||
    Object.keys(userOnlyKeys).some((k) => isUserLlmKeyName(k) && !!userOnlyKeys[k]?.trim())
  );
}

/** SSOT absoluto: profiles.agent_preferences. */
export async function resolveEffectiveAgentPreferences(
  supabase: SupabaseClient,
  userId: string,
  _runMeta?: Record<string, unknown> | null,
): Promise<AgentPreferencesPayload | undefined> {
  const prefs = await loadAgentPreferencesFromDb(supabase, userId);
  return sanitizeRuntimePreferences(prefs);
}

export function sanitizeRuntimePreferences(
  prefs: AgentPreferencesPayload | undefined,
): AgentPreferencesPayload | undefined {
  if (!prefs?.mode) return prefs;
  const next: AgentPreferencesPayload = { ...prefs };
  if (prefs.mode === "auto") {
    next.autoAllowedPresetIds = (next.autoAllowedPresetIds ?? []).slice(0, 5);
    next.fixedPresetId = undefined;
    next.robinPoolModelId = undefined;
    next.poolProvider = undefined;
    next.useCustomModel = undefined;
    next.customModelId = undefined;
    return next;
  }
  if (prefs.mode === "fixed") {
    next.autoAllowedPresetIds = undefined;
    next.robinPoolModelId = undefined;
    next.poolProvider = undefined;
    return next;
  }
  if (isRobinMode(prefs)) {
    next.autoAllowedPresetIds = undefined;
    next.fixedPresetId = undefined;
    next.useCustomModel = undefined;
    next.customModelId = undefined;
    return next;
  }
  return next;
}

export function resolveExecuteIdList(
  eventIds: string[] | undefined,
  runMeta: Record<string, unknown> | null | undefined,
  metaKey: "enabledSkillIds" | "enabledMcpIds",
): string[] {
  if (eventIds?.length) return eventIds;
  const fromMeta = runMeta?.[metaKey];
  if (!Array.isArray(fromMeta)) return [];
  return fromMeta.filter((x): x is string => typeof x === "string");
}

export function resolveExecuteSessionKindRaw(
  eventKind: string | null | undefined,
  runMeta: Record<string, unknown> | null | undefined,
): string | null {
  if (eventKind) return eventKind;
  const sk = runMeta?.sessionKind;
  return typeof sk === "string" ? sk : null;
}

export async function loadUserLlmContext(
  supabase: SupabaseClient,
  userId: string,
  preferences?: AgentPreferencesPayload,
): Promise<{
  userOnlyKeys: Record<string, string>;
  poolKeys: string[];
  hasUserLlmKey: boolean;
}> {
  const userOnlyKeys = await loadConnectorKeys(supabase, userId, preferences);
  const isRobin = isRobinMode(preferences);
  const poolProvider = preferences?.poolProvider;
  const poolKeys = isRobin && poolProvider
    ? await loadConnectorPools(supabase, userId, poolProvider)
    : [];
  return {
    userOnlyKeys,
    poolKeys,
    hasUserLlmKey: hasUserLlmKeyFromKeys(userOnlyKeys, poolKeys, preferences),
  };
}

export type AgentProviderSetup = {
  mainCfg: ProviderConfig;
  connectorKeys: Record<string, string>;
  robinPool: RobinKeyPool | null;
  effectiveRobin: boolean;
  tasteStart: boolean;
};

export type ResolveProviderInput = {
  supabase: SupabaseClient;
  userId: string;
  preferences?: AgentPreferencesPayload;
  sessionKind: "taste_start" | "byok";
  userOnlyKeys: Record<string, string>;
  /** Label prefix for taste start (e.g. "Start Project · Taste · ") */
  tasteStartLabelPrefix?: boolean;
};

/**
 * Resolve mainCfg + connector keys for agent execution.
 * Modo (auto/fixed/robin) vem exclusivamente de agent_preferences no DB.
 */
export async function resolveAgentProvider(
  input: ResolveProviderInput,
): Promise<AgentProviderSetup> {
  const { supabase, userId, sessionKind, userOnlyKeys } = input;
  const preferences = input.preferences;
  if (!preferences?.mode) {
    throw new Error(
      validateAgentPreferences(preferences) ??
        "Setup obrigatório: configure modo e modelo em Api & Models (/api-models).",
    );
  }
  const userWantsRobin = isRobinMode(preferences);
  const poolProvider = preferences.poolProvider;
  if (userWantsRobin && !poolProvider) {
    throw new Error("Setup: selecione o provedor do pool ROBIN em Api & Models (/api-models).");
  }

  if (sessionKind === "taste_start") {
    const poolKeys = await loadForgeTrialRobinPool(supabase);
    if (poolKeys.length === 0) {
      throw new Error(
        "Start Project: administrador deve configurar pool NVIDIA em API Keys (/api).",
      );
    }
    const robinPool = new RobinKeyPool(poolKeys);
    const mainCfg = robinProviderConfig("nvidia", poolKeys, PLATFORM_ROBIN_TASTE_PRESET_ID);
    if (input.tasteStartLabelPrefix) {
      mainCfg.label = `Start Project · Taste · ${mainCfg.label.replace(/^ROBIN · /, "")}`;
    }
    return {
      mainCfg,
      connectorKeys: { NVIDIA_API_KEY: poolKeys[0]! },
      robinPool,
      effectiveRobin: true,
      tasteStart: true,
    };
  }

  if (userWantsRobin) {
    const robinPoolProvider = poolProvider!;
    const poolKeys = await loadConnectorPools(supabase, userId, robinPoolProvider);
    const robinPool = new RobinKeyPool(poolKeys);
    const wire = defaultRobinModel(
      robinPoolProvider,
      preferences?.robinPoolModelId,
      preferences?.userModelEntries,
    );
    const mainCfg = robinProviderConfig(
      robinPoolProvider,
      poolKeys,
      preferences?.robinPoolModelId,
      preferences?.userModelEntries,
    );
    const envKeyName = wire.secretKey || `${robinPoolProvider.toUpperCase()}_API_KEY`;
    return {
      mainCfg,
      connectorKeys: { [envKeyName]: poolKeys[0]! },
      robinPool,
      effectiveRobin: true,
      tasteStart: false,
    };
  }

  const connectorKeys = { ...userOnlyKeys };
  let mainCfg: ProviderConfig;

  if (preferences?.mode === "auto") {
    const allowlist = preferences?.autoAllowedPresetIds ?? [];
    const autoWire = resolveAutoForComplexity(
      userOnlyKeys,
      3,
      allowlist,
      preferences?.userModelEntries,
    );
    if (!autoWire) {
      throw new Error(
        allowlist.length > 0
          ? "Nenhum modelo marcado no Auto tem chave em /api. Adicione a chave ou marque outro modelo."
          : "Modo Auto: selecione de 1 a 5 modelos em /api-models.",
      );
    }
    mainCfg = finalizeProviderConfig({
      provider: autoWire.provider,
      apiKey: autoWire.apiKey,
      model: autoWire.model,
      baseUrl: autoWire.baseUrl,
      label: `${autoWire.label} (Auto)`,
      supportsVision: detectVisionSupport(autoWire.provider, autoWire.model),
    });
  } else if (preferences?.mode === "fixed") {
    const resolved = resolveModelFromPreferences(preferences, userOnlyKeys);
    if (!resolved) {
      throw new Error(
        "Chave ausente para o modelo fixo. Adicione a API Key do provedor em /api.",
      );
    }
    mainCfg = finalizeProviderConfig({
      provider: resolved.provider,
      apiKey: resolved.apiKey,
      model: resolved.model,
      baseUrl: resolved.baseUrl,
      label: `${resolved.label} (fixo)`,
      supportsVision: detectVisionSupport(resolved.provider, resolved.model),
    });
  } else {
    throw new Error("Modo de modelo inválido. Configure Auto, Fixo ou ROBIN em /api-models.");
  }

  return {
    mainCfg,
    connectorKeys,
    robinPool: null,
    effectiveRobin: false,
    tasteStart: false,
  };
}
