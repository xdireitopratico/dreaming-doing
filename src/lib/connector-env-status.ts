import type { AiEnvId } from "@/lib/model-catalog";
import type { AiProviderId } from "@/lib/save-connector";

const ENV_TO_PROVIDER: Record<AiEnvId, AiProviderId> = {
  anthropic: "anthropic",
  gemini: "gemini",
  openai: "openai",
  xai: "xai",
  groq: "groq",
  nvidia: "nvidia",
};

export type ConnectorRow = {
  kind: string;
  meta?: Record<string, unknown> | null;
  provider?: string | null;
};

function openAiProvider(row: ConnectorRow): string {
  const col = row.provider?.trim();
  if (col) return col;
  const meta = (row.meta ?? {}) as { provider?: string };
  return meta.provider ?? "openai";
}

/** Quais ambientes LLM têm chave salva (connectors_public). */
export function connectedEnvsFromRows(
  rows: ConnectorRow[] | undefined,
): Record<AiEnvId, boolean> {
  const out: Record<AiEnvId, boolean> = {
    anthropic: false,
    gemini: false,
    openai: false,
    xai: false,
    groq: false,
    nvidia: false,
  };

  for (const row of rows ?? []) {
    if (row.kind === "anthropic") {
      out.anthropic = true;
      continue;
    }
    if (row.kind === "openai") {
      const p = openAiProvider(row) as AiEnvId;
      if (p in out) out[p] = true;
    }
  }
  return out;
}

export function isEnvConnected(
  env: AiEnvId,
  connected: Record<AiEnvId, boolean>,
): boolean {
  return connected[env] === true;
}

export function providerIdForEnv(env: AiEnvId): AiProviderId {
  return ENV_TO_PROVIDER[env];
}