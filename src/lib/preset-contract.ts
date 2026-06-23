/**
 * Contrato de preset IDs — SSOT para UI e agent_preferences.
 *
 * Preset ID = openRouterSlug com `/` → `--` e `.` → `-`
 * (ex.: `anthropic/claude-opus-4-8` → `anthropic--claude-opus-4-8`).
 *
 * API `model` pode diferir do slug — ver apiModelForEnv em model-catalog.ts
 * e PRESETS em supabase/functions/_shared/model-presets.ts (devem ficar em sync).
 */

export const PLATFORM_ROBIN_TASTE_PRESET_ID = "pool-nemotron-ultra-550b";

/** Converte slug estilo OpenRouter em preset ID canônico. */
export function slugToPresetId(slug: string): string {
  return slug.trim().replace(/\//g, "--").replace(/\./g, "-");
}

/**
 * Aliases legados + slugs API salvos por engano como preset ID.
 * Sync obrigatório com supabase/functions/_shared/preset-contract.ts
 */
export const LEGACY_PRESET_ALIASES: Record<string, string> = {
  "or-anthropic--claude-sonnet-4-6": "anthropic--claude-sonnet-4-6",
  "anthropic-sonnet": "anthropic--claude-sonnet-4-6",
  "anthropic-opus": "anthropic--claude-opus-4-8",
  "xai-grok3": "xai--grok-4-3",
  "groq-llama70": "pool-groq-flash",
  "pool-groq-flash": "pool-groq-flash",
  "nvidia-llama70": PLATFORM_ROBIN_TASTE_PRESET_ID,
  "pool-nemotron-super": "nvidia--nemotron-3-super-120b",
  /** Slug API NVIDIA salvo como robinPoolModelId (onboarding antigo). */
  "nvidia/nemotron-3-ultra-550b-a55b": PLATFORM_ROBIN_TASTE_PRESET_ID,
  "nvidia/nemotron-3-ultra-550b": "nvidia--nemotron-3-ultra-550b",
  "nvidia/nemotron-3-super-120b-a12b": "nvidia--nemotron-3-super-120b",
  "nvidia/nemotron-3-super-120b": "nvidia--nemotron-3-super-120b",
  /** Env errado + slug API (scripts/diagnose legado). */
  "nvidia/qwen3.5-397b-a17b": "qwen--qwen3-5-397b-a17b",
  "nvidia/qwen3-5-397b-a17b": "qwen--qwen3-5-397b-a17b",
};

/** Normaliza qualquer valor salvo em agent_preferences para preset ID canônico. */
export function normalizePresetId(raw?: string): string {
  const id = raw?.trim() ?? "";
  if (!id) return "";

  const direct = LEGACY_PRESET_ALIASES[id];
  if (direct) return direct;

  if (id.includes("/")) {
    const fromSlug = slugToPresetId(id);
    return LEGACY_PRESET_ALIASES[fromSlug] ?? fromSlug;
  }

  return id;
}