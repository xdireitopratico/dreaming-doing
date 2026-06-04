export type SupabaseEnvStatus = {
  url: string | undefined;
  publishableKey: string | undefined;
  isConfigured: boolean;
  missing: string[];
};

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

  return {
    url,
    publishableKey,
    isConfigured: missing.length === 0,
    missing,
  };
}