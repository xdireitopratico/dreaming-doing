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
import { pickMain, type ProviderConfig, detectVisionSupport } from "./providers.ts";
import {
  defaultRobinModel,
  PLATFORM_ROBIN_TASTE_PRESET_ID,
  resolveAutoForComplexity,
  resolveModelFromPreferences,
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
  if (p.mode === "fixed") {
    if (p.fixedPresetId?.trim()) return null;
    if (p.useCustomModel && p.customModelId?.trim()) return null;
    if ((p.userModelEntries?.length ?? 0) > 0) return null;
    return "Setup: selecione um modelo fixo em Modelos (/models).";
  }
  if (isRobinMode(p) && !p.robinPoolModelId?.trim()) {
    return "Setup: selecione o modelo do pool ROBIN em Modelos (/models).";
  }
  if (isRobinMode(p) && !p.poolProvider) {
    return "Setup: selecione o provedor do pool ROBIN em Modelos (/models).";
  }
  return null;
}

export function robinProviderConfig(
  poolProvider: string,
  keys: string[],
  modelPresetId?: string,
): ProviderConfig {
  if (keys.length === 0) {
    throw new Error(
      `Modo ROBIN ativo, mas nenhuma chave no pool ${poolProvider}. Adicione chaves em /api → Adicionar ao pool.`,
    );
  }
  const wire = defaultRobinModel(poolProvider, modelPresetId);
  return {
    provider: wire.provider,
    apiKey: keys[0]!,
    model: wire.model,
    baseUrl: wire.baseUrl,
    label: `ROBIN · ${wire.label} (${keys.length} chaves)`,
    supportsVision: detectVisionSupport(wire.provider, wire.model),
  };
}

export function hasUserLlmKeyFromKeys(
  userOnlyKeys: Record<string, string>,
  poolKeys: string[] = [],
): boolean {
  return (
    poolKeys.length > 0 ||
    Object.keys(userOnlyKeys).some((k) =>
      USER_LLM_KEY_NAMES.includes(k as (typeof USER_LLM_KEY_NAMES)[number]),
    )
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
    hasUserLlmKey: hasUserLlmKeyFromKeys(userOnlyKeys, poolKeys),
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
export async function coalesceAgentPreferences(
  supabase: SupabaseClient,
  userId: string,
  userOnlyKeys: Record<string, string>,
  preferences?: AgentPreferencesPayload,
): Promise<AgentPreferencesPayload> {
  if (preferences?.mode) return preferences;

  const nvidiaPool = await loadConnectorPools(supabase, userId, "nvidia");
  if (nvidiaPool.length > 0) {
    return {
      mode: "robin",
      poolProvider: "nvidia",
      robinPoolModelId: "nvidia--nemotron-3-ultra-550b",
    };
  }

  const groqPool = await loadConnectorPools(supabase, userId, "groq");
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
  const preferences = await coalesceAgentPreferences(
    supabase,
    userId,
    userOnlyKeys,
    input.preferences,
  );
  const userWantsRobin = isRobinMode(preferences);
  const poolProvider = preferences?.poolProvider ?? "groq";

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
    const poolKeys = await loadConnectorPools(supabase, userId, poolProvider);
    const robinPool = new RobinKeyPool(poolKeys);
    const wire = defaultRobinModel(poolProvider, preferences?.robinPoolModelId);
    const mainCfg = robinProviderConfig(poolProvider, poolKeys, preferences?.robinPoolModelId);
    const envKeyName = wire.secretKey || `${poolProvider.toUpperCase()}_API_KEY`;
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
          : "Modo Auto: cadastre pelo menos uma chave LLM em /api.",
      );
    }
    mainCfg = {
      provider: autoWire.provider,
      apiKey: autoWire.apiKey,
      model: autoWire.model,
      baseUrl: autoWire.baseUrl,
      label: `${autoWire.label} (Auto)`,
      supportsVision: detectVisionSupport(autoWire.provider, autoWire.model),
    };
  } else if (preferences?.mode === "fixed") {
    const resolved = resolveModelFromPreferences(preferences, userOnlyKeys);
    if (!resolved) {
      throw new Error(
        "Chave ausente para o modelo fixo. Adicione a API Key do provedor em /api.",
      );
    }
    mainCfg = {
      provider: resolved.provider,
      apiKey: resolved.apiKey,
      model: resolved.model,
      baseUrl: resolved.baseUrl,
      label: `${resolved.label} (fixo)`,
      supportsVision: detectVisionSupport(resolved.provider, resolved.model),
    };
  } else {
    throw new Error("Modo de modelo inválido. Configure Auto ou Fixo em /models.");
  }

  return {
    mainCfg,
    connectorKeys,
    robinPool: null,
    effectiveRobin: false,
    tasteStart: false,
  };
}
