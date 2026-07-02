// providers.ts — FAIL-CLOSED: sem cascade heuristic.
// O agente BYOK deve passar resolvedCfg via resolveAgentProvider (run-setup.ts).
// Retry/backoff 429/529: ver llm-retry.ts + ResilientLLM em robin-pool.ts (C16).
import { createLLMProvider } from "./adapters/llm.ts";
import type { LLMProvider } from "./types.ts";
import { logger } from "../_shared/logger.ts";

export interface ProviderConfig {
  provider: string;
  apiKey: string;
  model: string;
  baseUrl?: string;
  label: string;
  /** Se true, o modelo suporta imagens (vision/multimodal). */
  supportsVision?: boolean;
}


export function pickMain(_injected?: Record<string, string>): ProviderConfig {
  // FAIL-CLOSED: sem override explícito, lança erro.
  // O agente BYOK deve passar resolvedCfg via resolveAgentProvider.
  // A cascade heuristic foi removida — a plataforma não escolhe provider pelo usuário.
  const ex = Deno.env.get("LLM_PROVIDER");
  if (ex && Deno.env.get("LLM_API_KEY")) {
    return {
      provider: ex,
      apiKey: Deno.env.get("LLM_API_KEY")!,
      model: Deno.env.get("LLM_MODEL") || "claude-sonnet-4-20250514",
      baseUrl: Deno.env.get("LLM_BASE_URL") || undefined,
      label: `${ex} (override)`,
    };
  }
  throw new Error(
    "Nenhum modelo configurado. Configure o modo e modelo em Api & Models (/api-models). " +
    "O sistema não seleciona provedor automaticamente.",
  );
}

/**
 * @deprecated pickCheap foi removido. O BYOK não faz cascade de provider.
 * Use resolveAutoForComplexity do model-presets.ts para routing por complexidade.
 */
export function pickCheap(_main: ProviderConfig, _injected?: Record<string, string>): ProviderConfig {
  throw new Error(
    "pickCheap foi desativado. Configure modelos em /api-models. " +
    "O sistema não faz fallback automático de provider.",
  );
}

export function buildProvider(cfg: ProviderConfig): LLMProvider {
  logger.debug("agent.build_provider", {
    provider: cfg.provider,
    model: cfg.model,
    baseUrl: cfg.baseUrl,
    label: cfg.label,
    supportsVision: cfg.supportsVision ?? detectVisionSupport(cfg.provider, cfg.model),
  });
  try {
    return createLLMProvider({
      provider: cfg.provider,
      apiKey: cfg.apiKey,
      model: cfg.model,
      baseUrl: cfg.baseUrl,
    });
  } catch (e) {
    logger.error("agent.build_provider_failed", {
      provider: cfg.provider,
      model: cfg.model,
      errorMessage: (e as Error)?.message,
    });
    throw e;
  }
}

/**
 * Detecta se um modelo suporta vision/multimodal baseado no nome.
 * Modelos conhecidos: Claude 3.5+, GPT-4o, Gemini, Qwen-VL, Kimi, LLaVA.
 */
export function detectVisionSupport(provider: string, model: string): boolean {
  const m = model.toLowerCase();
  const p = provider.toLowerCase();

  // Claude 3.5+ (Sonnet, Opus) — todos multimodal
  if (p === "anthropic" && /claude.*3|claude.*4|claude.*sonnet|claude.*opus/.test(m)) return true;

  // GPT-4o, GPT-4 Vision, GPT-4o-mini
  if (p === "openai" && /gpt-4o|gpt-4-vision|gpt-4-turbo/.test(m)) return true;

  // Gemini (todos os modelos Gemini suportam vision)
  if (p === "gemini" && /gemini/.test(m)) return true;

  // Qwen-VL, Qwen2-VL
  if (/qwen.*vl|qwen.*vision/.test(m)) return true;

  // Kimi (Moonshot / NVIDIA NIM) — multimodal
  if ((p === "moonshotai" || p === "openai") && /kimi/.test(m)) return true;

  // LLaVA, BakLLaVA (Ollama)
  if (/llava|bakllava|moondream/.test(m)) return true;

  return false;
}

export { MAX_LLM_RETRIES, llmBackoffMs } from "./llm-retry.ts";
