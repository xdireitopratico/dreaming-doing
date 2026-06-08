/**
 * run-setup.ts — fonte única para validação de preferences e resolução de provider LLM.
 * Usado por agent-run/index.ts, run-executor.ts e run-job.ts.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  loadConnectorKeys,
  loadConnectorPools,
  loadForgeTrialRobinPool,
  type AgentPreferencesPayload,
} from "./connector-keys.ts";
import { pickMain, type ProviderConfig } from "./providers.ts";
import {
  defaultRobinModel,
  PLATFORM_ROBIN_TASTE_PRESET_ID,
  resolveModelFromPreferences,
  filterKeysForAutoAllowlist,
} from "../_shared/model-presets.ts";
import { RobinKeyPool } from "./robin-pool.ts";

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
    return "Setup obrigatório: configure modo e modelo em Modelos (/models).";
  }
  if (p.mode === "auto") return null;
  if (p.mode === "fixed" && !p.fixedPresetId?.trim()) {
    return "Setup: selecione um modelo fixo em Modelos (/models).";
  }
  if (isRobinMode(p) && !p.robinPoolModelId?.trim()) {
    return "Setup: selecione o modelo do pool ROBIN em Modelos (/models).";
  }
  if (isRobinMode(p) && !p.poolProvider) {
    return "Setup: selecione o provedor do pool ROBIN (Groq ou NVIDIA).";
  }
  return null;
}

export function robinProviderConfig(
  poolProvider: "nvidia" | "groq",
  keys: string[],
  modelPresetId?: string,
): ProviderConfig {
  if (keys.length === 0) {
    throw new Error(
      `Modo ROBIN ativo, mas nenhuma chave ${poolProvider.toUpperCase()} no pool. Adicione chaves em /api → Adicionar ao pool.`,
    );
  }
  const wire = defaultRobinModel(poolProvider, modelPresetId);
  return {
    provider: wire.provider,
    apiKey: keys[0]!,
    model: wire.model,
    baseUrl: wire.baseUrl,
    label: `ROBIN · ${wire.label} (${keys.length} chaves)`,
  };
}

export function hasUserLlmKeyFromKeys(
  userOnlyKeys: Record<string, string>,
  groqPool: string[],
  nvidiaPool: string[],
): boolean {
  return (
    groqPool.length > 0 ||
    nvidiaPool.length > 0 ||
    Object.keys(userOnlyKeys).some((k) => USER_LLM_KEY_NAMES.includes(k as (typeof USER_LLM_KEY_NAMES)[number]))
  );
}

/** Inngest execute may arrive without preferences — fall back to run meta from connect. */
export function resolveExecutePreferences(
  eventPrefs: AgentPreferencesPayload | null | undefined,
  runMeta: Record<string, unknown> | null | undefined,
): AgentPreferencesPayload | undefined {
  const metaPrefs =
    runMeta?.preferences &&
    typeof runMeta.preferences === "object" &&
    !Array.isArray(runMeta.preferences)
      ? (runMeta.preferences as AgentPreferencesPayload)
      : undefined;
  const evt = eventPrefs ?? undefined;
  if (evt?.mode) return { ...metaPrefs, ...evt };
  if (metaPrefs?.mode) return metaPrefs;
  return evt ?? metaPrefs;
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
  groqPool: string[];
  nvidiaPool: string[];
  hasUserLlmKey: boolean;
}> {
  const userOnlyKeys = await loadConnectorKeys(supabase, userId, preferences);
  const groqPool = await loadConnectorPools(supabase, userId, "groq");
  const nvidiaPool = await loadConnectorPools(supabase, userId, "nvidia");
  return {
    userOnlyKeys,
    groqPool,
    nvidiaPool,
    hasUserLlmKey: hasUserLlmKeyFromKeys(userOnlyKeys, groqPool, nvidiaPool),
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
 * taste_start uses platform NVIDIA trial pool; byok uses user prefs / robin / auto / fixed.
 */
/** Quando prefs vazias (smoke/Inngest) mas o usuário tem chaves — inferir modo. */
export function coalesceAgentPreferences(
  preferences: AgentPreferencesPayload | undefined,
  userOnlyKeys: Record<string, string>,
  groqPool: string[],
  nvidiaPool: string[],
): AgentPreferencesPayload {
  if (preferences?.mode) return preferences;
  if (nvidiaPool.length > 0) {
    return {
      mode: "robin",
      poolProvider: "nvidia",
      robinPoolModelId: "nvidia--nemotron-3-ultra-550b",
    };
  }
  if (groqPool.length > 0) {
    return { mode: "robin", poolProvider: "groq", robinPoolModelId: "pool-groq-flash" };
  }
  if (Object.keys(userOnlyKeys).length > 0) {
    return { mode: "auto" };
  }
  return preferences ?? {};
}

export async function resolveAgentProvider(
  input: ResolveProviderInput,
): Promise<AgentProviderSetup> {
  const { supabase, userId, sessionKind, userOnlyKeys } = input;
  const groqPool = await loadConnectorPools(supabase, userId, "groq");
  const nvidiaPool = await loadConnectorPools(supabase, userId, "nvidia");
  const preferences = coalesceAgentPreferences(
    input.preferences,
    userOnlyKeys,
    groqPool,
    nvidiaPool,
  );
  const userWantsRobin = isRobinMode(preferences);
  const poolProvider = preferences?.poolProvider ?? "groq";

  if (sessionKind === "taste_start") {
    const poolKeys = await loadForgeTrialRobinPool(supabase);
    if (poolKeys.length === 0) {
      throw new Error("Start Project: administrador deve configurar pool NVIDIA em API Keys (/api).");
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
    const poolKeys = poolProvider === "nvidia" ? nvidiaPool : groqPool;
    const robinPool = new RobinKeyPool(poolKeys);
    const mainCfg = robinProviderConfig(poolProvider, poolKeys, preferences?.robinPoolModelId);
    return {
      mainCfg,
      connectorKeys: poolProvider === "nvidia"
        ? { NVIDIA_API_KEY: poolKeys[0]! }
        : { GROQ_API_KEY: poolKeys[0]! },
      robinPool,
      effectiveRobin: true,
      tasteStart: false,
    };
  }

  const connectorKeys = { ...userOnlyKeys };
  let mainCfg: ProviderConfig;

  if (preferences?.mode === "auto") {
    const autoKeys = filterKeysForAutoAllowlist(
      userOnlyKeys,
      preferences?.autoAllowedPresetIds,
      preferences?.userModelEntries,
    );
    mainCfg = pickMain(autoKeys);
    const n = preferences?.autoAllowedPresetIds?.length ?? 0;
    mainCfg.label = `${mainCfg.label} (Auto · ${n > 0 ? `${n} modelo(s)` : "todas as chaves"})`;
  } else {
    const resolved = resolveModelFromPreferences(preferences, userOnlyKeys);
    if (!resolved) {
      throw new Error("Chave ausente para o modelo escolhido. Adicione a API Key do provedor em /api.");
    }
    mainCfg = {
      provider: resolved.provider,
      apiKey: resolved.apiKey,
      model: resolved.model,
      baseUrl: resolved.baseUrl,
      label: `${resolved.label} (fixo)`,
    };
  }

  return {
    mainCfg,
    connectorKeys,
    robinPool: null,
    effectiveRobin: false,
    tasteStart: false,
  };
}