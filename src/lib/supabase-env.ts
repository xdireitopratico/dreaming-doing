export type SupabaseEnvStatus = {
  url: string | undefined;
  publishableKey: string | undefined;
  isConfigured: boolean;
  missing: string[];
};

import { FORGE_SUPABASE_PROJECT_REF } from "@/lib/forge-supabase";

export function getSupabaseEnv(): SupabaseEnvStatus {
  const url =
    import.meta.env.VITE_SUPABASE_URL ||
    (typeof process !== "undefined" ? process.env.SUPABASE_URL : undefined);
  const publishableKey =
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    (typeof process !== "undefined" ? process.env.SUPABASE_PUBLISHABLE_KEY : undefined);

  const missing: string[] = [];
  if (!url) missing.push("VITE_SUPABASE_URL");
  if (!publishableKey) missing.push("VITE_SUPABASE_PUBLISHABLE_KEY");

  if (url && !url.includes(FORGE_SUPABASE_PROJECT_REF)) {
    console.warn(
      `[FORGE] Supabase aponta para outro projeto. Use exclusivamente ${FORGE_SUPABASE_PROJECT_REF}. URL atual: ${url}`,
    );
  }

  return {
    url,
    publishableKey,
    isConfigured: missing.length === 0,
    missing,
  };
}
