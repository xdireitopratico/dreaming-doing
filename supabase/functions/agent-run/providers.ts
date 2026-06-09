// providers.ts — Auto-detecta provider de LLM a partir das secrets disponíveis.
// Retry/backoff 429/529: ver llm-retry.ts + ResilientLLM em robin-pool.ts (C16).
// Ordem de preferência: explicit override → Anthropic → xAI → Groq → Lovable AI Gateway → OpenAI.
// Cheap: Groq → Lovable AI (flash-lite) → main.
import { createLLMProvider } from "./adapters/llm.ts";
import type { LLMProvider } from "./types.ts";

export interface ProviderConfig {
  provider: string;
  apiKey: string;
  model: string;
  baseUrl?: string;
  label: string;
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
  if (ANTHROPIC) return { provider: "anthropic", apiKey: ANTHROPIC, model: "claude-sonnet-4-20250514", label: "Anthropic Claude Sonnet 4" };
  if (GEMINI) return { provider: "gemini", apiKey: GEMINI, model: "gemini-2.5-pro", label: "Gemini 2.5 Pro" };
  if (XAI) return { provider: "openai", apiKey: XAI, model: "grok-3", baseUrl: "https://api.x.ai/v1", label: "xAI Grok 3" };
  if (GROQ) return { provider: "openai", apiKey: GROQ, model: "llama-3.3-70b-versatile", baseUrl: "https://api.groq.com/openai/v1", label: "Groq · Llama 3.3 70B" };
  if (NVIDIA) {
    return {
      provider: "openai",
      apiKey: NVIDIA,
      model: "meta/llama-3.3-70b-instruct",
      baseUrl: "https://integrate.api.nvidia.com/v1",
      label: "NVIDIA NIM · Llama 3.3 70B",
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
  if (LOVABLE) return { provider: "openai", apiKey: LOVABLE, model: "gemini-2.5-flash-preview-04-17", baseUrl: LOVABLE_GATEWAY, label: "Lovable AI · Gemini 2.5 Flash" };
  if (OPENAI) return { provider: "openai", apiKey: OPENAI, model: "gpt-4o", label: "OpenAI GPT-4o" };
  throw new Error(
    "Nenhum modelo de IA configurado. Adicione chaves em /api e preset em /models.",
  );
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
  if (GROQ) return { provider: "openai", apiKey: GROQ, model: "llama-3.3-70b-versatile", baseUrl: "https://api.groq.com/openai/v1", label: "Groq · Llama 3.3 70B" };
  if (LOVABLE) return { provider: "openai", apiKey: LOVABLE, model: "gemini-2.5-flash-preview-04-17", baseUrl: LOVABLE_GATEWAY, label: "Lovable AI · Gemini Flash Lite" };
  return main;
}

export function buildProvider(cfg: ProviderConfig): LLMProvider {
  return createLLMProvider({
    provider: cfg.provider,
    apiKey: cfg.apiKey,
    model: cfg.model,
    baseUrl: cfg.baseUrl,
  });
}

export { MAX_LLM_RETRIES, llmBackoffMs } from "./llm-retry.ts";
