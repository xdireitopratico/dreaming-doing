import type { AgentPreferences } from "@/lib/agent-preferences";
import { getPresetById, PLATFORM_ROBIN_TASTE_PRESET_ID } from "@/lib/model-catalog";
import { isAgentPreferencesConfigured } from "@/lib/agent-setup";

export type ReadinessLevel = "ok" | "warn" | "error";

export type ReadinessItem = {
  level: ReadinessLevel;
  label: string;
  detail: string;
  href?: string;
};

const NEMOTRON_SLUG = "nvidia/nemotron-3-ultra-550b-a55b";

export function normalizeNvidiaApiModel(slug: string): string {
  const s = slug.trim();
  const bare = s.includes("/") ? s.slice(s.indexOf("/") + 1) : s;
  if (bare.includes("nemotron-3-ultra-550b") && !bare.includes("-a55b")) {
    return NEMOTRON_SLUG;
  }
  if (bare.includes("nemotron-3-super-120b") && !bare.includes("-a12b")) {
    return "nvidia/nemotron-3-super-120b-a12b";
  }
  return s.includes("/") ? s : `nvidia/${bare}`;
}

type ConnectorRow = {
  kind: string | null;
  provider?: string | null;
  meta?: Record<string, unknown> | null;
};

export function nvidiaConnectorMeta(rows: ConnectorRow[] | undefined): {
  connected: boolean;
  poolCount: number;
} {
  const row = rows?.find((r) => r.kind === "openai" && (r.provider ?? "").trim() === "nvidia");
  if (!row) return { connected: false, poolCount: 0 };
  const meta = (row.meta ?? {}) as { poolCount?: number };
  const poolCount = typeof meta.poolCount === "number" && meta.poolCount > 0 ? meta.poolCount : 1;
  return { connected: true, poolCount };
}

export function buildEditorReadiness(input: {
  hasUserLlmKey: boolean;
  e2bConnected: boolean;
  prefs: AgentPreferences;
  connectorRows?: ConnectorRow[];
}): ReadinessItem[] {
  const items: ReadinessItem[] = [];
  const { hasUserLlmKey, e2bConnected, prefs, connectorRows } = input;
  const nvidia = nvidiaConnectorMeta(connectorRows);
  const prefsOk = isAgentPreferencesConfigured(prefs);

  if (!e2bConnected) {
    items.push({
      level: "error",
      label: "Sandbox E2B",
      detail: "Obrigatório para o agente construir e para o preview ao vivo.",
      href: "/api-models#forge-key-e2b",
    });
  } else {
    items.push({
      level: "ok",
      label: "Sandbox E2B",
      detail: "Conectado — preview e execução usam sua conta.",
    });
  }

  if (!hasUserLlmKey) {
    items.push({
      level: "warn",
      label: "Modo Taste",
      detail:
        "Sem chave LLM sua: chat = concierge (sem MVP completo). Use Start Project (1×) ou chaves em API.",
      href: "/api-models",
    });
    return items;
  }

  if (!prefsOk) {
    items.push({
      level: "error",
      label: "Modelo no editor",
      detail:
        "Abra Modelos, escolha Fixo ou ROBIN (Nemotron 550B), salve — sem isso o agente não inicia.",
      href: "/api-models",
    });
    return items;
  }

  if (prefs.mode === "robin") {
    const preset = getPresetById(prefs.robinPoolModelId, prefs.userModelEntries);
    const provider = prefs.poolProvider ?? "groq";
    if (provider === "nvidia") {
      if (!nvidia.connected) {
        items.push({
          level: "error",
          label: "Pool NVIDIA",
          detail: "Modo ROBIN + NVIDIA: salve a chave NVIDIA em API (Salvar ou Adicionar ao pool).",
          href: "/api-models",
        });
      } else {
        items.push({
          level: "ok",
          label: "Pool NVIDIA",
          detail: `${nvidia.poolCount} chave(s) · modelo ${preset.model || NEMOTRON_SLUG}`,
        });
      }
    }
    items.push({
      level: "ok",
      label: "Modo ROBIN",
      detail: `${preset.label} · rotação de chaves ${provider.toUpperCase()}`,
    });
  } else if (prefs.mode === "fixed") {
    const preset = getPresetById(prefs.fixedPresetId, prefs.userModelEntries);
    const model = normalizeNvidiaApiModel(preset.model);
    if (preset.env === "nvidia" && !nvidia.connected) {
      items.push({
        level: "error",
        label: "Chave NVIDIA",
        detail: `Modelo fixo ${model} — falta chave NVIDIA em API.`,
        href: "/api-models",
      });
    } else {
      items.push({
        level: "ok",
        label: "Modelo fixo",
        detail: `${preset.label} → API ${model}`,
      });
    }
  } else {
    items.push({
      level: "ok",
      label: "Modo Auto",
      detail: "Router escolhe entre os modelos permitidos com chave ativa.",
    });
  }

  const usesNemotron =
    prefs.mode === "robin" &&
    prefs.poolProvider === "nvidia" &&
    (prefs.robinPoolModelId === PLATFORM_ROBIN_TASTE_PRESET_ID ||
      prefs.robinPoolModelId?.includes("nemotron"));
  if (usesNemotron && nvidia.connected) {
    items.push({
      level: "ok",
      label: "Nemotron 550B",
      detail: `Endpoint NIM · slug ${NEMOTRON_SLUG} (mesmo do build.nvidia.com).`,
    });
  }

  return items;
}
