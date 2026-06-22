/**
 * Contrato de preset IDs — espelho de src/lib/preset-contract.ts (Deno).
 * Manter LEGACY_PRESET_ALIASES em sync com o frontend.
 */

export const PLATFORM_ROBIN_TASTE_PRESET_ID = "pool-nemotron-ultra-550b";

export function slugToPresetId(slug: string): string {
  return slug.trim().replace(/\//g, "--").replace(/\./g, "-");
}

export const LEGACY_PRESET_ALIASES: Record<string, string> = {
  "or-anthropic--claude-sonnet-4-6": "anthropic--claude-sonnet-4-6",
  "anthropic-sonnet": "anthropic--claude-sonnet-4-6",
  "anthropic-opus": "anthropic--claude-opus-4-8",
  "xai-grok3": "xai--grok-4-3",
  "groq-llama70": "pool-groq-flash",
  "pool-groq-flash": "pool-groq-flash",
  "nvidia-llama70": PLATFORM_ROBIN_TASTE_PRESET_ID,
  "pool-nemotron-super": PLATFORM_ROBIN_TASTE_PRESET_ID,
  "nvidia/nemotron-3-ultra-550b-a55b": PLATFORM_ROBIN_TASTE_PRESET_ID,
  "nvidia/nemotron-3-ultra-550b": "nvidia--nemotron-3-ultra-550b",
  "nvidia/qwen3.5-397b-a17b": "qwen--qwen3-5-397b-a17b",
  "nvidia/qwen3-5-397b-a17b": "qwen--qwen3-5-397b-a17b",
};

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