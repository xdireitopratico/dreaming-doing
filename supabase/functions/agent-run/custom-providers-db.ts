/**
 * Metadados custom_providers → base URLs no runtime (connectors guardam só a chave).
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  customProviderBaseUrlKey,
  customProviderSecretKey,
} from "../_shared/provider-wire.ts";

export async function enrichConnectorKeysWithCustomProviders(
  supabase: SupabaseClient,
  userId: string,
  keys: Record<string, string>,
): Promise<Record<string, string>> {
  const { data, error } = await supabase
    .from("custom_providers")
    .select("provider_id, base_url")
    .eq("owner_id", userId);

  if (error) {
    throw new Error(`Falha ao carregar custom_providers: ${error.message}`);
  }

  const out = { ...keys };
  for (const row of data ?? []) {
    const base = typeof row.base_url === "string" ? row.base_url.trim().replace(/\/$/, "") : "";
    if (!base) continue;
    const providerId = `custom-${row.provider_id}`;
    const secretKey = customProviderSecretKey(providerId);
    if (!out[secretKey]) continue;
    const baseUrlKey = customProviderBaseUrlKey(secretKey);
    if (!out[baseUrlKey]) out[baseUrlKey] = base;
  }
  return out;
}