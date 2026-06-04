import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Brain, Shuffle, Zap, Info, Mic, Globe } from "lucide-react";
import {
  type AgentPreferences,
  type ModelPowerMode,
  type PoolProviderId,
  type SttProviderId,
  loadAgentPreferences,
  saveAgentPreferences,
} from "@/lib/agent-preferences";
import { PROVIDER_PRESETS } from "@/components/editor/ProviderSelector";

const MODES: {
  id: ModelPowerMode;
  title: string;
  description: string;
  icon: React.ReactNode;
}[] = [
  {
    id: "auto",
    title: "Router automático",
    description:
      "Classifica cada pedido e escolhe modelo barato ou forte automaticamente.",
    icon: <Brain className="size-4" />,
  },
  {
    id: "robin",
    title: "ROBIN (pool de chaves)",
    description:
      "Troca de chave a cada requisição no pool (NVIDIA/Groq) para mitigar rate limit.",
    icon: <Shuffle className="size-4" />,
  },
  {
    id: "fixed",
    title: "Modelo fixo",
    description: "Sempre o mesmo modelo — sem roteamento automático.",
    icon: <Zap className="size-4" />,
  },
];

const MODEL_OPTIONS = PROVIDER_PRESETS.filter((p) => !p.customKey);

export function ModelPowerPanel() {
  const [prefs, setPrefs] = useState<AgentPreferences>(() => loadAgentPreferences());

  useEffect(() => {
    saveAgentPreferences(prefs);
  }, [prefs]);

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-10 rounded-xl border border-[var(--border)] bg-[var(--surface-1)]/40 p-5"
    >
      <h2 className="flex items-center gap-2 font-mono text-[10px] tracking-[0.2em] uppercase text-[var(--text-dim)] mb-1">
        <Zap className="size-3 text-[var(--primary)]" />
        Modelo e voz
      </h2>
      <p className="font-mono text-[9px] text-[var(--text-ghost)] mb-4 leading-relaxed">
        Escolha aqui como o agente e o microfone funcionam. No editor, o seletor de modelo segue estas
        preferências.
      </p>

      <div className="grid gap-3 sm:grid-cols-3 mb-5">
        {MODES.map((m) => {
          const active = prefs.mode === m.id;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => setPrefs((p) => ({ ...p, mode: m.id }))}
              className={`text-left p-4 rounded-lg border transition-colors ${
                active
                  ? "border-[var(--primary)]/50 bg-[var(--primary)]/8"
                  : "border-[var(--border)] hover:bg-[var(--surface-2)]"
              }`}
            >
              <div
                className={`mb-2 inline-flex size-8 items-center justify-center rounded-lg border ${
                  active
                    ? "border-[var(--primary)]/30 text-[var(--primary)]"
                    : "border-[var(--border)] text-[var(--text-dim)]"
                }`}
              >
                {m.icon}
              </div>
              <div className="font-mono text-[11px] text-[var(--foreground)]">{m.title}</div>
              <p className="mt-1 font-mono text-[9px] text-[var(--text-ghost)] leading-relaxed">
                {m.description}
              </p>
            </button>
          );
        })}
      </div>

      <div className="rounded-lg border border-[var(--border-strong,var(--border))] bg-[var(--surface-2)]/50 p-4 mb-4">
        <label className="font-mono text-[9px] uppercase tracking-wider text-[var(--text-dim)]">
          Modelo do agente (chat / código)
        </label>
        {prefs.mode === "auto" && (
          <p className="mt-2 font-mono text-[10px] text-[var(--text-ghost)]">
            Modo automático: o router escolhe entre modelos barato e forte conforme a complexidade do pedido.
            Cadastre pelo menos uma chave abaixo (Anthropic, Groq, NVIDIA, etc.).
          </p>
        )}
        {prefs.mode === "robin" && (
          <div className="mt-2 space-y-2">
            <select
              value={prefs.poolProvider ?? "groq"}
              onChange={(e) =>
                setPrefs((p) => ({ ...p, poolProvider: e.target.value as PoolProviderId }))
              }
              className="w-full max-w-xs rounded-md border border-[var(--border)] bg-[var(--surface-1)] px-3 py-2 font-mono text-[11px]"
            >
              <option value="groq">Groq · Llama 3.3 (pool)</option>
              <option value="nvidia">NVIDIA NIM · Llama 3.1 8B (pool)</option>
            </select>
            <p className="font-mono text-[9px] text-[var(--text-ghost)] flex items-start gap-1.5">
              <Info className="size-3 shrink-0 mt-0.5" />
              Use o pool do provedor selecionado. Adicione chaves na seção NVIDIA ou Groq abaixo.
            </p>
          </div>
        )}
        {prefs.mode === "fixed" && (
          <select
            value={prefs.fixedPresetId ?? "anthropic-sonnet"}
            onChange={(e) => setPrefs((p) => ({ ...p, fixedPresetId: e.target.value }))}
            className="mt-2 w-full max-w-md rounded-md border border-[var(--border)] bg-[var(--surface-1)] px-3 py-2 font-mono text-[11px]"
          >
            {MODEL_OPTIONS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label} · {p.provider}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)]/30 p-4">
        <label className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-wider text-[var(--text-dim)]">
          <Mic className="size-3" />
          Voz (STT) no microfone
        </label>
        <select
          value={prefs.sttProvider ?? "grok"}
          onChange={(e) =>
            setPrefs((p) => ({ ...p, sttProvider: e.target.value as SttProviderId }))
          }
          className="mt-2 w-full max-w-xs rounded-md border border-[var(--border)] bg-[var(--surface-1)] px-3 py-2 font-mono text-[11px]"
        >
          <option value="grok">Grok STT (xAI) — recomendado</option>
          <option value="groq">Groq Whisper (fallback)</option>
        </select>
        <p className="mt-2 font-mono text-[9px] text-[var(--text-ghost)] flex items-start gap-1.5">
          <Globe className="size-3 shrink-0 mt-0.5" />
          Cadastre a chave xAI ou Groq em &quot;Provedores de IA&quot; abaixo. Grok usa{" "}
          <code className="text-[var(--text-dim)]">api.x.ai/v1/stt</code>.
        </p>
      </div>
    </motion.section>
  );
}