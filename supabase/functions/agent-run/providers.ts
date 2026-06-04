// providers.ts — Auto-detecta provider de LLM a partir das secrets disponíveis.
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
  if (ANTHROPIC) return { provider: "anthropic", apiKey: ANTHROPIC, model: "claude-sonnet-4-20250514", label: "Anthropic Claude Sonnet 4" };
  if (XAI) return { provider: "openai", apiKey: XAI, model: "grok-2-1212", baseUrl: "https://api.x.ai/v1", label: "xAI Grok 2" };
  if (GROQ) return { provider: "openai", apiKey: GROQ, model: "llama-3.3-70b-versatile", baseUrl: "https://api.groq.com/openai/v1", label: "Groq · Llama 3.3 70B" };
  if (LOVABLE) return { provider: "openai", apiKey: LOVABLE, model: "google/gemini-2.5-flash", baseUrl: LOVABLE_GATEWAY, label: "Lovable AI · Gemini 2.5 Flash" };
  if (OPENAI) return { provider: "openai", apiKey: OPENAI, model: "gpt-4o", label: "OpenAI GPT-4o" };
  throw new Error(
    "Nenhum modelo de IA configurado. Adicione uma chave em Conectores (/connectors) ou defina ANTHROPIC_API_KEY / GROQ_API_KEY nas Secrets do Supabase (Edge Functions).",
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
  if (LOVABLE) return { provider: "openai", apiKey: LOVABLE, model: "google/gemini-2.5-flash-lite", baseUrl: LOVABLE_GATEWAY, label: "Lovable AI · Gemini Flash Lite" };
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
