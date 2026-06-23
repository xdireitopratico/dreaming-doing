// providers.ts — Auto-detecta provider de LLM a partir das secrets disponíveis.
// Retry/backoff 429/529: ver llm-retry.ts + ResilientLLM em robin-pool.ts (C16).
// Ordem de preferência: explicit override → Anthropic → xAI → Groq → Lovable AI Gateway → OpenAI.
// Cheap: Groq → Lovable AI (flash-lite) → main.
import { createLLMProvider } from "./adapters/llm.ts";
import type { LLMProvider } from "./types.ts";
import { logger } from "../_shared/logger.ts";
import { defaultRobinModel, PLATFORM_ROBIN_TASTE_PRESET_ID } from "../_shared/model-presets.ts";
import { normalizeNimBaseUrl, normalizeNvidiaApiModel } from "../_shared/nvidia-model.ts";

export interface ProviderConfig {
  provider: string;
  apiKey: string;
  model: string;
  baseUrl?: string;
  label: string;
  /** Se true, o modelo suporta imagens (vision/multimodal). */
  supportsVision?: boolean;
}

const LOVABLE_GATEWAY = "https://ai.gateway.lovable.dev/v1";

function envKey(name: string, injected?: Record<string, string>): string {
  return injected?.[name] || Deno.env.get(name) || "";
}

export function pickMain(injected?: Record<string, string>): ProviderConfig {
  const ANTHROPIC = envKey("ANTHROPIC_API_KEY", injected);
  const XAI = envKey("XAI_API_KEY", injected);
  const GROQ = envKey("GROQ_API_KEY", injected);
  const LOVABLE = envKey("LOVABLE_API_KEY", injected);
  const OPENAI = envKey("OPENAI_API_KEY", injected);
  // explicit override
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
  const NVIDIA = envKey("NVIDIA_API_KEY", injected);
  const GEMINI = envKey("GEMINI_API_KEY", injected);
  const DEEPSEEK = envKey("DEEPSEEK_API_KEY", injected);
  const DASHSCOPE = envKey("DASHSCOPE_API_KEY", injected);
  const OPENROUTER = envKey("OPENROUTER_API_KEY", injected);
  const MINIMAX = envKey("MINIMAX_API_KEY", injected);
  const MOONSHOT = envKey("MOONSHOT_API_KEY", injected);
  const MIMO = envKey("MIMO_API_KEY", injected);
  if (ANTHROPIC)
    return {
      provider: "anthropic",
      apiKey: ANTHROPIC,
      model: "claude-sonnet-4-20250514",
      label: "Anthropic Claude Sonnet 4",
    };
  if (GEMINI)
    return { provider: "gemini", apiKey: GEMINI, model: "gemini-2.5-pro", label: "Gemini 2.5 Pro" };
  if (XAI)
    return {
      provider: "openai",
      apiKey: XAI,
      model: "grok-3",
      baseUrl: "https://api.x.ai/v1",
      label: "xAI Grok 3",
    };
  if (GROQ)
    return {
      provider: "openai",
      apiKey: GROQ,
      model: "llama-3.3-70b-versatile",
      baseUrl: "https://api.groq.com/openai/v1",
      label: "Groq · Llama 3.3 70B",
    };
  if (NVIDIA) {
    const wire = defaultRobinModel("nvidia", PLATFORM_ROBIN_TASTE_PRESET_ID);
    return {
      provider: wire.provider,
      apiKey: NVIDIA,
      model: normalizeNvidiaApiModel(wire.model),
      baseUrl: normalizeNimBaseUrl(wire.baseUrl) ?? wire.baseUrl,
      label: wire.label,
    };
  }
  if (MINIMAX) {
    return {
      provider: "openai",
      apiKey: MINIMAX,
      model: "MiniMax-M3",
      baseUrl: "https://api.minimax.io/v1",
      label: "MiniMax M3",
    };
  }
  if (MOONSHOT) {
    return {
      provider: "openai",
      apiKey: MOONSHOT,
      model: "kimi-k2.6",
      baseUrl: "https://api.moonshot.ai/v1",
      label: "Kimi K2.6",
    };
  }
  if (MIMO) {
    return {
      provider: "openai",
      apiKey: MIMO,
      model: "mimo-v2.5-pro",
      baseUrl: "https://api.xiaomimimo.com/v1",
      label: "Xiaomi MiMo V2.5 Pro",
    };
  }
  if (DEEPSEEK) {
    return {
      provider: "openai",
      apiKey: DEEPSEEK,
      model: "deepseek-chat",
      baseUrl: "https://api.deepseek.com",
      label: "DeepSeek",
    };
  }
  if (DASHSCOPE) {
    return {
      provider: "openai",
      apiKey: DASHSCOPE,
      model: "qwen-max",
      baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
      label: "Alibaba Qwen",
    };
  }
  if (OPENROUTER) {
    return {
      provider: "openrouter",
      apiKey: OPENROUTER,
      model: "anthropic/claude-sonnet-4-6",
      baseUrl: "https://openrouter.ai/api/v1",
      label: "OpenRouter",
    };
  }
  if (LOVABLE)
    return {
      provider: "openai",
      apiKey: LOVABLE,
      model: "gemini-2.5-flash-preview-04-17",
      baseUrl: LOVABLE_GATEWAY,
      label: "Lovable AI · Gemini 2.5 Flash",
    };
  if (OPENAI)
    return { provider: "openai", apiKey: OPENAI, model: "gpt-4o", label: "OpenAI GPT-4o" };
  throw new Error("Nenhum modelo de IA configurado. Adicione chaves em /api e preset em /models.");
}

export function pickCheap(main: ProviderConfig, injected?: Record<string, string>): ProviderConfig {
  const GROQ = envKey("GROQ_API_KEY", injected);
  const LOVABLE = envKey("LOVABLE_API_KEY", injected);
  const exP = Deno.env.get("LLM_CHEAP_PROVIDER");
  const exK = Deno.env.get("LLM_CHEAP_API_KEY");
  if (exP && exK) {
    return {
      provider: exP,
      apiKey: exK,
      model: Deno.env.get("LLM_CHEAP_MODEL") || "llama-3.3-70b-versatile",
      baseUrl: Deno.env.get("LLM_CHEAP_BASE_URL") || undefined,
      label: `${exP} (cheap override)`,
    };
  }
  if (GROQ)
    return {
      provider: "openai",
      apiKey: GROQ,
      model: "llama-3.3-70b-versatile",
      baseUrl: "https://api.groq.com/openai/v1",
      label: "Groq · Llama 3.3 70B",
    };
  if (LOVABLE)
    return {
      provider: "openai",
      apiKey: LOVABLE,
      model: "gemini-2.5-flash-preview-04-17",
      baseUrl: LOVABLE_GATEWAY,
      label: "Lovable AI · Gemini Flash Lite",
    };
  return main;
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

  // Kimi (Moonshot) — multimodal
  if (p === "moonshotai" && /kimi/.test(m)) return true;

  // LLaVA, BakLLaVA (Ollama)
  if (/llava|bakllava|moondream/.test(m)) return true;

  return false;
}

export { MAX_LLM_RETRIES, llmBackoffMs } from "./llm-retry.ts";
