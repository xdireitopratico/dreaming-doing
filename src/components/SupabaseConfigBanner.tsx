import { getSupabaseEnv } from "@/lib/supabase-env";

export function SupabaseConfigBanner() {
  const { isConfigured, missing } = getSupabaseEnv();
  if (isConfigured) return null;

  return (
    <div
      role="alert"
      className="relative z-[100] border-b border-amber-500/40 bg-amber-950/90 px-4 py-2 text-center text-sm text-amber-100"
    >
      Supabase não configurado neste deploy. Defina{" "}
      <code className="font-mono text-xs">{missing.join(", ")}</code> no painel Vercel ou
      Lovable Cloud.
    </div>
  );
}