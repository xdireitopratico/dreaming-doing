import { getSupabaseEnv } from "@/lib/supabase-env";
import { FORGE_SUPABASE_PROJECT_REF } from "@/lib/forge-supabase";

export function SupabaseConfigBanner() {
  const { isConfigured, missing, url } = getSupabaseEnv();

  if (!isConfigured) {
    return (
      <div
        role="alert"
        className="relative z-[100] border-b border-amber-500/40 bg-amber-950/90 px-4 py-2 text-center text-sm text-amber-100"
      >
        Supabase não configurado neste deploy. Defina{" "}
        <code className="font-mono text-xs">{missing.join(", ")}</code> no painel Vercel ou Lovable
        Cloud.
      </div>
    );
  }

  if (url && !url.includes(FORGE_SUPABASE_PROJECT_REF)) {
    const activeRef = url.replace("https://", "").split(".")[0];
    return (
      <div
        role="alert"
        className="relative z-[100] border-b border-orange-500/40 bg-orange-950/90 px-4 py-2 text-center text-xs text-orange-100"
      >
        ⚠ Supabase ativo: <code className="font-mono">{activeRef}</code>. Canônico FORGE é{" "}
        <code className="font-mono">{FORGE_SUPABASE_PROJECT_REF}</code>. Rode{" "}
        <code className="font-mono">scripts/sync/migrate.sh</code> para alinhar.
      </div>
    );
  }

  return null;
}
