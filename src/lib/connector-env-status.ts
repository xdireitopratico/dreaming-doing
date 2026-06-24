import { allProviders, type AiProviderId } from "@/lib/ai-provider-registry";
import type { AiEnvId } from "@/lib/model-catalog";
import { builtInProviderIds } from "@/lib/ai-provider-registry";

export type ConnectorRow = {
  kind: string;
  meta?: Record<string, unknown> | null;
  provider?: string | null;
  updated_at?: string | null;
};

function openAiProvider(row: ConnectorRow): string {
  const col = row.provider?.trim();
  if (col) return col;
  const meta = (row.meta ?? {}) as { provider?: string };
  return meta.provider ?? "openai";
}

/** Quais ambientes LLM têm chave salva (connectors_public). Inclui providers custom. */
export function connectedEnvsFromRows(
  rows: ConnectorRow[] | undefined,
): Record<AiEnvId, boolean> & Record<string, boolean> {
  const out: Record<AiEnvId, boolean> & Record<string, boolean> = {
    alibaba: false,
    anthropic: false,
    deepseek: false,
    gemini: false,
    openai: false,
    xai: false,
    groq: false,
    minimax: false,
    moonshotai: false,
    nvidia: false,
    ollama: false,
    openrouter: false,
    xiaomi: false,
  };

  for (const id of builtInProviderIds()) {
    if (!(id in out)) out[id as AiEnvId] = false;
  }
  for (const p of allProviders()) {
    if (!(p.id in out)) out[p.id] = false;
  }

  for (const row of rows ?? []) {
    if (row.kind === "anthropic") {
      out.anthropic = true;
      continue;
    }
    if (row.kind === "openai") {
      const p = openAiProvider(row);
      if (p) out[p] = true;
    }
  }
  return out;
}

export function isEnvConnected(env: AiEnvId | string, connected: Record<string, boolean>): boolean {
  return connected[env] === true;
}

export function providerIdForEnv(env: AiEnvId): AiProviderId {
  return env as AiProviderId;
}
