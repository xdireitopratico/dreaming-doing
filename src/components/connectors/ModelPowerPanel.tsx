import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Brain, Shuffle, Zap, Mic, Sparkles, Check } from "lucide-react";
import {
  type AgentPreferences,
  type ModelPowerMode,
  type PoolProviderId,
  type SttProviderId,
  loadAgentPreferences,
  saveAgentPreferences,
} from "@/lib/agent-preferences";
import {
  CODING_MODEL_PRESETS,
  AI_ENV_META,
  STT_OPTIONS,
  poolPresetsForProvider,
  presetsByEnvGrouped,
  getPresetById,
  normalizePresetId,
  type AiEnvId,
} from "@/lib/model-catalog";

const MODES: {
  id: ModelPowerMode;
  title: string;
  description: string;
  icon: React.ReactNode;
}[] = [
  {
    id: "auto",
    title: "Router automático",
    description: "Escolhe modelo barato ou frontier conforme a complexidade do pedido.",
    icon: <Brain className="size-4" />,
  },
  {
    id: "robin",
    title: "ROBIN (pool)",
    description: "Rotação de chaves no Groq ou NVIDIA — só modelos 70B+ para código.",
    icon: <Shuffle className="size-4" />,
  },
  {
    id: "fixed",
    title: "Modelo fixo",
    description: "Você escolhe o ambiente (Gemini, Claude, Grok…) e o modelo exato.",
    icon: <Zap className="size-4" />,
  },
];

function ModelCard({
  active,
  label,
  description,
  badges,
  onClick,
}: {
  active: boolean;
  label: string;
  description: string;
  badges?: string[];
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left p-3 rounded-lg border transition-all ${
        active
          ? "border-[var(--primary)]/60 bg-[var(--primary)]/10 ring-1 ring-[var(--primary)]/20"
          : "border-[var(--border)] hover:bg-[var(--surface-2)]/80"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-mono text-[11px] text-[var(--foreground)]">{label}</div>
          <p className="mt-0.5 font-mono text-[9px] text-[var(--text-ghost)] leading-relaxed">
            {description}
          </p>
          {badges && badges.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {badges.map((b) => (
                <span
                  key={b}
                  className="font-mono text-[7px] uppercase px-1 py-0.5 rounded bg-[var(--surface-2)] text-[var(--text-dim)]"
                >
                  {b}
                </span>
              ))}
            </div>
          )}
        </div>
        {active && <Check className="size-4 text-[var(--primary)] shrink-0" />}
      </div>
    </button>
  );
}

export function ModelPowerPanel() {
  const [prefs, setPrefs] = useState<AgentPreferences>(() => loadAgentPreferences());
  const [fixedEnv, setFixedEnv] = useState<AiEnvId>(() => getPresetById(prefs.fixedPresetId).env);

  useEffect(() => {
    saveAgentPreferences(prefs);
  }, [prefs]);

  useEffect(() => {
    const p = getPresetById(prefs.fixedPresetId);
    setFixedEnv(p.env);
  }, [prefs.fixedPresetId]);

  const poolProvider = prefs.poolProvider ?? "groq";
  const poolModels = poolPresetsForProvider(poolProvider);
  const fixedModels = CODING_MODEL_PRESETS.filter((m) => m.env === fixedEnv);

  const patch = (partial: Partial<AgentPreferences>) =>
    setPrefs((p) => ({ ...p, ...partial }));

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
      <p className="font-mono text-[9px] text-[var(--text-ghost)] mb-4 leading-relaxed max-w-2xl">
        Ambientes de fronteira (Claude, Gemini, Grok, GPT, Groq 70B, NVIDIA NIM). Sem modelos fracos —
        o agente só lista opções úteis para programação. Cadastre a chave do ambiente abaixo.
      </p>

      <div className="grid gap-3 sm:grid-cols-3 mb-6">
        {MODES.map((m) => {
          const active = prefs.mode === m.id;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => patch({ mode: m.id })}
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
              <div className="font-mono text-[11px]">{m.title}</div>
              <p className="mt-1 font-mono text-[9px] text-[var(--text-ghost)] leading-relaxed">
                {m.description}
              </p>
            </button>
          );
        })}
      </div>

      {prefs.mode === "auto" && (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)]/40 p-4 mb-5">
          <p className="font-mono text-[10px] text-[var(--text-ghost)] leading-relaxed">
            Prioridade automática: Anthropic → Gemini → xAI → Groq 70B → NVIDIA 70B → OpenAI.
            Conecte pelo menos um provedor em &quot;Provedores de IA&quot;.
          </p>
        </div>
      )}

      {prefs.mode === "robin" && (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)]/40 p-4 mb-5 space-y-4">
          <div>
            <label className="font-mono text-[9px] uppercase tracking-wider text-[var(--text-dim)]">
              Ambiente do pool
            </label>
            <div className="flex flex-wrap gap-2 mt-2">
              {(["groq", "nvidia"] as PoolProviderId[]).map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() =>
                    patch({
                      poolProvider: id,
                      robinPoolModelId:
                        id === "groq" ? "groq-llama70" : "nvidia-llama70",
                    })
                  }
                  className={`font-mono text-[10px] px-3 py-1.5 rounded-md border ${
                    poolProvider === id
                      ? "border-[var(--primary)]/50 bg-[var(--primary)]/10 text-[var(--primary)]"
                      : "border-[var(--border)] text-[var(--text-dim)]"
                  }`}
                >
                  {AI_ENV_META[id].label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="font-mono text-[9px] uppercase tracking-wider text-[var(--text-dim)]">
              Modelo no pool (código)
            </label>
            <div className="grid gap-2 mt-2 sm:grid-cols-2">
              {poolModels.map((m) => (
                <ModelCard
                  key={m.id}
                  active={normalizePresetId(prefs.robinPoolModelId) === m.id}
                  label={m.label}
                  description={m.description}
                  badges={[m.model, m.tier === "frontier" ? "frontier" : "70B+"]}
                  onClick={() => patch({ robinPoolModelId: m.id })}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {prefs.mode === "fixed" && (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)]/40 p-4 mb-5 space-y-4">
          <div>
            <label className="font-mono text-[9px] uppercase tracking-wider text-[var(--text-dim)]">
              1 · Ambiente (provedor)
            </label>
            <div className="flex flex-wrap gap-2 mt-2">
              {presetsByEnvGrouped().map(({ env, meta }) => (
                <button
                  key={env}
                  type="button"
                  onClick={() => {
                    setFixedEnv(env);
                    const first = CODING_MODEL_PRESETS.find((m) => m.env === env);
                    if (first) patch({ fixedPresetId: first.id });
                  }}
                  className={`font-mono text-[10px] px-3 py-1.5 rounded-md border inline-flex items-center gap-1.5 ${
                    fixedEnv === env
                      ? "border-[var(--primary)]/50 bg-[var(--primary)]/10 text-[var(--primary)]"
                      : "border-[var(--border)] text-[var(--text-dim)]"
                  }`}
                >
                  {env === "gemini" && <Sparkles className="size-3" />}
                  {meta.label}
                </button>
              ))}
            </div>
            <p className="mt-2 font-mono text-[8px] text-[var(--text-ghost)]">
              Chave: {AI_ENV_META[fixedEnv].keyPrefix}… —{" "}
              <a
                href={AI_ENV_META[fixedEnv].docUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--primary)] hover:underline"
              >
                obter em {AI_ENV_META[fixedEnv].label}
              </a>
            </p>
          </div>
          <div>
            <label className="font-mono text-[9px] uppercase tracking-wider text-[var(--text-dim)]">
              2 · Modelo para programação
            </label>
            <div className="grid gap-2 mt-2 sm:grid-cols-2">
              {fixedModels.map((m) => (
                <ModelCard
                  key={m.id}
                  active={normalizePresetId(prefs.fixedPresetId) === m.id}
                  label={m.label}
                  description={m.description}
                  badges={[
                    m.tier === "frontier" ? "frontier" : m.tier,
                    m.costPerMInput === 0 ? "grátis/barato" : `$${m.costPerMInput}/M`,
                  ].filter(Boolean) as string[]}
                  onClick={() => patch({ fixedPresetId: m.id })}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)]/30 p-4">
        <label className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-wider text-[var(--text-dim)] mb-3">
          <Mic className="size-3" />
          Voz (STT) — pareado com o ambiente
        </label>
        <div className="grid gap-2 sm:grid-cols-2">
          {STT_OPTIONS.map((opt) => (
            <ModelCard
              key={opt.id}
              active={(prefs.sttProvider ?? "grok") === opt.id}
              label={opt.label}
              description={opt.description}
              badges={[
                opt.recommended ? "recomendado" : "fallback",
                `chave ${AI_ENV_META[opt.requiresEnv].label}`,
              ]}
              onClick={() => patch({ sttProvider: opt.id as SttProviderId })}
            />
          ))}
        </div>
        <p className="mt-3 font-mono text-[8px] text-[var(--text-ghost)]">
          Grok STT usa a mesma conta xAI do modelo Grok. Whisper usa chave Groq.
        </p>
      </div>
    </motion.section>
  );
}