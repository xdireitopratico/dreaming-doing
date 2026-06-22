import { supabase } from "@/integrations/supabase/client";
import {
  toConnectorPayload as registryToConnectorPayload,
  type AiProviderId,
} from "@/lib/ai-provider-registry";

export type { AiProviderId } from "@/lib/ai-provider-registry";

/** Mapeia ID da UI → kind + meta na tabela connectors. */
function toConnectorPayload(id: AiProviderId, baseUrl?: string) {
  return registryToConnectorPayload(id, baseUrl);
}

export type PoolSlotPublic = { id: string; hint: string; addedAt: string };

export type ConnectorUpsertResult = {
  ok?: boolean;
  error?: string;
  poolCount?: number;
  poolSlots?: PoolSlotPublic[];
  connected?: boolean;
};

export async function saveAiProviderKey(id: AiProviderId, token: string, baseUrl?: string) {
  const { kind, meta } = toConnectorPayload(id, baseUrl);
  const { data, error } = await supabase.functions.invoke("connector-upsert", {
    body: { kind, token: token.trim(), meta },
  });
  if (error) throw new Error(error.message);
  const res = data as ConnectorUpsertResult;
  if (res?.error) throw new Error(res.error);
  return res;
}

export async function appendKeyToPool(id: AiProviderId, token: string, baseUrl?: string) {
  const { kind, meta } = toConnectorPayload(id, baseUrl);
  const { data, error } = await supabase.functions.invoke("connector-upsert", {
    body: { kind, token: token.trim(), meta, appendToPool: true },
  });
  if (error) throw new Error(error.message);
  const res = data as ConnectorUpsertResult;
  if (res?.error) throw new Error(res.error);
  return res;
}

export async function removeKeyFromPool(id: AiProviderId, keyId: string, baseUrl?: string) {
  const { kind, meta } = toConnectorPayload(id, baseUrl);
  const { data, error } = await supabase.functions.invoke("connector-upsert", {
    body: { kind, meta, removePoolKey: keyId },
  });
  if (error) throw new Error(error.message);
  const res = data as ConnectorUpsertResult;
  if (res?.error) throw new Error(res.error);
  return res;
}

export async function disconnectAiProvider(id: AiProviderId, baseUrl?: string) {
  const { kind, meta } = toConnectorPayload(id, baseUrl);
  const { data, error } = await supabase.functions.invoke("connector-upsert", {
    body: { kind, meta, disconnect: true },
  });
  if (error) throw new Error(error.message);
  const res = data as { error?: string };
  if (res?.error) throw new Error(res.error);
}
