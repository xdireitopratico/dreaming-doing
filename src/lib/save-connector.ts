import { supabase } from "@/integrations/supabase/client";

export type AiProviderId = "anthropic" | "openai" | "groq" | "xai" | "nvidia" | "gemini";

/** Mapeia ID da UI → kind + meta na tabela connectors. */
function toConnectorPayload(id: AiProviderId) {
  switch (id) {
    case "anthropic":
      return { kind: "anthropic" as const, meta: { label: "Anthropic", provider: "anthropic" } };
    case "groq":
      return { kind: "openai" as const, meta: { provider: "groq", label: "Groq" } };
    case "xai":
      return { kind: "openai" as const, meta: { provider: "xai", label: "xAI" } };
    case "nvidia":
      return { kind: "openai" as const, meta: { provider: "nvidia", label: "NVIDIA NIM" } };
    case "gemini":
      return { kind: "openai" as const, meta: { provider: "gemini", label: "Google Gemini" } };
    case "openai":
      return { kind: "openai" as const, meta: { provider: "openai", label: "OpenAI" } };
  }
}

export type PoolSlotPublic = { id: string; hint: string; addedAt: string };

export type ConnectorUpsertResult = {
  ok?: boolean;
  error?: string;
  poolCount?: number;
  poolSlots?: PoolSlotPublic[];
  connected?: boolean;
};

export async function saveAiProviderKey(id: AiProviderId, token: string) {
  const { kind, meta } = toConnectorPayload(id);
  const { data, error } = await supabase.functions.invoke("connector-upsert", {
    body: { kind, token: token.trim(), meta },
  });
  if (error) throw new Error(error.message);
  const res = data as ConnectorUpsertResult;
  if (res?.error) throw new Error(res.error);
  return res;
}

export async function appendKeyToPool(id: AiProviderId, token: string) {
  const { kind, meta } = toConnectorPayload(id);
  const { data, error } = await supabase.functions.invoke("connector-upsert", {
    body: { kind, token: token.trim(), meta, appendToPool: true },
  });
  if (error) throw new Error(error.message);
  const res = data as ConnectorUpsertResult;
  if (res?.error) throw new Error(res.error);
  return res;
}

export async function removeKeyFromPool(id: AiProviderId, keyId: string) {
  const { kind, meta } = toConnectorPayload(id);
  const { data, error } = await supabase.functions.invoke("connector-upsert", {
    body: { kind, meta, removePoolKey: keyId },
  });
  if (error) throw new Error(error.message);
  const res = data as ConnectorUpsertResult;
  if (res?.error) throw new Error(res.error);
  return res;
}

export async function disconnectAiProvider(id: AiProviderId) {
  const { kind, meta } = toConnectorPayload(id);
  const { data, error } = await supabase.functions.invoke("connector-upsert", {
    body: { kind, meta, disconnect: true },
  });
  if (error) throw new Error(error.message);
  const res = data as { error?: string };
  if (res?.error) throw new Error(res.error);
}