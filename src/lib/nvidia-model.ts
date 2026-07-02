/** Sync com supabase/functions/_shared/nvidia-model.ts */

const NEMOTRON_ULTRA_SLUG = "nvidia/nemotron-3-ultra-550b-a55b";
const NEMOTRON_SUPER_SLUG = "nvidia/nemotron-3-super-120b-a12b";

const NIM_MISPREFIX_ALIASES: Record<string, string> = {
  "nvidia/kimi-k2.6": "moonshotai/kimi-k2.6",
  "nvidia/kimi-k2-6": "moonshotai/kimi-k2.6",
};

export function normalizeNvidiaApiModel(slug: string): string {
  const s = slug.trim();
  if (!s) return s;

  const aliased = NIM_MISPREFIX_ALIASES[s];
  if (aliased) return aliased;

  const bare = s.includes("/") ? s.slice(s.indexOf("/") + 1) : s;
  if (bare.includes("nemotron-3-ultra-550b") && !bare.includes("-a55b")) {
    return NEMOTRON_ULTRA_SLUG;
  }
  if (bare.includes("nemotron-3-super-120b") && !bare.includes("-a12b")) {
    return NEMOTRON_SUPER_SLUG;
  }
  if (s.includes("/")) return s;
  if (bare.includes("nemotron") || bare.startsWith("qwen")) {
    return `nvidia/${bare}`;
  }
  return s;
}