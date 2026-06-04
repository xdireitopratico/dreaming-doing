import { supabase } from "@/integrations/supabase/client";

export type AiProviderId = "anthropic" | "openai" | "groq" | "xai";

/** Mapeia ID da UI → kind + meta na tabela connectors. */
function toConnectorPayload(id: AiProviderId, token: string) {
  switch (id) {
    case "anthropic":
      return { kind: "anthropic" as const, meta: { label: "Anthropic" } };
    case "groq":
      return { kind: "openai" as const, meta: { provider: "groq", label: "Groq" } };
    case "xai":
      return { kind: "openai" as const, meta: { provider: "xai", label: "xAI" } };
    case "openai":
      return { kind: "openai" as const, meta: { provider: "openai", label: "OpenAI" } };
  }
}

export async function saveAiProviderKey(id: AiProviderId, token: string) {
  const { kind, meta } = toConnectorPayload(id, token.trim());
  const { data, error } = await supabase.functions.invoke("connector-upsert", {
    body: { kind, token: token.trim(), meta },
  });
  if (error) throw new Error(error.message);
  const res = data as { error?: string };
  if (res?.error) throw new Error(res.error);
}

export async function disconnectAiProvider(id: AiProviderId) {
  const { kind } = toConnectorPayload(id, "");
  const { data, error } = await supabase.functions.invoke("connector-upsert", {
    body: { kind, disconnect: true },
  });
  if (error) throw new Error(error.message);
  const res = data as { error?: string };
  if (res?.error) throw new Error(res.error);
}