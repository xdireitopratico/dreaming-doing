import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { decryptSecret } from "./crypto.ts";

function keyHint(value: string): string {
  const t = value.trim();
  if (t.length <= 4) return "••••";
  return `…${t.slice(-4)}`;
}

/** Valor efetivo: banco (admin UI) → fallback Supabase Edge secret (env). */
export async function getPlatformSecret(admin: SupabaseClient, name: string): Promise<string> {
  const { data } = await admin
    .from("platform_secrets")
    .select("value_encrypted")
    .eq("name", name)
    .maybeSingle();

  const fromDb = data?.value_encrypted?.trim();
  if (fromDb) return await decryptSecret(fromDb);
  return Deno.env.get(name)?.trim() ?? "";
}

export async function loadPlatformSecretsMap(
  admin: SupabaseClient,
  names: string[],
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  await Promise.all(
    names.map(async (name) => {
      const v = await getPlatformSecret(admin, name);
      if (v) out[name] = v;
    }),
  );
  return out;
}

export function buildSecretHint(value: string): string {
  return keyHint(value);
}
