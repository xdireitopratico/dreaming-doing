// API — chaves de provedores (BYOK), pool ROBIN, edge-only
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useCallback, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { toast } from "sonner";
import {
  ArrowLeft, Shield, CheckCircle2, AlertCircle, Star, ExternalLink, Plug, Zap, Brain, Globe, Cpu, Sparkles, Box,
} from "lucide-react";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { ApiKeyInput } from "@/components/connectors/ApiKeyInput";
import { ApiKeyPoolSection } from "@/components/connectors/ApiKeyPoolSection";

import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import {
  saveAiProviderKey,
  appendKeyToPool,
  removeKeyFromPool,
  disconnectAiProvider,
  type AiProviderId,
  type PoolSlotPublic,
} from "@/lib/save-connector";
import { loadAgentPreferences } from "@/lib/agent-preferences";
import { saveE2bApiKey, disconnectE2bApiKey } from "@/lib/save-e2b-key";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/api")({
  component: () => (
    <DashboardShell requireAuth activeNav="api">
      <ApiPage />
    </DashboardShell>
  ),
});

interface ProviderConfig {
  id: AiProviderId;
  provider: string;
  label: string;
  icon: React.ReactNode;
  description: string;
  docUrl: string;
  keyPrefix: string;
  costPerM: number;
  status: "connected" | "available";
  keyValue: string;
  poolCount?: number;
  poolSlots?: PoolSlotPublic[];
  supportsPool?: boolean;
}

const INITIAL: ProviderConfig[] = [
  {
    id: "anthropic",
    provider: "Anthropic",
    label: "Anthropic",
    icon: <Zap className="size-5" />,
    description: "Claude Sonnet 4 / Opus — modelos frontier para código.",
    docUrl: "https://console.anthropic.com",
    keyPrefix: "sk-ant-",
    costPerM: 3,
    status: "available",
    keyValue: "",
  },
  {
    id: "gemini",
    provider: "Google",
    label: "Google Gemini",
    icon: <Sparkles className="size-5" />,
    description: "Gemini 2.5 Pro / Flash — sequência Google AI Studio.",
    docUrl: "https://aistudio.google.com/apikey",
    keyPrefix: "AIza",
    costPerM: 1.25,
    status: "available",
    keyValue: "",
  },
  {
    id: "openai",
    provider: "OpenAI",
    label: "OpenAI",
    icon: <Brain className="size-5" />,
    description: "GPT-4.1 / GPT-4o — código e multimodal.",
    docUrl: "https://platform.openai.com",
    keyPrefix: "sk-proj-",
    costPerM: 2.5,
    status: "available",
    keyValue: "",
  },
  {
    id: "xai",
    provider: "xAI",
    label: "xAI",
    icon: <Globe className="size-5" />,
    description: "Grok 3 / Mini — código + STT (voz) na mesma chave.",
    docUrl: "https://console.x.ai",
    keyPrefix: "xai-",
    costPerM: 0.5,
    status: "available",
    keyValue: "",
  },
  {
    id: "groq",
    provider: "Groq",
    label: "Groq",
    icon: <Cpu className="size-5" />,
    description: "Llama 3.3 70B / QwQ — pool ROBIN (sem modelos 8B).",
    docUrl: "https://console.groq.com",
    keyPrefix: "gsk_",
    costPerM: 0,
    status: "available",
    keyValue: "",
    supportsPool: true,
  },
  {
    id: "openrouter",
    provider: "OpenRouter",
    label: "OpenRouter",
    icon: <Globe className="size-5" />,
    description: "Qualquer modelo — cole o slug em Ambiente e modelo.",
    docUrl: "https://openrouter.ai/keys",
    keyPrefix: "sk-or-",
    costPerM: 0,
    status: "available",
    keyValue: "",
  },
  {
    id: "nvidia",
    provider: "NVIDIA",
    label: "NVIDIA NIM",
    icon: <Cpu className="size-5" />,
    description: "Llama 3.3 70B / Nemotron no NIM — pool ROBIN para código.",
    docUrl: "https://build.nvidia.com",
    keyPrefix: "nvapi-",
    costPerM: 0,
    status: "available",
    keyValue: "",
    supportsPool: true,
  },
];

function rowForProvider(
  rows: { kind: string; meta: Record<string, unknown> | null; provider?: string | null }[],
  id: AiProviderId,
) {
  const target =
    id === "anthropic"
      ? { kind: "anthropic", provider: "" }
      : id === "openai"
        ? { kind: "openai", provider: "openai" }
        : id === "gemini"
          ? { kind: "openai", provider: "gemini" }
          : id === "openrouter"
            ? { kind: "openai", provider: "openrouter" }
            : { kind: "openai", provider: id };

  return rows.find((r) => {
    const meta = (r.meta ?? {}) as { provider?: string };
    const p = (r.provider ?? meta.provider ?? "").trim();
    if (target.kind === "anthropic") return r.kind === "anthropic";
    return r.kind === "openai" && p === target.provider;
  });
}

function ApiPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [providers, setProviders] = useState(INITIAL);
  const [e2bKeyValue, setE2bKeyValue] = useState("");
  const [e2bConnected, setE2bConnected] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [pulseId, setPulseId] = useState<string | null>(null);
  const robinMode = loadAgentPreferences().mode === "robin";

  const { data: connectorRows } = useQuery({
    queryKey: ["connectors-public", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("connectors_public")
        .select("kind, meta")
        .eq("owner_id", user!.id);
      if (error) throw error;
      return (data ?? []) as { kind: string; meta: Record<string, unknown> | null }[];
    },
  });

  useEffect(() => {
    if (!connectorRows) return;
    const hasE2b = connectorRows.some((r) => r.kind === "e2b");
    setE2bConnected(hasE2b);
    setProviders((prev) =>
      prev.map((p) => {
        const row = rowForProvider(connectorRows, p.id);
        if (!row) {
          return { ...p, status: "available" as const, poolCount: 0, poolSlots: [] };
        }
        const meta = (row.meta ?? {}) as { poolCount?: number; poolSlots?: PoolSlotPublic[] };
        const slots = meta.poolSlots ?? [];
        const count = meta.poolCount ?? slots.length ?? 1;
        return {
          ...p,
          status: "connected" as const,
          poolCount: count,
          poolSlots: slots,
        };
      }),
    );
  }, [connectorRows]);

  useEffect(() => {
    if (!pulseId) return;
    const t = window.setTimeout(() => setPulseId(null), 2200);
    return () => window.clearTimeout(t);
  }, [pulseId]);

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

  const handleSave = useCallback(
    async (id: AiProviderId, appendPool = false) => {
      const p = providers.find((x) => x.id === id);
      if (!p?.keyValue.trim()) {
        toast.error("Cole a chave antes de salvar");
        return;
      }
      setSavingId(id);
      try {
        if (appendPool && p.supportsPool) {
          const res = await appendKeyToPool(id, p.keyValue);
          applyPoolResult(id, res);
          toast.success(`Chave #${res.poolCount ?? "?"} adicionada ao pool ${p.label}`);
        } else {
          const res = await saveAiProviderKey(id, p.keyValue);
          applyPoolResult(id, res);
          toast.success(
            p.supportsPool && (p.poolCount ?? 0) > 0
              ? `${p.label}: pool substituído por 1 chave`
              : `${p.label} salvo — agente pode usar`,
          );
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
      setSavingId(id);
      try {
        const res = await removeKeyFromPool(id, keyId);
        applyPoolResult(id, res);
        if ((res.poolCount ?? 0) === 0) {
          setProviders((prev) =>
            prev.map((p) =>
              p.id === id ? { ...p, status: "available", poolCount: 0, poolSlots: [] } : p,
            ),
          );
        }
        await qc.invalidateQueries({ queryKey: ["connectors-public"] });
        toast.success("Chave removida do pool");
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : "Falha ao remover");
      } finally {
        setSavingId(null);
      }
    },
    [qc, applyPoolResult],
  );

  const handleDelete = useCallback(
    async (id: AiProviderId) => {
      setSavingId(id);
      try {
        await disconnectAiProvider(id);
        setProviders((prev) =>
          prev.map((p) =>
            p.id === id ? { ...p, keyValue: "", status: "available", poolCount: 0, poolSlots: [] } : p,
          ),
        );
        await qc.invalidateQueries({ queryKey: ["connectors-public"] });
        toast.success("Chave removida");
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : "Falha ao remover");
      } finally {
        setSavingId(null);
      }
    },
    [qc],
  );

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
      toast.success("Sandbox E2B conectado");
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
      toast.success("Chave E2B removida");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Falha ao remover E2B");
    } finally {
      setSavingId(null);
    }
  }, [qc]);

  const connectedCount =
    providers.filter((p) => p.status === "connected").length + (e2bConnected ? 1 : 0);

  return (
    <div className="px-6 py-8 max-w-[960px] mx-auto">
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
            <Shield className="size-5 text-[var(--primary)]" />
          </div>
          <div>
            <h1 className="font-display text-3xl tracking-tight">API Keys</h1>
            <p className="font-mono text-[10px] text-[var(--text-dim)] mt-0.5">
              Única fonte de chaves: IA, sandbox E2B e pool ROBIN. Modelos e STT em Modelos.
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
          <CheckCircle2 className="size-4 text-emerald-400" />
          <span className="font-mono text-[10px]">{connectedCount} provedor(es) com chave</span>
        </div>
        <span className="text-[var(--border)]">|</span>
        <div className="flex items-center gap-2">
          <AlertCircle className="size-4 text-amber-400" />
          <span className="font-mono text-[10px] text-[var(--text-dim)]">
            Valores nunca retornam ao browser após salvar
          </span>
        </div>
        <span className="text-[var(--border)]">|</span>
        <Link to="/models" className="font-mono text-[10px] text-[var(--primary)] hover:underline">
          Modelos →
        </Link>
        <span className="text-[var(--border)]">|</span>
        <Link to="/connectors" className="font-mono text-[10px] text-[var(--primary)] hover:underline">
          <Plug className="size-3 inline mr-1" />
          Conectores →
        </Link>
      </motion.div>

      {robinMode && (
        <p className="mb-6 font-mono text-[9px] text-amber-400/90 px-3 py-2 rounded border border-amber-400/20 bg-amber-400/5">
          Modo ROBIN ativo: use &quot;Adicionar ao pool&quot; em Groq ou NVIDIA — o contador e a lista abaixo
          atualizam na hora. O agente troca de chave a cada requisição.
        </p>
      )}

      <h2 className="flex items-center gap-2 font-mono text-[10px] tracking-[0.2em] uppercase text-[var(--text-dim)] mb-4">
        <Box className="size-3 text-[var(--primary)]" />
        Sandbox (E2B)
      </h2>

      <motion.div
        id="forge-key-e2b"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8 p-5 rounded-xl border border-[var(--border)] bg-[var(--surface-1)]/30 scroll-mt-24"
      >
        <p className="font-mono text-[9px] text-[var(--text-ghost)] mb-4 leading-relaxed">
          Preview ao vivo e agente executam no seu sandbox E2B — sem chave global da plataforma.
        </p>
        <ApiKeyInput
          label="Chave API E2B"
          value={e2bKeyValue}
          onChange={setE2bKeyValue}
          onDelete={e2bConnected ? () => void handleDeleteE2b() : undefined}
          provider="e2b"
          placeholder="e2b_..."
          saved={e2bConnected}
          disabled={savingId === "e2b"}
        />
        <div className="mt-2 flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            className="bg-[var(--primary)] text-[#0a0a0a]"
            disabled={savingId === "e2b" || !e2bKeyValue.trim()}
            onClick={() => void handleSaveE2b()}
          >
            {savingId === "e2b" ? "Salvando…" : e2bConnected ? "Atualizar chave" : "Salvar chave E2B"}
          </Button>
          <a
            href="https://e2b.dev/docs"
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-[9px] text-[var(--text-ghost)] hover:text-[var(--foreground)] self-center"
          >
            Docs E2B <ExternalLink className="size-3 inline" />
          </a>
        </div>
      </motion.div>

      <h2 className="flex items-center gap-2 font-mono text-[10px] tracking-[0.2em] uppercase text-[var(--text-dim)] mb-4">
        <Star className="size-3 text-[var(--primary)]" />
        Provedores de IA
      </h2>

      <div className="space-y-4">
        {providers.map((p, i) => {
          const hasPool = (p.poolCount ?? 0) > 0 || (p.poolSlots?.length ?? 0) > 0;
          const isFirstKey = !hasPool;

          return (
            <motion.div
              key={p.id}
              id={`forge-key-${p.id}`}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 + i * 0.03 }}
              className="p-5 rounded-xl border border-[var(--border)] bg-[var(--surface-1)]/30 scroll-mt-24"
            >
              <div className="flex items-start gap-4 mb-4">
                <div
                  className={`size-12 rounded-lg border grid place-items-center shrink-0 ${
                    p.status === "connected"
                      ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-400"
                      : "border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-dim)]"
                  }`}
                >
                  {p.icon}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-mono text-[13px]">{p.label}</h3>
                    {p.status === "connected" && (
                      <span className="font-mono text-[8px] text-emerald-400 px-1.5 py-0.5 rounded bg-emerald-400/10">
                        {p.poolCount && p.poolCount > 1 ? `POOL · ${p.poolCount} chaves` : "CONECTADO"}
                      </span>
                    )}
                    {p.costPerM === 0 && (
                      <span className="font-mono text-[8px] text-emerald-400/70">GRATUITO</span>
                    )}
                  </div>
                  <p className="font-mono text-[9px] text-[var(--text-ghost)] mt-1">{p.description}</p>
                </div>
                <a
                  href={p.docUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-[9px] text-[var(--text-ghost)] hover:text-[var(--foreground)] shrink-0"
                >
                  Docs <ExternalLink className="size-3 inline" />
                </a>
              </div>

              <div className="ml-16 flex flex-col gap-2">
                {p.supportsPool && hasPool && (
                  <ApiKeyPoolSection
                    poolSlots={p.poolSlots ?? []}
                    poolCount={p.poolCount ?? 0}
                    pulse={pulseId === p.id}
                    busy={savingId === p.id}
                    onRemoveSlot={(keyId) => void handleRemoveSlot(p.id, keyId)}
                    onRemoveAll={() => void handleDelete(p.id)}
                  />
                )}

                {p.supportsPool && (
                  <p className="font-mono text-[8px] text-[var(--text-ghost)] leading-relaxed">
                    {isFirstKey
                      ? "Primeira chave: use «Salvar chave» ou «Adicionar ao pool» (equivalente com 1 entrada)."
                      : "«Adicionar ao pool» empilha outra chave. «Substituir tudo» apaga o pool e deixa só a chave colada."}
                  </p>
                )}

                <ApiKeyInput
                  label={`Chave ${p.label}`}
                  value={p.keyValue}
                  onChange={(v) =>
                    setProviders((prev) => prev.map((x) => (x.id === p.id ? { ...x, keyValue: v } : x)))
                  }
                  onDelete={() => void handleDelete(p.id)}
                  provider={p.provider}
                  placeholder={p.keyPrefix + "..."}
                  saved={p.status === "connected"}
                  disabled={savingId === p.id}
                />
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    className="bg-[var(--primary)] text-[#0a0a0a]"
                    disabled={savingId === p.id || !p.keyValue.trim()}
                    onClick={() => void handleSave(p.id, false)}
                  >
                    {savingId === p.id
                      ? "Salvando…"
                      : p.supportsPool && hasPool
                        ? "Substituir tudo (1 chave)"
                        : "Salvar chave"}
                  </Button>
                  {p.supportsPool && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={savingId === p.id || !p.keyValue.trim()}
                      onClick={() => void handleSave(p.id, true)}
                    >
                      {savingId === p.id ? "Adicionando…" : "Adicionar ao pool"}
                    </Button>
                  )}
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      <p className="mt-10 font-mono text-[10px] text-[var(--text-dim)]">
        Preset do agente, modo Fixo/Auto/ROBIN e STT →{" "}
        <Link to="/models" className="text-[var(--primary)] hover:underline">
          Modelos
        </Link>
      </p>
    </div>
  );
}