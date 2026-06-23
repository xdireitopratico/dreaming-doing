/** Slugs oficiais NVIDIA NIM — sync com src/lib/editor-readiness.ts */

const NEMOTRON_ULTRA_SLUG = "nvidia/nemotron-3-ultra-550b-a55b";
const NEMOTRON_SUPER_SLUG = "nvidia/nemotron-3-super-120b-a12b";

/** Garante sufixos -a55b / -a12b exigidos pela API integrate. */
export function normalizeNvidiaApiModel(slug: string): string {
  const s = slug.trim();
  if (!s) return s;

  const bare = s.includes("/") ? s.slice(s.indexOf("/") + 1) : s;
  if (bare.includes("nemotron-3-ultra-550b") && !bare.includes("-a55b")) {
    return NEMOTRON_ULTRA_SLUG;
  }
  if (bare.includes("nemotron-3-super-120b") && !bare.includes("-a12b")) {
    return NEMOTRON_SUPER_SLUG;
  }
  return s.includes("/") ? s : `nvidia/${bare}`;
}

/** Base URL OpenAI-compatible para NIM (sem /chat/completions duplicado). */
export function normalizeNimBaseUrl(baseUrl?: string): string | undefined {
  if (!baseUrl?.trim()) return undefined;

  let u = baseUrl.trim().replace(/\/+$/, "");
  u = u.replace(/\/chat\/completions$/i, "");
  if (!u.endsWith("/v1")) {
    if (u.endsWith("/v1/")) u = u.slice(0, -1);
    else if (!u.includes("/v1")) u = `${u}/v1`;
  }
  return u;
}

export function isNvidiaNimModel(model: string): boolean {
  const m = model.toLowerCase();
  return m.startsWith("nvidia/") || m.startsWith("qwen/");
}