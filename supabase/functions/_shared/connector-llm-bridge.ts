/**
 * connector-llm-bridge.ts — Bridge /api connectors → llm-router (FORGE)
 * Wraps agent-run loadConnectorKeys without modifying agent-run.
 *
 * Prometheus motor passes tenant_id = userId; agent runtime uses flowId in tenant_secrets.
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { loadConnectorKeys } from "../agent-run/connector-keys.ts";

/** /api stores Gemini as GEMINI_API_KEY; llm-router expects GOOGLE_AI_API_KEY for google/* */
const SECRET_ALIASES: Record<string, string[]> = {
  GOOGLE_AI_API_KEY: ["GEMINI_API_KEY"],
};

function pickConnectorKey(keys: Record<string, string>, secretName: string): string | null {
  if (keys[secretName]) return keys[secretName];

  for (const alias of SECRET_ALIASES[secretName] ?? []) {
    if (keys[alias]) return keys[alias];
  }

  // /api stores one NVIDIA pool key; llm-router may request per-model secret names
  if (secretName.startsWith("NVIDIA_") && keys.NVIDIA_API_KEY) {
    return keys.NVIDIA_API_KEY;
  }

  return null;
}

/** Resolve API key from connectors table (owner_id = userId from /api). */
export async function resolveConnectorApiKey(
  ownerId: string,
  secretName: string,
): Promise<string | null> {
  if (!ownerId?.trim()) return null;

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const keys = await loadConnectorKeys(supabase as never, ownerId);
    return pickConnectorKey(keys, secretName);
  } catch (err) {
    console.warn(`[connector-llm-bridge] Failed for ${secretName} owner=${ownerId}:`, err);
    return null;
  }
}
