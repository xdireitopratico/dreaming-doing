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

const ANTHROPIC = Deno.env.get("ANTHROPIC_API_KEY") || "";
const XAI = Deno.env.get("XAI_API_KEY") || "";
const GROQ = Deno.env.get("GROQ_API_KEY") || "";
const LOVABLE = Deno.env.get("LOVABLE_API_KEY") || "";
const OPENAI = Deno.env.get("OPENAI_API_KEY") || "";

const LOVABLE_GATEWAY = "https://ai.gateway.lovable.dev/v1";

export function pickMain(): ProviderConfig {
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
  if (LOVABLE) return { provider: "openai", apiKey: LOVABLE, model: "google/gemini-2.5-flash", baseUrl: LOVABLE_GATEWAY, label: "Lovable AI · Gemini 2.5 Flash" };
  if (OPENAI) return { provider: "openai", apiKey: OPENAI, model: "gpt-4o", label: "OpenAI GPT-4o" };
  throw new Error("Nenhum provider LLM configurado (ANTHROPIC/XAI/GROQ/LOVABLE/OPENAI _API_KEY).");
}

export function pickCheap(main: ProviderConfig): ProviderConfig {
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
