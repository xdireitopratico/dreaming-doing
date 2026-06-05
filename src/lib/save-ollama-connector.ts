import { supabase } from "@/integrations/supabase/client";

export type OllamaConnectorMeta = {
  baseUrl: string;
  defaultModel: string;
  label?: string;
};

function normalizeBaseUrl(raw: string): string {
  const t = raw.trim().replace(/\/$/, "");
  if (!t) throw new Error("URL do Ollama obrigatória");
  if (!/^https?:\/\//i.test(t)) {
    throw new Error("Use URL completa (ex.: https://seu-tunnel.ngrok.app ou http://host:11434)");
  }
  return t;
}

export async function saveOllamaConnector(opts: {
  baseUrl: string;
  defaultModel: string;
  apiKey?: string;
}) {
  const baseUrl = normalizeBaseUrl(opts.baseUrl);
  const defaultModel = opts.defaultModel.trim() || "llama3.2";
  const token = opts.apiKey?.trim() || "ollama";

  const { data, error } = await supabase.functions.invoke("connector-upsert", {
    body: {
      kind: "openai",
      token,
      meta: {
        provider: "ollama",
        label: "Ollama (local)",
        baseUrl,
        defaultModel,
        connectedAt: new Date().toISOString(),
      },
    },
  });
  if (error) throw new Error(error.message);
  const res = data as { error?: string };
  if (res?.error) throw new Error(res.error);
}

export async function disconnectOllamaConnector() {
  const { data, error } = await supabase.functions.invoke("connector-upsert", {
    body: {
      kind: "openai",
      meta: { provider: "ollama", label: "Ollama" },
      disconnect: true,
    },
  });
  if (error) throw new Error(error.message);
  const res = data as { error?: string };
  if (res?.error) throw new Error(res.error);
}

export function readOllamaMetaFromRows(
  rows: { kind: string; meta?: Record<string, unknown> | null; provider?: string | null }[],
): OllamaConnectorMeta | null {
  const row = rows.find((r) => {
    if (r.kind !== "openai") return false;
    const p = (r.provider ?? (r.meta as { provider?: string })?.provider ?? "").trim();
    return p === "ollama";
  });
  if (!row) return null;
  const meta = (row.meta ?? {}) as { baseUrl?: string; defaultModel?: string };
  const baseUrl = typeof meta.baseUrl === "string" ? meta.baseUrl.trim() : "";
  if (!baseUrl) return null;
  return {
    baseUrl,
    defaultModel: typeof meta.defaultModel === "string" ? meta.defaultModel.trim() : "llama3.2",
  };
}