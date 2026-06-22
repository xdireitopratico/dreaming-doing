import {
  allProviders,
  customProviderSecretKey,
  type AiProvider,
  type CustomProviderId,
} from "@/lib/ai-provider-registry";
import type { ConnectorRow } from "@/lib/connector-env-status";
import type { PoolSlotPublic } from "@/lib/save-connector";
import type { ProviderUiState } from "./types";

export function rowProviderId(row: ConnectorRow): string {
  if (row.kind === "anthropic") return "anthropic";
  const meta = (row.meta ?? {}) as { provider?: string };
  return (row.provider ?? meta.provider ?? "openai").trim();
}

function syntheticProviderFromRow(row: ConnectorRow): AiProvider | null {
  const id = rowProviderId(row);
  if (!id.startsWith("custom-")) return null;
  const meta = (row.meta ?? {}) as { baseUrl?: string; label?: string };
  return {
    id: id as CustomProviderId,
    label: meta.label?.trim() || id.replace(/^custom-/, "").replace(/-/g, " "),
    icon: "globe",
    docUrl: "",
    keyPrefix: "sk-",
    keyPlaceholder: "sk-...",
    costPerM: 0,
    openAiCompatible: true,
    supportsPool: true,
    baseUrl: meta.baseUrl?.trim().replace(/\/$/, "") || "",
    secretKey: customProviderSecretKey(id),
    llmProvider: "openai",
    isUserAdded: true,
    models: [],
  };
}

/** Registry + custom do DB/cache + custom só no connector (chave sem metadata). */
export function mergeProviderList(connectorRows?: ConnectorRow[]): AiProvider[] {
  const base = allProviders();
  const byId = new Map(base.map((p) => [p.id, p]));
  for (const row of connectorRows ?? []) {
    const synthetic = syntheticProviderFromRow(row);
    if (synthetic && !byId.has(synthetic.id)) byId.set(synthetic.id, synthetic);
  }
  return [...byId.values()];
}

export function buildInitialProviderStates(): ProviderUiState[] {
  return allProviders().map((p) => ({
    id: p.id,
    status: "available",
    keyValue: "",
    baseUrl: p.baseUrl,
    poolCount: 0,
    poolSlots: [],
  }));
}

export function buildProviderStates(
  connectorRows: ConnectorRow[] | undefined,
  prev: ProviderUiState[],
): ProviderUiState[] {
  const byId = new Map(prev.map((p) => [p.id, p]));
  return mergeProviderList(connectorRows).map((p) => {
    const existing = byId.get(p.id);
    const row = connectorRows?.find((r) => rowProviderId(r) === p.id);
    if (!row) {
      return existing
        ? { ...existing, baseUrl: p.baseUrl, status: "available", poolCount: 0, poolSlots: [] }
        : {
            id: p.id,
            status: "available",
            keyValue: "",
            baseUrl: p.baseUrl,
            poolCount: 0,
            poolSlots: [],
          };
    }
    const meta = (row.meta ?? {}) as { poolCount?: number; poolSlots?: PoolSlotPublic[] };
    const slots = meta.poolSlots ?? [];
    const count = meta.poolCount ?? slots.length ?? 1;
    return {
      ...(existing ?? { id: p.id, keyValue: "", baseUrl: p.baseUrl }),
      baseUrl: p.baseUrl || existing?.baseUrl || "",
      status: "connected",
      poolCount: count,
      poolSlots: slots,
    };
  });
}

export function connectorBaseUrlForSave(
  providerId: AiProviderId,
  uiBaseUrl: string | undefined,
  registryBaseUrl: string | undefined,
): string | undefined {
  if (providerId === "ollama" || providerId.startsWith("custom-")) {
    return uiBaseUrl?.trim() || registryBaseUrl;
  }
  return undefined;
}