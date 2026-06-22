import { useState, useMemo, useEffect, useCallback } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { ArrowLeft, Cpu, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "@/lib/toast";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import {
  type ConnectorRow,
  connectedEnvsFromRows,
} from "@/lib/connector-env-status";
import {
  allProviders,
  customProviderSecretKey,
  loadCustomProvidersFromDb,
  providerById,
  type AiProvider,
  type AiProviderId,
  type CustomProviderId,
  removeCustomProvider,
} from "@/lib/ai-provider-registry";
import {
  loadAgentPreferences,
  loadAgentPreferencesFromDb,
  saveAgentPreferencesToDb,
  type AgentPreferences,
  type ModelPowerMode,
  type SttProviderId,
} from "@/lib/agent-preferences";
import {
  getPresetById,
  normalizePresetId,
  modelsForStudioStep,
  type ForgeModelPreset,
  type UserModelEntry,
  userModelPresetId,
  PLATFORM_ROBIN_TASTE_PRESET_ID,
} from "@/lib/model-catalog";
import {
  saveAiProviderKey,
  appendKeyToPool,
  removeKeyFromPool,
  disconnectAiProvider,
  type PoolSlotPublic,
} from "@/lib/save-connector";
import { saveE2bApiKey, disconnectE2bApiKey } from "@/lib/save-e2b-key";
import { isE2bConnected, isE2bHealthOk } from "@/lib/e2b-status";
import { testE2bApiKey, type E2bHealthResponse } from "@/lib/test-e2b-key";
import {
  disconnectOllamaConnector,
  readOllamaMetaFromRows,
  saveOllamaConnector,
} from "@/lib/save-ollama-connector";
import { saveWebSearchKey, disconnectWebSearch, type WebSearchProviderId } from "@/lib/save-web-search-key";
import { Button } from "@/components/ui/button";
import { ModelEngineSection } from "./ModelEngineSection";
import { ProvidersKeysSection } from "./ProvidersKeysSection";
import { InfraToolsSection } from "./InfraToolsSection";

export interface ProviderUiState {
  id: AiProviderId;
  status: "available" | "connected";
  keyValue: string;
  baseUrl: string;
  poolCount: number;
  poolSlots: PoolSlotPublic[];
}

function buildInitialProviderStates(): ProviderUiState[] {
  return allProviders().map((p) => ({
    id: p.id,
    status: "available",
    keyValue: "",
    baseUrl: p.baseUrl,
    poolCount: 0,
    poolSlots: [],
  }));
}

function rowProviderId(row: ConnectorRow): string {
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

function mergeProviderList(connectorRows?: ConnectorRow[]): AiProvider[] {
  const base = allProviders();
  const byId = new Map(base.map((p) => [p.id, p]));
  for (const row of connectorRows ?? []) {
    const synthetic = syntheticProviderFromRow(row);
    if (synthetic && !byId.has(synthetic.id)) byId.set(synthetic.id, synthetic);
  }
  return [...byId.values()];
}

function buildProviderStates(
  connectorRows: ConnectorRow[] | undefined,
  prev: ProviderUiState[],
): ProviderUiState[] {
  const byId = new Map(prev.map((p) => [p.id, p]));
  return mergeProviderList(connectorRows).map((p) => {
    const existing = byId.get(p.id);
    const row = connectorRows?.find((r) => rowProviderId(r) === p.id);
    if (!row) {
      return existing
        ? { ...existing, baseUrl: p.baseUrl, status: "available" as const, poolCount: 0, poolSlots: [] }
        : {
            id: p.id,
            status: "available" as const,
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
      status: "connected" as const,
      poolCount: count,
      poolSlots: slots,
    };
  });
}

export function ApiModelsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [prefs, setPrefs] = useState<AgentPreferences>(() => loadAgentPreferences());
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const [providers, setProviders] = useState<ProviderUiState[]>(buildInitialProviderStates);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [pulseId, setPulseId] = useState<string | null>(null);
  const [keysExpanded, setKeysExpanded] = useState(false);
  const [infraExpanded, setInfraExpanded] = useState(false);

  const [e2bKeyValue, setE2bKeyValue] = useState("");
  const [e2bConnected, setE2bConnected] = useState(false);
  const [e2bHealth, setE2bHealth] = useState<E2bHealthResponse | null>(null);
  const [e2bTesting, setE2bTesting] = useState(false);

  const [ollamaBaseUrl, setOllamaBaseUrl] = useState("http://localhost:11434");
  const [ollamaModel, setOllamaModel] = useState("llama3.2");
  const [ollamaApiKey, setOllamaApiKey] = useState("");
  const [ollamaConnected, setOllamaConnected] = useState(false);

  const mode = prefs.mode ?? "fixed";
  const activePreset = getPresetById(
    mode === "robin" ? prefs.robinPoolModelId : prefs.fixedPresetId,
    prefs.userModelEntries,
  );
  const [selectedEnv, setSelectedEnv] = useState<AiProviderId>(activePreset.env as AiProviderId);

  useEffect(() => {
    if (!user) return;
    void loadCustomProvidersFromDb(supabase);
  }, [user]);

  const { data: connectorRows } = useQuery({
    queryKey: ["connectors-public", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("connectors_public")
        .select("kind, meta, provider")
        .eq("owner_id", user!.id);
      if (error) throw error;
      return (data ?? []) as ConnectorRow[];
    },
  });

  const { data: webSearchRow } = useQuery({
    queryKey: ["web-search-connector", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("connectors_public")
        .select("kind, meta")
        .eq("owner_id", user!.id)
        .eq("kind", "web_search" as unknown as "github")
        .single();
      if (error && error.code !== "PGRST116") throw error;
      return (data as { kind: string; meta?: Record<string, unknown> | null } | null) ?? null;
    },
  });

  const refreshProviders = useCallback(async () => {
    if (user) await loadCustomProvidersFromDb(supabase);
    setProviders((prev) => buildProviderStates(connectorRows, prev));
  }, [user, connectorRows]);

  useEffect(() => {
    const onPrefsUpdated = () => {
      void refreshProviders();
    };
    window.addEventListener("forge:prefs-updated", onPrefsUpdated);
    return () => window.removeEventListener("forge:prefs-updated", onPrefsUpdated);
  }, [refreshProviders]);

  useEffect(() => {
    if (!connectorRows) return;
    const connected = connectedEnvsFromRows(connectorRows);

    setE2bConnected(isE2bConnected(connectorRows));
    const e2bRow = connectorRows.find((r) => r.kind === "e2b");
    if (isE2bHealthOk(e2bRow?.meta)) {
      const meta = (e2bRow?.meta ?? {}) as {
        e2bTemplate?: string;
        e2bNodeVersion?: string;
        e2bNpmVersion?: string;
      };
      setE2bHealth({
        ok: true,
        templateUsed: meta.e2bTemplate,
        nodeVersion: meta.e2bNodeVersion,
        npmVersion: meta.e2bNpmVersion,
      });
    } else if (!isE2bConnected(connectorRows)) {
      setE2bHealth(null);
    }

    const ollamaMeta = readOllamaMetaFromRows(connectorRows);
    setOllamaConnected(!!ollamaMeta);
    if (ollamaMeta) {
      setOllamaBaseUrl(ollamaMeta.baseUrl);
      setOllamaModel(ollamaMeta.defaultModel);
    }

    setProviders((prev) => buildProviderStates(connectorRows, prev));
  }, [connectorRows]);

  useEffect(() => {
    if (!pulseId) return;
    const t = window.setTimeout(() => setPulseId(null), 2200);
    return () => window.clearTimeout(t);
  }, [pulseId]);

  // Load preferências do banco na montagem
  useEffect(() => {
    if (prefsLoaded || !user) return;
    loadAgentPreferencesFromDb().then((dbPrefs) => {
      if (dbPrefs.mode) {
        setPrefs(dbPrefs);
      }
      setPrefsLoaded(true);
    });
  }, [user, prefsLoaded]);

  const patchPrefs = useCallback((partial: Partial<AgentPreferences>) => {
    setPrefs((p) => {
      const next = { ...p, ...partial };
      saveAgentPreferencesToDb(next);
      return next;
    });
  }, []);

  const studioProviders = useMemo(
    () => mergeProviderList(connectorRows),
    [connectorRows],
  );
  const connected = useMemo(() => connectedEnvsFromRows(connectorRows), [connectorRows]);
  const connectedCount = useMemo(
    () => Object.values(connected).filter(Boolean).length,
    [connected],
  );

  const handleProviderKeyChange = useCallback((id: AiProviderId, value: string) => {
    setProviders((prev) => prev.map((p) => (p.id === id ? { ...p, keyValue: value } : p)));
  }, []);

  const handleProviderBaseUrlChange = useCallback((id: AiProviderId, value: string) => {
    setProviders((prev) => prev.map((p) => (p.id === id ? { ...p, baseUrl: value } : p)));
  }, []);

  const applyPoolResult = useCallback(
    (id: AiProviderId, res: { poolCount?: number; poolSlots?: PoolSlotPublic[] }) => {
      setProviders((prev) =>
        prev.map((x) =>
          x.id === id
            ? {
                ...x,
                status: "connected" as const,
                keyValue: "",
                poolCount: res.poolCount ?? x.poolCount ?? 0,
                poolSlots: res.poolSlots ?? x.poolSlots ?? [],
              }
            : x,
        ),
      );
      setPulseId(id);
    },
    [],
  );

  const handleSaveKey = useCallback(
    async (id: AiProviderId, appendPool = false) => {
      const p = providers.find((x) => x.id === id);
      if (!p?.keyValue.trim()) {
        toast.error("Cole a chave antes de salvar");
        return;
      }
      const prov = providerById(id);
      const baseUrl =
        prov?.id === "ollama" || prov?.id.startsWith("custom-")
          ? (p.baseUrl.trim() || prov?.baseUrl)
          : undefined;
      setSavingId(id);
      try {
        if (appendPool && prov?.supportsPool) {
          const res = await appendKeyToPool(id, p.keyValue, baseUrl);
          applyPoolResult(id, res);
        } else {
          const res = await saveAiProviderKey(id, p.keyValue, baseUrl);
          applyPoolResult(id, res);
        }
        await qc.invalidateQueries({ queryKey: ["connectors-public"] });
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : "Falha ao salvar");
      } finally {
        setSavingId(null);
      }
    },
    [providers, qc, applyPoolResult],
  );

  const handleRemoveSlot = useCallback(
    async (id: AiProviderId, keyId: string) => {
      const p = providerById(id);
      const ui = providers.find((x) => x.id === id);
      const baseUrl =
        p?.id === "ollama" || p?.id.startsWith("custom-")
          ? (ui?.baseUrl.trim() || p?.baseUrl)
          : undefined;
      setSavingId(id);
      try {
        const res = await removeKeyFromPool(id, keyId, baseUrl);
        applyPoolResult(id, res);
        if ((res.poolCount ?? 0) === 0) {
          setProviders((prev) =>
            prev.map((p) =>
              p.id === id ? { ...p, status: "available", poolCount: 0, poolSlots: [] } : p,
            ),
          );
        }
        await qc.invalidateQueries({ queryKey: ["connectors-public"] });
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : "Falha ao remover");
      } finally {
        setSavingId(null);
      }
    },
    [qc, applyPoolResult, providers],
  );

  const handleDeleteProvider = useCallback(
    async (id: AiProviderId) => {
      const p = providerById(id);
      const ui = providers.find((x) => x.id === id);
      const baseUrl =
        p?.id === "ollama" || p?.id.startsWith("custom-")
          ? (ui?.baseUrl.trim() || p?.baseUrl)
          : undefined;
      setSavingId(id);
      try {
        await disconnectAiProvider(id, baseUrl);
        if (id.startsWith("custom-")) {
          removeCustomProvider(id as CustomProviderId);
        }
        setProviders((prev) =>
          prev.map((p) =>
            p.id === id
              ? { ...p, keyValue: "", status: "available", poolCount: 0, poolSlots: [] }
              : p,
          ),
        );
        await qc.invalidateQueries({ queryKey: ["connectors-public"] });
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : "Falha ao remover");
      } finally {
        setSavingId(null);
      }
    },
    [qc, providers],
  );

  const handleTestE2b = useCallback(async () => {
    setE2bTesting(true);
    try {
      const token = e2bKeyValue.trim().startsWith("e2b") ? e2bKeyValue : undefined;
      const result = await testE2bApiKey(token);
      setE2bHealth(result);
      if (result.ok) {
        await qc.invalidateQueries({ queryKey: ["connectors-public"] });
        if (!token) setE2bConnected(true);
      } else {
        toast.error(result.error ?? "Teste E2B falhou");
      }
    } catch (e: unknown) {
      setE2bHealth({ ok: false, error: e instanceof Error ? e.message : "Falha no teste" });
      toast.error(e instanceof Error ? e.message : "Falha no teste E2B");
    } finally {
      setE2bTesting(false);
    }
  }, [e2bKeyValue, qc]);

  const handleSaveE2b = useCallback(async () => {
    if (!e2bKeyValue.trim().startsWith("e2b")) {
      toast.error("Cole uma chave E2B válida (prefixo e2b_)");
      return;
    }
    setSavingId("e2b");
    try {
      await saveE2bApiKey(e2bKeyValue);
      setE2bKeyValue("");
      setE2bConnected(true);
      await qc.invalidateQueries({ queryKey: ["connectors-public"] });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Falha ao salvar E2B");
    } finally {
      setSavingId(null);
    }
  }, [e2bKeyValue, qc]);

  const handleDeleteE2b = useCallback(async () => {
    setSavingId("e2b");
    try {
      await disconnectE2bApiKey();
      setE2bConnected(false);
      setE2bKeyValue("");
      await qc.invalidateQueries({ queryKey: ["connectors-public"] });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Falha ao remover E2B");
    } finally {
      setSavingId(null);
    }
  }, [qc]);

  const handleSaveOllama = useCallback(async () => {
    setSavingId("ollama");
    try {
      await saveOllamaConnector({
        baseUrl: ollamaBaseUrl,
        defaultModel: ollamaModel,
        apiKey: ollamaApiKey || undefined,
      });
      setOllamaConnected(true);
      setOllamaApiKey("");
      await qc.invalidateQueries({ queryKey: ["connectors-public"] });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Falha ao salvar Ollama");
    } finally {
      setSavingId(null);
    }
  }, [ollamaBaseUrl, ollamaModel, ollamaApiKey, qc]);

  const handleDeleteOllama = useCallback(async () => {
    setSavingId("ollama");
    try {
      await disconnectOllamaConnector();
      setOllamaConnected(false);
      await qc.invalidateQueries({ queryKey: ["connectors-public"] });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Falha ao remover Ollama");
    } finally {
      setSavingId(null);
    }
  }, [qc]);

  const handleSaveWebSearch = useCallback(
    async (provider: WebSearchProviderId, token: string) => {
      setSavingId(`websearch-${provider}`);
      try {
        await saveWebSearchKey(provider, token);
        await qc.invalidateQueries({ queryKey: ["web-search-connector"] });
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : "Falha ao salvar");
      } finally {
        setSavingId(null);
      }
    },
    [qc],
  );

  const handleDeleteWebSearch = useCallback(async () => {
    setSavingId("websearch");
    try {
      await disconnectWebSearch();
      await qc.invalidateQueries({ queryKey: ["web-search-connector"] });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Falha ao remover");
    } finally {
      setSavingId(null);
    }
  }, [qc]);

  const handleSetMode = useCallback(
    (nextMode: ModelPowerMode) => {
      if (nextMode === "robin") {
        const poolProviders = allProviders().filter(
          (p) => p.supportsPool && connected[p.id],
        );
        const target =
          poolProviders.find((p) => p.id === selectedEnv)?.id ??
          poolProviders[0]?.id ??
          "nvidia";
        const defaultModelId =
          target === "nvidia" ? PLATFORM_ROBIN_TASTE_PRESET_ID : "pool-groq-flash";
        patchPrefs({
          mode: "robin",
          poolProvider: target,
          robinPoolModelId: defaultModelId,
        });
        setSelectedEnv(target);
        return;
      }
      // Limpar campos específicos de ROBIN ao sair do modo
      patchPrefs({ mode: nextMode, poolProvider: undefined, robinPoolModelId: undefined });
    },
    [patchPrefs, selectedEnv, connected],
  );

  const handleSelectModel = useCallback(
    (presetId: string) => {
      const preset = getPresetById(presetId, prefs.userModelEntries);
      if (!connected[preset.env]) {
        toast.error(`Cadastre a chave ${providerById(preset.env as AiProviderId)?.label ?? preset.env} em Providers & Keys.`);
        setKeysExpanded(true);
        return;
      }
      if (mode === "robin") {
        const prov = providerById(preset.env as AiProviderId);
        if (!prov?.supportsPool) {
          toast.error("ROBIN só funciona com providers que suportam pool.");
          return;
        }
        patchPrefs({
          robinPoolModelId: presetId,
          poolProvider: preset.env,
        });
        return;
      }
      if (mode === "auto") {
        const norm = normalizePresetId(presetId);
        const current = new Set((prefs.autoAllowedPresetIds ?? []).map(normalizePresetId));
        if (current.has(norm)) current.delete(norm);
        else current.add(norm);
        patchPrefs({ autoAllowedPresetIds: [...current] });
        return;
      }
      patchPrefs({ fixedPresetId: presetId });
    },
    [connected, mode, patchPrefs, prefs.autoAllowedPresetIds, prefs.userModelEntries],
  );

  const handleAddUserModel = useCallback(
    (rawSlug: string) => {
      const raw = rawSlug.trim();
      if (!raw) {
        toast.error("Digite o ID do modelo.");
        return;
      }
      const slug = raw.includes("/") ? raw : `${selectedEnv}/${raw}`;
      const entry: UserModelEntry = {
        slug,
        env: selectedEnv as UserModelEntry["env"],
        label: raw.includes("/") ? raw.split("/").pop()! : raw,
      };
      const id = userModelPresetId(slug);
      if ((prefs.userModelEntries ?? []).some((e) => userModelPresetId(e.slug) === id)) {
        return;
      }
      const entries = [...(prefs.userModelEntries ?? []), entry];
      const nextAllowed =
        mode === "auto"
          ? [...new Set([...(prefs.autoAllowedPresetIds ?? []).map(normalizePresetId), id])]
          : prefs.autoAllowedPresetIds;
      patchPrefs({
        userModelEntries: entries,
        autoAllowedPresetIds: nextAllowed,
        useCustomModel: false,
        customModelId: undefined,
      });
    },
    [mode, patchPrefs, prefs.autoAllowedPresetIds, prefs.userModelEntries, selectedEnv],
  );

  const handleRemoveUserModel = useCallback(
    (slug: string) => {
      const id = userModelPresetId(slug);
      const entries = (prefs.userModelEntries ?? []).filter(
        (e) => userModelPresetId(e.slug) !== id,
      );
      patchPrefs({
        userModelEntries: entries,
        autoAllowedPresetIds: (prefs.autoAllowedPresetIds ?? [])
          .map(normalizePresetId)
          .filter((x) => x !== id),
        fixedPresetId:
          normalizePresetId(prefs.fixedPresetId) === id ? undefined : prefs.fixedPresetId,
        robinPoolModelId:
          normalizePresetId(prefs.robinPoolModelId) === id ? undefined : prefs.robinPoolModelId,
      });
    },
    [patchPrefs, prefs],
  );

  const envModels = useMemo(
    () => modelsForStudioStep(selectedEnv as UserModelEntry["env"], mode, prefs.userModelEntries),
    [selectedEnv, mode, prefs.userModelEntries],
  );

  return (
    <div className="px-6 py-8 max-w-[1100px] mx-auto">
      <Link
        to="/projects"
        className="inline-flex items-center gap-1.5 font-mono text-[10px] text-[var(--text-ghost)] hover:text-[var(--foreground)] mb-6"
      >
        <ArrowLeft className="size-3" />
        PROJETOS
      </Link>

      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-xl bg-[var(--primary)]/10 border border-[var(--primary)]/20 grid place-items-center">
            <Cpu className="size-5 text-[var(--primary)]" />
          </div>
          <div>
            <h1 className="font-display text-3xl tracking-tight">Api & Models</h1>
            <p className="font-mono text-[10px] text-[var(--text-dim)] mt-0.5">
              Provedores, chaves e como o agente consome modelos.
            </p>
          </div>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-wrap items-center gap-4 mb-6 px-4 py-3 rounded-lg bg-[var(--surface-1)] border border-[var(--border)]"
      >
        <div className="flex items-center gap-2">
          {connectedCount > 0 ? (
            <CheckCircle2 className="size-4 text-emerald-400" />
          ) : (
            <AlertCircle className="size-4 text-amber-400" />
          )}
          <span className="font-mono text-[10px]">{connectedCount} provider(s) conectado(s)</span>
        </div>
        <span className="text-[var(--border)]">|</span>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] text-[var(--text-dim)]">
            Modelo: {activePreset.label} · {mode}
          </span>
        </div>
        <span className="text-[var(--border)]">|</span>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] text-[var(--text-dim)]">
            Valores nunca retornam ao browser
          </span>
        </div>
      </motion.div>

      <ModelEngineSection
        prefs={prefs}
        connected={connected}
        providers={studioProviders}
        selectedEnv={selectedEnv}
        envModels={envModels}
        onSetMode={handleSetMode}
        onSelectEnv={setSelectedEnv}
        onSelectModel={handleSelectModel}
        onAddUserModel={handleAddUserModel}
        onRemoveUserModel={handleRemoveUserModel}
        onPatchPrefs={patchPrefs}
      />

      <ProvidersKeysSection
        providers={providers}
        savingId={savingId}
        pulseId={pulseId}
        expanded={keysExpanded}
        onToggle={() => setKeysExpanded((v) => !v)}
        onKeyChange={handleProviderKeyChange}
        onBaseUrlChange={handleProviderBaseUrlChange}
        onSave={handleSaveKey}
        onRemoveSlot={handleRemoveSlot}
        onDelete={handleDeleteProvider}
        onProviderAdded={() => {
          void refreshProviders();
          setKeysExpanded(true);
        }}
      />

      <InfraToolsSection
        expanded={infraExpanded}
        onToggle={() => setInfraExpanded((v) => !v)}
        e2bKeyValue={e2bKeyValue}
        onE2bKeyChange={setE2bKeyValue}
        e2bConnected={e2bConnected}
        e2bHealth={e2bHealth}
        e2bTesting={e2bTesting}
        onSaveE2b={handleSaveE2b}
        onTestE2b={handleTestE2b}
        onDeleteE2b={handleDeleteE2b}
        ollamaBaseUrl={ollamaBaseUrl}
        onOllamaBaseUrlChange={setOllamaBaseUrl}
        ollamaModel={ollamaModel}
        onOllamaModelChange={setOllamaModel}
        ollamaApiKey={ollamaApiKey}
        onOllamaApiKeyChange={setOllamaApiKey}
        ollamaConnected={ollamaConnected}
        onSaveOllama={handleSaveOllama}
        onDeleteOllama={handleDeleteOllama}
        webSearchRow={webSearchRow}
        savingId={savingId}
        onSaveWebSearch={handleSaveWebSearch}
        onDeleteWebSearch={handleDeleteWebSearch}
      />
    </div>
  );
}
