import { supabase } from "@/integrations/supabase/client";
import {
  addCustomProvider,
  removeCustomProvider,
  removeCustomProviderFromDb,
  saveCustomProviderToDb,
  type AiProviderId,
  type CustomProviderId,
} from "@/lib/ai-provider-registry";
import { saveAgentPreferencesToDb, type AgentPreferences } from "@/lib/agent-preferences";
import {
  appendKeyToPool,
  disconnectAiProvider,
  removeKeyFromPool,
  saveAiProviderKey,
} from "@/lib/save-connector";
import { disconnectE2bApiKey, saveE2bApiKey } from "@/lib/save-e2b-key";
import {
  disconnectOllamaConnector,
  saveOllamaConnector,
} from "@/lib/save-ollama-connector";
import {
  disconnectWebSearch,
  saveWebSearchKey,
  type WebSearchProviderId,
} from "@/lib/save-web-search-key";
import { connectorBaseUrlForSave } from "./provider-list";

export async function patchPreferences(partial: Partial<AgentPreferences>): Promise<AgentPreferences> {
  const { loadAgentPreferencesFromDb } = await import("@/lib/agent-preferences");
  const current = await loadAgentPreferencesFromDb();
  const next = { ...current, ...partial };
  await saveAgentPreferencesToDb(next);
  return next;
}

export async function registerCustomProvider(input: {
  label: string;
  baseUrl: string;
  keyPrefix?: string;
  ownerId: string;
}) {
  const provider = addCustomProvider({
    label: input.label,
    baseUrl: input.baseUrl,
    keyPrefix: input.keyPrefix,
  });
  await saveCustomProviderToDb(
    supabase,
    {
      provider_id: provider.id.replace(/^custom-/, ""),
      label: provider.label,
      base_url: provider.baseUrl,
    },
    input.ownerId,
  );
  return provider;
}

export async function saveProviderKey(
  id: AiProviderId,
  token: string,
  opts: { appendPool?: boolean; baseUrl?: string },
) {
  const baseUrl = opts.baseUrl;
  if (opts.appendPool) return appendKeyToPool(id, token, baseUrl);
  return saveAiProviderKey(id, token, baseUrl);
}

export async function removeProviderPoolKey(
  id: AiProviderId,
  keyId: string,
  baseUrl?: string,
) {
  return removeKeyFromPool(id, keyId, baseUrl);
}

export async function disconnectProvider(id: AiProviderId, baseUrl?: string) {
  await disconnectAiProvider(id, baseUrl);
  if (id.startsWith("custom-")) {
    removeCustomProvider(id as CustomProviderId);
    await removeCustomProviderFromDb(supabase, id.replace(/^custom-/, ""));
  }
}

export function resolveSaveBaseUrl(
  id: AiProviderId,
  uiBaseUrl: string,
  registryBaseUrl?: string,
): string | undefined {
  return connectorBaseUrlForSave(id, uiBaseUrl, registryBaseUrl);
}

export { saveE2bApiKey, disconnectE2bApiKey, saveOllamaConnector, disconnectOllamaConnector };
export { saveWebSearchKey, disconnectWebSearch, type WebSearchProviderId };