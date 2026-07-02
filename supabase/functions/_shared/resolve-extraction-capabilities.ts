/**
 * resolveExtractionCapabilities — Gate G1 (Etapa 1)
 *
 * Fail closed: SHALLOW exige LLM + web scrape provider; DEEP exige LLM vision + E2B.
 * Mensagens apontam para API Models (/api-models) → Tools.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  loadConnectorKeys,
  loadConnectorPools,
  type AgentPreferencesPayload,
} from "../agent-run/connector-keys.ts";
import { detectVisionSupport } from "../agent-run/providers.ts";
import {
  defaultRobinModel,
  resolveAutoForComplexity,
  resolveModelFromPreferences,
} from "./model-presets.ts";
import { modelIdSupportsVision } from "./message-parts.ts";
import { loadUserE2bApiKey } from "./user-e2b.ts";

export type ExtractionDepth = "shallow" | "deep";

export type CapabilityFailureCode =
  | "missing_llm"
  | "missing_vision"
  | "missing_e2b"
  | "missing_web_scrape_provider"
  | "missing_web_scrape_token";

export type ResolvedExtractionLlm = {
  model: string;
  label: string;
  provider: string;
  supportsVision: boolean;
};

export type ExtractionCapabilitiesOk = {
  ok: true;
  depth: ExtractionDepth;
  llm: ResolvedExtractionLlm;
  webScrapeProvider?: string;
  e2bConfigured?: boolean;
};

export type ExtractionCapabilitiesFail = {
  ok: false;
  code: CapabilityFailureCode;
  message: string;
  missing: string[];
};

export type ExtractionCapabilitiesResult = ExtractionCapabilitiesOk | ExtractionCapabilitiesFail;

export const API_MODELS_PATH = "/api-models";

const WEB_SCRAPE_SPECS: Record<string, { label: string; needsToken: boolean }> = {
  jina: { label: "Jina Reader", needsToken: false },
  firecrawl: { label: "Firecrawl", needsToken: true },
  browserless: { label: "Browserless", needsToken: true },
  crawl4ai: { label: "Crawl4AI", needsToken: true },
  scrapegraphai: { label: "ScrapeGraphAI", needsToken: true },
};

export type ExtractionCapabilityInputs = {
  depth: ExtractionDepth;
  preferences: AgentPreferencesPayload | null;
  connectorKeys: Record<string, string>;
  e2bApiKey: string | null;
  webScrapeConnectorToken: string | null;
};

function apiModelsHint(section: string): string {
  return `Configure em API Models (${API_MODELS_PATH}) → ${section}.`;
}

function modelSupportsVision(provider: string, model: string): boolean {
  return detectVisionSupport(provider, model) || modelIdSupportsVision(model);
}

function resolveLlmFromPreferences(
  preferences: AgentPreferencesPayload | null,
  connectorKeys: Record<string, string>,
  complexity: number,
): ResolvedExtractionLlm | null {
  if (!preferences || typeof preferences !== "object") return null;

  const mode = preferences.mode === "rob" ? "robin" : preferences.mode;

  if (mode === "fixed") {
    const wire = resolveModelFromPreferences(
      {
        fixedPresetId: preferences.fixedPresetId,
        customModelId: preferences.customModelId,
        useCustomModel: preferences.useCustomModel,
        userModelEntries: preferences.userModelEntries,
      },
      connectorKeys,
    );
    if (!wire) return null;
    return {
      model: wire.model,
      label: wire.label,
      provider: wire.provider,
      supportsVision: modelSupportsVision(wire.provider, wire.model),
    };
  }

  if (mode === "robin") {
    const poolProvider = preferences.poolProvider?.trim();
    if (!poolProvider) return null;
    const wire = defaultRobinModel(
      poolProvider,
      preferences.robinPoolModelId,
      preferences.userModelEntries,
    );
    const secretKey = wire.secretKey;
    const apiKey = connectorKeys[secretKey];
    if (!apiKey) return null;
    return {
      model: wire.model,
      label: wire.label,
      provider: wire.provider,
      supportsVision: modelSupportsVision(wire.provider, wire.model),
    };
  }

  if (mode === "auto") {
    const allowlist = (preferences.autoAllowedPresetIds ?? []).filter(
      (id) => typeof id === "string" && id.trim().length > 0,
    );
    if (allowlist.length === 0) return null;
    const wire = resolveAutoForComplexity(
      connectorKeys,
      complexity,
      allowlist,
      preferences.userModelEntries,
    );
    if (!wire) return null;
    return {
      model: wire.model,
      label: wire.label,
      provider: wire.provider,
      supportsVision: modelSupportsVision(wire.provider, wire.model),
    };
  }

  return null;
}

/** Avaliação pura — usada em testes e após carregar dados do Supabase. */
export function evaluateExtractionCapabilities(
  input: ExtractionCapabilityInputs,
): ExtractionCapabilitiesResult {
  const missing: string[] = [];
  const complexity = input.depth === "deep" ? 5 : 3;

  const llm = resolveLlmFromPreferences(input.preferences, input.connectorKeys, complexity);
  if (!llm) {
    missing.push("llm");
    return {
      ok: false,
      code: "missing_llm",
      message:
        `Nenhum modelo LLM configurado. ${apiModelsHint("Modelos")} ` +
        "Escolha modo Fixo, ROBIN ou Auto com pelo menos um conector ativo.",
      missing,
    };
  }

  if (input.depth === "shallow") {
    const scrapeProvider = input.preferences?.webScrapeProvider?.trim();
    if (!scrapeProvider) {
      missing.push("web_scrape_provider");
      return {
        ok: false,
        code: "missing_web_scrape_provider",
        message:
          `Nenhum provedor de scrape configurado. ${apiModelsHint("Tools → Web Scrape")} ` +
          "SHALLOW precisa de um provedor para ler a página.",
        missing,
      };
    }

    const spec = WEB_SCRAPE_SPECS[scrapeProvider];
    if (!spec) {
      missing.push("web_scrape_provider");
      return {
        ok: false,
        code: "missing_web_scrape_provider",
        message:
          `Provedor de scrape "${scrapeProvider}" não é suportado. ${apiModelsHint("Tools → Web Scrape")}`,
        missing,
      };
    }

    if (spec.needsToken && !input.webScrapeConnectorToken) {
      missing.push("web_scrape_token");
      return {
        ok: false,
        code: "missing_web_scrape_token",
        message:
          `Conector ${spec.label} sem API key. ${apiModelsHint("Tools → Web Scrape")} ` +
          `Conecte o provedor "${scrapeProvider}" antes de extrair.`,
        missing,
      };
    }

    return {
      ok: true,
      depth: "shallow",
      llm,
      webScrapeProvider: scrapeProvider,
    };
  }

  // DEEP
  if (!llm.supportsVision) {
    missing.push("llm_vision");
    return {
      ok: false,
      code: "missing_vision",
      message:
        `O modelo "${llm.label}" (${llm.model}) não suporta visão. ` +
        `${apiModelsHint("Modelos")} DEEP exige um modelo com vision (ex.: GPT-4o, Claude Sonnet, Gemini).`,
      missing,
    };
  }

  if (!input.e2bApiKey) {
    missing.push("e2b");
    return {
      ok: false,
      code: "missing_e2b",
      message:
        `Sandbox E2B não configurado. ${apiModelsHint("Tools → E2B")} ` +
        "DEEP usa browser nosso — sem chave E2B o preview e o agente não rodam.",
      missing,
    };
  }

  return {
    ok: true,
    depth: "deep",
    llm,
    e2bConfigured: true,
  };
}

async function loadAgentPreferences(
  supabase: SupabaseClient,
  userId: string,
): Promise<AgentPreferencesPayload | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("agent_preferences")
    .eq("id", userId)
    .maybeSingle();
  if (error) return null;
  const raw = (data as { agent_preferences?: unknown } | null)?.agent_preferences;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  return raw as AgentPreferencesPayload;
}

async function loadWebScrapeConnectorToken(
  supabase: SupabaseClient,
  userId: string,
  providerId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("connectors")
    .select("token_encrypted")
    .eq("owner_id", userId)
    .eq("kind", "web_scrape")
    .eq("provider", providerId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;

  const raw = (data as { token_encrypted?: string | null }).token_encrypted;
  if (!raw?.trim()) return null;
  const trimmed = raw.trim();
  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (Array.isArray(parsed)) {
        const first = parsed.find((x) => typeof x === "string" && x.trim().length > 0);
        if (typeof first === "string") return first.trim();
      }
    } catch {
      /* single token */
    }
  }
  return trimmed;
}

/**
 * Resolve pré-requisitos de extração Design DNA para o usuário.
 * Fail closed — retorna mensagem acionável se algo faltar.
 */
export async function resolveExtractionCapabilities(
  supabase: SupabaseClient,
  userId: string,
  depth: ExtractionDepth,
): Promise<ExtractionCapabilitiesResult> {
  const preferences = await loadAgentPreferences(supabase, userId);
  const connectorKeys = await loadConnectorKeys(supabase, userId, preferences ?? undefined);

  const mode = preferences?.mode === "rob" ? "robin" : preferences?.mode;
  if (mode === "robin" && preferences?.poolProvider) {
    try {
      const pool = await loadConnectorPools(supabase, userId, preferences.poolProvider);
      if (pool[0]) {
        const keyName = `${preferences.poolProvider.toUpperCase()}_API_KEY`;
        connectorKeys[keyName] = pool[0];
      }
    } catch {
      /* evaluate will fail closed on missing llm */
    }
  }

  const scrapeProvider = preferences?.webScrapeProvider?.trim();
  const webScrapeConnectorToken =
    scrapeProvider && WEB_SCRAPE_SPECS[scrapeProvider]?.needsToken
      ? await loadWebScrapeConnectorToken(supabase, userId, scrapeProvider)
      : scrapeProvider
        ? "free-or-optional"
        : null;

  const e2bApiKey = depth === "deep" ? await loadUserE2bApiKey(supabase, userId) : null;

  return evaluateExtractionCapabilities({
    depth,
    preferences,
    connectorKeys,
    e2bApiKey,
    webScrapeConnectorToken,
  });
}