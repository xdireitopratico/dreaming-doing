// connectors.tsx — Página de gerenciamento de chaves API e integrações
// UI nível 1Password: inputs mascarados, status dos providers, badges
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useCallback } from "react";
import { motion } from "framer-motion";
import { MarketingShell } from "@/components/MarketingShell";
import { ApiKeyInput } from "@/components/connectors/ApiKeyInput";
import {
  Key, Zap, Brain, Globe, Cpu, Cloud, Database, GitBranch,
  Plug, Shield, CheckCircle2, AlertCircle, ChevronRight, ExternalLink,
  Star, Info, ArrowLeft,
} from "lucide-react";

export const Route = createFileRoute("/connectors")({
  component: () => (
    <MarketingShell requireAuth>
      <Connectors />
    </MarketingShell>
  ),
});

interface ProviderConfig {
  id: string;
  provider: string;
  model: string;
  label: string;
  icon: React.ReactNode;
  description: string;
  docUrl: string;
  keyPrefix: string;
  costPerM: number;
  status: "connected" | "available" | "coming-soon";
  keyValue: string;
}

const spring = {
  type: "spring" as const,
  stiffness: 500,
  damping: 34,
};

function Connectors() {
  const [providers, setProviders] = useState<ProviderConfig[]>([
    {
      id: "anthropic",
      provider: "Anthropic",
      model: "Claude Sonnet 4",
      label: "Anthropic",
      icon: <Zap className="size-5" />,
      description: "Claude Sonnet 4, Opus, Haiku. Melhor para código complexo e raciocínio profundo.",
      docUrl: "https://console.anthropic.com",
      keyPrefix: "sk-ant-",
      costPerM: 3.0,
      status: "connected",
      keyValue: "",
    },
    {
      id: "openai",
      provider: "OpenAI",
      model: "GPT-4o",
      label: "OpenAI",
      icon: <Brain className="size-5" />,
      description: "GPT-4o, GPT-4o-mini. Multimodal com visão, código, ferramentas.",
      docUrl: "https://platform.openai.com",
      keyPrefix: "sk-proj-",
      costPerM: 2.5,
      status: "available",
      keyValue: "",
    },
    {
      id: "xai",
      provider: "xAI",
      model: "Grok 3",
      label: "xAI",
      icon: <Globe className="size-5" />,
      description: "Grok 3 Mini. Rápido, econômico, bom para iterações rápidas.",
      docUrl: "https://console.x.ai",
      keyPrefix: "xai-",
      costPerM: 0.5,
      status: "connected",
      keyValue: "",
    },
    {
      id: "groq",
      provider: "Groq",
      model: "Llama 4 Scout",
      label: "Groq",
      icon: <Cpu className="size-5" />,
      description: "Llama via Groq LPU. Latência ultra-baixa, inferência gratuita.",
      docUrl: "https://console.groq.com",
      keyPrefix: "gsk_",
      costPerM: 0,
      status: "connected",
      keyValue: "",
    },
  ]);

  const [integrations] = useState([
    {
      id: "github",
      name: "GitHub",
      desc: "Sincronização bidirecional do código com seu repositório."
        + " Push, pull, PRs direto do editor.",
      icon: GitBranch,
      status: "coming-soon" as const,
    },
    {
      id: "supabase",
      name: "Supabase próprio",
      desc: "Aponte para uma instância self-hosted. Seus dados, sua infra.",
      icon: Database,
      status: "coming-soon" as const,
    },
    {
      id: "cloudflare",
      name: "Cloudflare Pages",
      desc: "Deploy em edge global com um clique. Domínio personalizado, SSL automático.",
      icon: Cloud,
      status: "coming-soon" as const,
    },
    {
      id: "mcp",
      name: "Servidores MCP",
      desc: "Conecte qualquer ferramenta via Model Context Protocol."
        + " Handshake automático, tools dinâmicas.",
      icon: Plug,
      status: "coming-soon" as const,
    },
  ]);

  const handleKeyChange = useCallback((id: string, value: string) => {
    setProviders((prev) =>
      prev.map((p) => (p.id === id ? { ...p, keyValue: value } : p)),
    );
  }, []);

  const handleDeleteKey = useCallback((id: string) => {
    setProviders((prev) =>
      prev.map((p) => (p.id === id ? { ...p, keyValue: "" } : p)),
    );
  }, []);

  const connectedCount = providers.filter((p) => p.status === "connected").length;
  const availableCount = providers.filter((p) => p.status === "available").length;

  return (
    <div className="px-6 py-8 max-w-[960px] mx-auto">
      {/* Breadcrumb */}
      <Link
        to="/projects"
        className="inline-flex items-center gap-1.5 font-mono text-[10px] text-[var(--text-ghost)] hover:text-[var(--foreground)] transition-colors mb-6"
      >
        <ArrowLeft className="size-3" />
        PROJETOS
      </Link>

      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-10"
      >
        <div className="flex items-center gap-3 mb-3">
          <div className="size-10 rounded-xl bg-[var(--primary)]/10 border border-[var(--primary)]/20 grid place-items-center">
            <Shield className="size-5 text-[var(--primary)]" />
          </div>
          <div>
            <h1 className="font-display text-3xl tracking-tight">Conectores</h1>
            <p className="font-mono text-[10px] text-[var(--text-dim)] mt-0.5">
              Sua infra, suas ferramentas, plugadas aqui dentro
            </p>
          </div>
        </div>
      </motion.div>

      {/* Status bar */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="flex items-center gap-4 mb-8 px-4 py-3 rounded-lg bg-[var(--surface-1)] border border-[var(--border)]"
      >
        <div className="flex items-center gap-2">
          <CheckCircle2 className="size-4 text-emerald-400" />
          <span className="font-mono text-[10px] text-[var(--foreground)]">
            {connectedCount} provedor{connectedCount !== 1 ? "es" : ""} ativo{connectedCount !== 1 ? "s" : ""}
          </span>
        </div>
        <span className="text-[var(--border)]">|</span>
        <div className="flex items-center gap-2">
          <AlertCircle className="size-4 text-amber-400" />
          <span className="font-mono text-[10px] text-[var(--text-dim)]">
            {availableCount} disponíve{availableCount !== 1 ? "is" : "l"} para configurar
          </span>
        </div>
        <span className="text-[var(--border)]">|</span>
        <span className="flex items-center gap-1.5 font-mono text-[9px] text-[var(--text-ghost)]">
          <Info className="size-3" />
          Suas chaves nunca saem do seu navegador
        </span>
      </motion.div>

      {/* AI Providers section */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="mb-12"
      >
        <h2 className="flex items-center gap-2 font-mono text-[10px] tracking-[0.2em] uppercase text-[var(--text-dim)] mb-4">
          <Star className="size-3 text-[var(--primary)]" />
          PROVEDORES DE IA
        </h2>

        <div className="space-y-4">
          {providers.map((p, i) => (
            <motion.div
              key={p.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...spring, delay: 0.12 + i * 0.04 }}
              className="p-5 rounded-xl border border-[var(--border)] bg-[var(--surface-1)]/30 hover:bg-[var(--surface-1)] transition-colors"
            >
              <div className="flex items-start gap-4 mb-4">
                {/* Icon */}
                <div
                  className={`size-12 rounded-lg border grid place-items-center shrink-0 ${
                    p.status === "connected"
                      ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-400"
                      : "border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-dim)]"
                  }`}
                >
                  {p.icon}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-mono text-[13px] text-[var(--foreground)]">
                      {p.label}
                    </h3>
                    {p.status === "connected" ? (
                      <span className="flex items-center gap-1 font-mono text-[8px] text-emerald-400 px-1.5 py-0.5 rounded bg-emerald-400/10">
                        <CheckCircle2 className="size-3" />
                        CONECTADO
                      </span>
                    ) : (
                      <span className="font-mono text-[8px] text-[var(--text-ghost)] px-1.5 py-0.5 rounded border border-[var(--border)]">
                        DISPONÍVEL
                      </span>
                    )}
                    {p.costPerM > 0 && (
                      <span className="font-mono text-[8px] text-[var(--text-ghost)]">
                        ${p.costPerM}/M tokens
                      </span>
                    )}
                    {p.costPerM === 0 && (
                      <span className="font-mono text-[8px] text-emerald-400/70">
                        GRATUITO
                      </span>
                    )}
                  </div>
                  <p className="font-mono text-[9px] text-[var(--text-ghost)] mt-1 leading-relaxed">
                    {p.description}
                  </p>
                </div>

                {/* Doc link */}
                <a
                  href={p.docUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 font-mono text-[9px] text-[var(--text-ghost)] hover:text-[var(--foreground)] transition-colors shrink-0"
                >
                  Docs
                  <ExternalLink className="size-3" />
                </a>
              </div>

              {/* Key input */}
              <div className="ml-16">
                <ApiKeyInput
                  label={`Chave ${p.label}`}
                  value={p.keyValue}
                  onChange={(v) => handleKeyChange(p.id, v)}
                  onDelete={() => handleDeleteKey(p.id)}
                  provider={p.provider}
                  placeholder={p.keyPrefix + "..."}
                  saved={p.status === "connected"}
                />
              </div>
            </motion.div>
          ))}
        </div>
      </motion.div>

      {/* Integrations section */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <h2 className="flex items-center gap-2 font-mono text-[10px] tracking-[0.2em] uppercase text-[var(--text-dim)] mb-4">
          <Plug className="size-3 text-[var(--text-ghost)]" />
          INTEGRAÇÕES
        </h2>

        <div className="grid grid-cols-2 gap-3">
          {integrations.map((it, i) => {
            const Icon = it.icon;
            return (
              <motion.div
                key={it.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...spring, delay: 0.22 + i * 0.04 }}
                className="p-4 rounded-xl border border-[var(--border)] bg-[var(--surface-1)]/30 flex items-start gap-3 hover:bg-[var(--surface-1)] transition-colors"
              >
                <div className="size-10 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] grid place-items-center shrink-0">
                  <Icon className="size-4 text-[var(--text-ghost)]" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[11px] text-[var(--foreground)]">
                      {it.name}
                    </span>
                    <span className="font-mono text-[8px] text-[var(--text-ghost)] px-1.5 py-0.5 rounded-full border border-[var(--border)]">
                      EM BREVE
                    </span>
                  </div>
                  <p className="font-mono text-[9px] text-[var(--text-ghost)] mt-1 leading-relaxed">
                    {it.desc}
                  </p>
                </div>
                <ChevronRight className="size-4 text-[var(--text-ghost)] shrink-0 mt-1" />
              </motion.div>
            );
          })}
        </div>
      </motion.div>

      {/* Footer */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 }}
        className="mt-12 pt-6 border-t border-[var(--border)] flex items-center justify-between"
      >
        <div className="flex items-center gap-1.5">
          <Shield className="size-3 text-[var(--text-ghost)]" />
          <span className="font-mono text-[9px] text-[var(--text-ghost)]">
            Chaves armazenadas apenas no seu navegador. Criptografia ponta-a-ponta.
          </span>
        </div>
        <Link
          to="/settings"
          className="font-mono text-[9px] text-[var(--primary)] hover:underline"
        >
          Configurações avançadas →
        </Link>
      </motion.div>
    </div>
  );
}
