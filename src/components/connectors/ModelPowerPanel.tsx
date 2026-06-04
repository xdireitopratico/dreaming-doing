import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Brain, Shuffle, Zap, Info } from "lucide-react";
import {
  type AgentPreferences,
  type ModelPowerMode,
  type PoolProviderId,
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
      "Classifica cada pedido e usa modelo barato para tarefas simples e modelo forte para código complexo.",
    icon: <Brain className="size-4" />,
  },
  {
    id: "robin",
    title: "ROBIN (pool de chaves)",
    description:
      "A cada requisição ao modelo, troca de chave no pool (ex.: 5–10 keys NVIDIA/Groq) para mitigar rate limit gratuito.",
    icon: <Shuffle className="size-4" />,
  },
  {
    id: "fixed",
    title: "Modelo fixo",
    description: "Sempre usa o provedor que você escolher no editor — sem roteamento automático.",
    icon: <Zap className="size-4" />,
  },
];

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
        Potência do modelo
      </h2>
      <p className="font-mono text-[9px] text-[var(--text-ghost)] mb-4 leading-relaxed">
        Define como o agente escolhe o LLM em cada execução. Preferências salvas só neste navegador — chaves
        continuam criptografadas no Supabase.
      </p>

      <div className="grid gap-3 sm:grid-cols-3 mb-4">
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

      {prefs.mode === "robin" && (
        <div className="mb-4 p-3 rounded-lg border border-amber-400/20 bg-amber-400/5">
          <label className="font-mono text-[9px] uppercase tracking-wider text-amber-400/90">
            Pool para rotação
          </label>
          <select
            value={prefs.poolProvider ?? "groq"}
            onChange={(e) =>
              setPrefs((p) => ({ ...p, poolProvider: e.target.value as PoolProviderId }))
            }
            className="mt-2 w-full max-w-xs rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 font-mono text-[11px] text-[var(--foreground)]"
          >
            <option value="groq">Groq (gratuito, rate limit por key)</option>
            <option value="nvidia">NVIDIA NIM (gratuito, rate limit por key)</option>
          </select>
          <p className="mt-2 flex items-start gap-1.5 font-mono text-[9px] text-[var(--text-ghost)]">
            <Info className="size-3 shrink-0 mt-0.5" />
            Adicione várias chaves do mesmo provedor com &quot;Adicionar ao pool&quot;. O ROBIN alterna a chave a
            cada chamada ao LLM e avisa se alguma key bater no rate limit.
          </p>
        </div>
      )}

      {prefs.mode === "fixed" && (
        <div className="mb-2">
          <label className="font-mono text-[9px] uppercase tracking-wider text-[var(--text-dim)]">
            Modelo fixo
          </label>
          <select
            value={prefs.fixedPresetId ?? "anthropic-sonnet"}
            onChange={(e) => setPrefs((p) => ({ ...p, fixedPresetId: e.target.value }))}
            className="mt-2 w-full max-w-md rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 font-mono text-[11px] text-[var(--foreground)]"
          >
            {PROVIDER_PRESETS.filter((p) => !p.customKey).map((p) => (
              <option key={p.id} value={p.id}>
                {p.label} · {p.provider}
              </option>
            ))}
          </select>
        </div>
      )}
    </motion.section>
  );
}