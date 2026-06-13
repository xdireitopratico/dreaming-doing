// API — chaves de provedores (BYOK), pool ROBIN, edge-only
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useCallback, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { toast } from "@/lib/toast";
import {
  ArrowLeft,
  Shield,
  CheckCircle2,
  AlertCircle,
  Star,
  ExternalLink,
  Plug,
  Zap,
  Brain,
  Globe,
  Cpu,
  Gem,
  Box,
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
import { isE2bConfigured, isE2bConnected, isE2bHealthOk } from "@/lib/e2b-status";
import { testE2bApiKey, type E2bHealthResponse } from "@/lib/test-e2b-key";
import {
  disconnectOllamaConnector,
  readOllamaMetaFromRows,
  saveOllamaConnector,
} from "@/lib/save-ollama-connector";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MotorInfraSection } from "@/components/connectors/MotorInfraSection";
import { useAdmin } from "@/lib/forge-admin";

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
    id: "alibaba",
    provider: "Alibaba",
    label: "Alibaba (DashScope)",
    icon: <Globe className="size-5" />,
    description: "Qwen direto na API DashScope — bônus e modelos próprios da Alibaba.",
    docUrl: "https://dashscope.console.aliyun.com",
    keyPrefix: "sk-",
    costPerM: 0.5,
    status: "available",
    keyValue: "",
  },
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
    id: "deepseek",
    provider: "DeepSeek",
    label: "DeepSeek",
    icon: <Brain className="size-5" />,
    description: "DeepSeek V3/V4 — API nativa (não só via OpenRouter).",
    docUrl: "https://platform.deepseek.com",
    keyPrefix: "sk-",
    costPerM: 0.2,
    status: "available",
    keyValue: "",
  },
  {
    id: "gemini",
    provider: "Google",
    label: "Google Gemini",
    icon: <Gem className="size-5" />,
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
    description: "Grok 3 / Mini — modelos de código. Voz: configure em Modelos.",
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
    id: "minimax",
    provider: "MiniMax",
    label: "MiniMax",
    icon: <Brain className="size-5" />,
    description: "MiniMax M3 / M2.7 — API nativa (platform.minimax.io).",
    docUrl: "https://platform.minimax.io",
    keyPrefix: "sk-",
    costPerM: 0.3,
    status: "available",
    keyValue: "",
  },
  {
    id: "moonshotai",
    provider: "Moonshot",
    label: "Moonshot (Kimi)",
    icon: <Globe className="size-5" />,
    description: "Kimi K2.5 / K2.6 — API Moonshot (platform.kimi.ai).",
    docUrl: "https://platform.kimi.ai",
    keyPrefix: "sk-",
    costPerM: 0.4,
    status: "available",
    keyValue: "",
  },
  {
    id: "openrouter",
    provider: "OpenRouter",
    label: "OpenRouter",
    icon: <Globe className="size-5" />,
    description: "Zhipu e outros sem API dedicada no app.",
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
  {
    id: "xiaomi",
    provider: "Xiaomi",
    label: "Xiaomi (MiMo)",
    icon: <Box className="size-5" />,
    description: "MiMo V2.5 Pro — API nativa Xiaomi (platform.xiaomimimo.com).",
    docUrl: "https://platform.xiaomimimo.com",
    keyPrefix: "sk-",
    costPerM: 0.3,
    status: "available",
    keyValue: "",
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
  const { isAdmin } = useAdmin();
  const qc = useQueryClient();
  const [providers, setProviders] = useState(INITIAL);
  const [e2bKeyValue, setE2bKeyValue] = useState("");
  const [e2bConnected, setE2bConnected] = useState(false);
  const [e2bHealth, setE2bHealth] = useState<E2bHealthResponse | null>(null);
  const [e2bTesting, setE2bTesting] = useState(false);
  const [ollamaBaseUrl, setOllamaBaseUrl] = useState("http://localhost:11434");
  const [ollamaModel, setOllamaModel] = useState("llama3.2");
  const [ollamaApiKey, setOllamaApiKey] = useState("");
  const [ollamaConnected, setOllamaConnected] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [pulseId, setPulseId] = useState<string | null>(null);
  const robinMode = loadAgentPreferences().mode === "robin";

  const { data: connectorRows } = useQuery({
    queryKey: ["connectors-public", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("connectors_public")
        .select("kind, meta, provider")
        .eq("owner_id", user!.id);
      if (error) throw error;
      return (data ?? []) as {
        kind: string;
        meta: Record<string, unknown> | null;
        provider?: string | null;
      }[];
    },
  });

  useEffect(() => {
    if (!connectorRows) return;
    const e2bRow = connectorRows.find((r) => r.kind === "e2b");
    setE2bConnected(isE2bConnected(connectorRows));
    if (isE2bHealthOk(e2bRow?.meta)) {
      setE2bHealth({
        ok: true,
        templateUsed: (e2bRow?.meta as { e2bTemplate?: string })?.e2bTemplate,
        nodeVersion: (e2bRow?.meta as { e2bNodeVersion?: string })?.e2bNodeVersion,
        npmVersion: (e2bRow?.meta as { e2bNpmVersion?: string })?.e2bNpmVersion,
      });
    } else if (!isE2bConfigured(connectorRows)) {
      setE2bHealth(null);
    }
    const ollamaMeta = readOllamaMetaFromRows(connectorRows);
    setOllamaConnected(!!ollamaMeta);
    if (ollamaMeta) {
      setOllamaBaseUrl(ollamaMeta.baseUrl);
      setOllamaModel(ollamaMeta.defaultModel);
    }
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
        } else {
          const res = await saveAiProviderKey(id, p.keyValue);
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
    [qc],
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

  const connectedCount =
    providers.filter((p) => p.status === "connected").length +
    (e2bConnected ? 1 : 0) +
    (ollamaConnected ? 1 : 0);

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
              LLM do motor Prometheus + sandbox E2B + pool ROBIN. Firecrawl infra abaixo. Modelos e STT em Modelos.
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
        <Link
          to="/connectors"
          className="font-mono text-[10px] text-[var(--primary)] hover:underline"
        >
          <Plug className="size-3 inline mr-1" />
          Conectores →
        </Link>
      </motion.div>

      {robinMode && (
        <p className="mb-6 font-mono text-[9px] text-amber-400/90 px-3 py-2 rounded border border-amber-400/20 bg-amber-400/5">
          Modo ROBIN ativo: use &quot;Adicionar ao pool&quot; em Groq ou NVIDIA — o contador e a
          lista abaixo atualizam na hora. O agente troca de chave a cada requisição.
        </p>
      )}

      <nav
        aria-label="Atalhos nesta página"
        className="mb-6 flex flex-wrap gap-2 font-mono text-[9px]"
      >
        <a
          href="#forge-motor-infra"
          className="px-2 py-1 rounded border border-orange-400/30 text-orange-400/90 hover:border-orange-400/50"
        >
          Motor Prometheus
        </a>
        <a
          href="#forge-key-ollama"
          className="px-2 py-1 rounded border border-[var(--border)] hover:border-[var(--primary)]/50"
        >
          Ollama
        </a>
        <a
          href="#forge-key-e2b"
          className="px-2 py-1 rounded border border-[var(--border)] hover:border-[var(--primary)]/50"
        >
          E2B
        </a>
        <a
          href="#forge-key-groq"
          className="px-2 py-1 rounded border border-[var(--border)] hover:border-[var(--primary)]/50"
        >
          Provedores IA
        </a>
        <Link
          to="/models"
          className="px-2 py-1 rounded border border-[var(--primary)]/30 text-[var(--primary)]"
        >
          Modelos + STT →
        </Link>
      </nav>

      <MotorInfraSection
        llmConnectedCount={providers.filter((p) => p.status === "connected").length}
      />

      <h2 className="flex items-center gap-2 font-mono text-[10px] tracking-[0.2em] uppercase text-[var(--text-dim)] mb-4">
        <Cpu className="size-3 text-[var(--primary)]" />
        Ollama (local)
      </h2>

      <motion.div
        id="forge-key-ollama"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8 p-5 rounded-xl border border-[var(--border)] bg-[var(--surface-1)]/30 scroll-mt-24"
      >
        <p className="font-mono text-[9px] text-[var(--text-ghost)] mb-4 leading-relaxed">
          O agente roda na nuvem (Supabase).{" "}
          <code className="text-[var(--text-dim)]">localhost</code> só funciona se você expuser o
          Ollama com túnel HTTPS (ngrok, Cloudflare Tunnel, etc.). Modelos em{" "}
          <Link to="/models" className="text-[var(--primary)] underline">
            Modelos
          </Link>{" "}
          → ambiente Ollama.
        </p>
        <div className="grid gap-3 sm:grid-cols-2 mb-3">
          <div>
            <Label className="font-mono text-[9px] text-[var(--text-dim)]">
              URL base do Ollama
            </Label>
            <Input
              value={ollamaBaseUrl}
              onChange={(e) => setOllamaBaseUrl(e.target.value)}
              placeholder="https://seu-tunnel.ngrok.app"
              className="mt-1 font-mono text-xs"
              disabled={savingId === "ollama"}
            />
          </div>
          <div>
            <Label className="font-mono text-[9px] text-[var(--text-dim)]">
              Modelo padrão (tag Ollama)
            </Label>
            <Input
              value={ollamaModel}
              onChange={(e) => setOllamaModel(e.target.value)}
              placeholder="llama3.2"
              className="mt-1 font-mono text-xs"
              disabled={savingId === "ollama"}
            />
          </div>
        </div>
        <ApiKeyInput
          label="Chave API (opcional)"
          value={ollamaApiKey}
          onChange={setOllamaApiKey}
          onDelete={ollamaConnected ? () => void handleDeleteOllama() : undefined}
          provider="ollama"
          placeholder="só se o proxy exigir auth"
          saved={ollamaConnected}
          disabled={savingId === "ollama"}
        />
        <div className="flex flex-wrap gap-2 mt-3">
          <Button
            type="button"
            size="sm"
            className="bg-[var(--primary)] text-[#0a0a0a]"
            disabled={savingId === "ollama" || !ollamaBaseUrl.trim()}
            onClick={() => void handleSaveOllama()}
          >
            {savingId === "ollama"
              ? "Salvando…"
              : ollamaConnected
                ? "Atualizar Ollama"
                : "Salvar Ollama"}
          </Button>
          <a
            href="https://github.com/ollama/ollama/blob/main/docs/faq.md"
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-[9px] text-[var(--text-ghost)] hover:text-[var(--foreground)] self-center"
          >
            Docs Ollama <ExternalLink className="size-3 inline" />
          </a>
        </div>
      </motion.div>

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
        {e2bHealth && (
          <p
            className={`font-mono text-[9px] mb-3 ${
              e2bHealth.ok ? "text-[var(--success)]" : "text-[var(--destructive)]"
            }`}
          >
            {e2bHealth.ok
              ? `OK · template ${e2bHealth.templateUsed ?? "?"} · ${e2bHealth.nodeVersion ?? ""} · ${e2bHealth.npmVersion ?? ""}`
              : `Falha: ${e2bHealth.error ?? "teste não passou"}`}
          </p>
        )}
        <div className="mt-2 flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            className="bg-[var(--primary)] text-[#0a0a0a]"
            disabled={savingId === "e2b" || !e2bKeyValue.trim()}
            onClick={() => void handleSaveE2b()}
          >
            {savingId === "e2b"
              ? "Validando sandbox…"
              : e2bConnected
                ? "Atualizar chave"
                : "Salvar e validar E2B"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={e2bTesting || savingId === "e2b" || (!e2bKeyValue.trim() && !e2bConnected)}
            onClick={() => void handleTestE2b()}
          >
            {e2bTesting ? "Testando…" : "Testar sandbox"}
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
                        {p.poolCount && p.poolCount > 1
                          ? `POOL · ${p.poolCount} chaves`
                          : "CONECTADO"}
                      </span>
                    )}
                    {p.costPerM === 0 && (
                      <span className="font-mono text-[8px] text-emerald-400/70">GRATUITO</span>
                    )}
                  </div>
                  <p className="font-mono text-[9px] text-[var(--text-ghost)] mt-1">
                    {p.description}
                  </p>
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
                    setProviders((prev) =>
                      prev.map((x) => (x.id === p.id ? { ...x, keyValue: v } : x)),
                    )
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
