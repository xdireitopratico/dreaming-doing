/**
 * Estúdio de modelo — ambiente + modelo SEMPRE visíveis (não escondidos no modo auto).
 */
import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { toast } from "sonner";
import {
  Brain,
  Shuffle,
  Zap,
  Mic,
  Sparkles,
  Check,
  CheckCircle2,
  AlertCircle,
  Key,
  Globe,
  Cpu,
  X,
  RotateCcw,
} from "lucide-react";
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
  presetsForEnv,
  getPresetById,
  normalizePresetId,
  PLATFORM_ROBIN_TASTE_PRESET_ID,
  type AiEnvId,
} from "@/lib/model-catalog";
import { isAgentPreferencesConfigured } from "@/lib/agent-setup";
import { type ConnectorRow, connectedEnvsFromRows } from "@/lib/connector-env-status";

const ENV_ICONS: Record<AiEnvId, React.ReactNode> = {
  anthropic: <Zap className="size-4" />,
  gemini: <Sparkles className="size-4" />,
  openai: <Brain className="size-4" />,
  xai: <Globe className="size-4" />,
  groq: <Cpu className="size-4" />,
  nvidia: <Cpu className="size-4" />,
  openrouter: <Globe className="size-4" />,
};

const ENVS: AiEnvId[] = ["anthropic", "openai", "gemini", "xai", "nvidia", "openrouter", "groq"];

const MODES: { id: ModelPowerMode; title: string; hint: string }[] = [
  { id: "fixed", title: "Fixo", hint: "Sempre o modelo escolhido abaixo" },
  { id: "auto", title: "Auto", hint: "Router inteligente entre suas chaves ativas (barato vs forte)" },
  { id: "robin", title: "ROBIN", hint: "Pool de chaves Groq/NVIDIA" },
];

function ModelCard({
  active,
  label,
  description,
  badges,
  disabled,
  onClick,
  onHide,
}: {
  active: boolean;
  label: string;
  description: string;
  badges?: string[];
  disabled?: boolean;
  onClick: () => void;
  onHide?: () => void;
}) {
  return (
    <div
      className={`relative w-full text-left p-3 rounded-lg border transition-all ${
        disabled ? "opacity-40" : ""
      } ${
        active
          ? "border-[var(--primary)]/60 bg-[var(--primary)]/10 ring-1 ring-[var(--primary)]/25"
          : "border-[var(--border)] hover:bg-[var(--surface-2)]/80"
      }`}
    >
      {onHide && (
        <button
          type="button"
          title="Ocultar da biblioteca (não remove do agente se estiver ativo)"
          onClick={(e) => {
            e.stopPropagation();
            onHide();
          }}
          className="absolute top-2 right-2 grid size-6 place-items-center rounded-md text-[var(--text-ghost)] hover:bg-[var(--surface-2)] hover:text-[var(--foreground)]"
        >
          <X className="size-3.5" />
        </button>
      )}
      <button type="button" disabled={disabled} onClick={onClick} className="w-full text-left pr-6">
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
    </div>
  );
}

interface AiModelStudioProps {
  connectorRows?: ConnectorRow[];
  keysSectionHref?: string;
}

export function AiModelStudio({ connectorRows, keysSectionHref = "/api" }: AiModelStudioProps) {
  const [prefs, setPrefs] = useState<AgentPreferences>(() => loadAgentPreferences());
  const connected = connectedEnvsFromRows(connectorRows);
  const activePreset = getPresetById(
    prefs.mode === "robin" ? prefs.robinPoolModelId : prefs.fixedPresetId,
  );
  const [selectedEnv, setSelectedEnv] = useState<AiEnvId>(activePreset.env);

  useEffect(() => {
    const p = getPresetById(
      prefs.mode === "robin" ? prefs.robinPoolModelId : prefs.fixedPresetId,
    );
    setSelectedEnv(p.env);
  }, [prefs.fixedPresetId, prefs.robinPoolModelId, prefs.mode]);

  const patch = (partial: Partial<AgentPreferences>) =>
    setPrefs((p) => {
      const next = { ...p, ...partial };
      saveAgentPreferences(next);
      return next;
    });

  const hidden = new Set(prefs.hiddenPresetIds ?? []);
  const envModels = presetsForEnv(selectedEnv).filter((m) => !hidden.has(m.id));
  const poolProvider = prefs.poolProvider ?? "groq";
  const poolModels = poolPresetsForProvider(poolProvider).filter((m) => !hidden.has(m.id));
  const connectedCount = ENVS.filter((e) => connected[e]).length;
  const sttNeeds: keyof typeof connected =
    prefs.sttProvider === "groq"
      ? "groq"
      : prefs.sttProvider === "openrouter"
        ? "openrouter"
        : "xai";
  const sttReady = connected[sttNeeds];

  const hidePreset = (presetId: string) => {
    const activeId =
      prefs.mode === "robin" ? prefs.robinPoolModelId : prefs.fixedPresetId;
    if (normalizePresetId(activeId) === normalizePresetId(presetId)) {
      toast.info("Este modelo está ativo no agente — troque antes de ocultar.");
      return;
    }
    patch({ hiddenPresetIds: [...(prefs.hiddenPresetIds ?? []), presetId] });
    toast.success("Removido da biblioteca desta página");
  };

  const restoreHidden = () => patch({ hiddenPresetIds: [] });

  const selectModel = (presetId: string) => {
    const preset = getPresetById(presetId);
    if (prefs.mode === "robin") {
      patch({ robinPoolModelId: presetId, poolProvider: preset.env as PoolProviderId });
    } else {
      patch({ mode: "fixed", fixedPresetId: presetId });
    }
  };

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-10 rounded-xl border-2 border-[var(--primary)]/20 bg-[var(--surface-1)]/50 p-5 shadow-lg shadow-black/20"
      id="forge-ai-studio"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
        <div>
          <h2 className="flex items-center gap-2 font-display text-lg tracking-tight text-[var(--foreground)]">
            <Zap className="size-5 text-[var(--primary)]" />
            Ambiente e modelo de IA
          </h2>
          <p className="mt-1 font-mono text-[10px] text-[var(--text-dim)] max-w-xl leading-relaxed">
            {CODING_MODEL_PRESETS.length} modelos curados para desenvolvimento. Passo 1: ambiente → Passo 2:
            modelo → Passo 3: como o agente usa.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2">
          {connectedCount > 0 ? (
            <CheckCircle2 className="size-4 text-emerald-400" />
          ) : (
            <AlertCircle className="size-4 text-amber-400" />
          )}
          <span className="font-mono text-[10px]">
            {connectedCount}/{ENVS.length} ambientes com chave
          </span>
        </div>
      </div>

      {/* ─── Passo 1: Ambientes ─── */}
      <div className="mb-6">
        <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--primary)] mb-2">
          1 · Ambiente (provedor)
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          {ENVS.map((env) => {
            const meta = AI_ENV_META[env];
            const hasKey = connected[env];
            const active = selectedEnv === env;
            return (
              <button
                key={env}
                type="button"
                onClick={() => {
                  setSelectedEnv(env);
                  const first = presetsForEnv(env)[0];
                  if (first && prefs.mode !== "robin") selectModel(first.id);
                }}
                className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border text-center transition-all ${
                  active
                    ? "border-[var(--primary)] bg-[var(--primary)]/12 text-[var(--foreground)]"
                    : "border-[var(--border)] hover:border-[var(--border-strong,var(--border))]"
                }`}
              >
                <span
                  className={`grid size-9 place-items-center rounded-lg border ${
                    active ? "border-[var(--primary)]/40 text-[var(--primary)]" : "border-[var(--border)]"
                  }`}
                >
                  {ENV_ICONS[env]}
                </span>
                <span className="font-mono text-[10px] leading-tight">{meta.label}</span>
                <span
                  className={`font-mono text-[8px] px-1.5 py-0.5 rounded ${
                    hasKey
                      ? "text-emerald-400 bg-emerald-400/10"
                      : "text-amber-400/90 bg-amber-400/10"
                  }`}
                >
                  {hasKey ? "Chave OK" : "Sem chave"}
                </span>
              </button>
            );
          })}
        </div>
        {!connected[selectedEnv] && (
          <p className="mt-3 flex flex-wrap items-center gap-2 font-mono text-[10px] text-amber-400/95 rounded-lg border border-amber-400/25 bg-amber-400/8 px-3 py-2">
            <Key className="size-3.5 shrink-0" />
            {selectedEnv === "openrouter"
              ? "DeepSeek, Qwen, Kimi, etc. usam OpenRouter — chave em API."
              : `Cadastre a chave ${AI_ENV_META[selectedEnv].label} (${AI_ENV_META[selectedEnv].keyPrefix}…)`}
            <Link
              to={keysSectionHref}
              hash={selectedEnv === "openrouter" ? "forge-key-openrouter" : `forge-key-${selectedEnv}`}
              className="text-[var(--primary)] underline"
            >
              ir para API →
            </Link>
          </p>
        )}
      </div>

      {/* ─── Passo 2: Modelos do ambiente ─── */}
      <div className="mb-6">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--primary)]">
            2 · Modelo para programação — {AI_ENV_META[selectedEnv].label}
          </p>
          {(prefs.hiddenPresetIds?.length ?? 0) > 0 && (
            <button
              type="button"
              onClick={restoreHidden}
              className="inline-flex items-center gap-1 font-mono text-[9px] text-[var(--primary)] hover:underline"
            >
              <RotateCcw className="size-3" />
              Restaurar ocultos ({prefs.hiddenPresetIds?.length})
            </button>
          )}
        </div>
        {prefs.mode === "robin" && (selectedEnv === "groq" || selectedEnv === "nvidia") ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {poolModels.map((m) => (
              <ModelCard
                key={m.id}
                active={normalizePresetId(prefs.robinPoolModelId) === m.id}
                label={m.label}
                description={m.description}
                badges={[m.model, "pool"]}
                disabled={!connected[m.env]}
                onClick={() => selectModel(m.id)}
                onHide={() => hidePreset(m.id)}
              />
            ))}
          </div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {envModels.map((m) => (
              <ModelCard
                key={m.id}
                active={
                  normalizePresetId(prefs.fixedPresetId) === m.id &&
                  prefs.mode !== "robin"
                }
                label={m.label}
                description={m.description}
                badges={[
                  m.tier,
                  m.recommended ? "recomendado" : "",
                  m.openRouterSlug,
                ].filter(Boolean) as string[]}
                disabled={!connected[m.env]}
                onClick={() => selectModel(m.id)}
                onHide={() => hidePreset(m.id)}
              />
            ))}
          </div>
        )}
        {prefs.mode === "robin" && selectedEnv !== "groq" && selectedEnv !== "nvidia" && (
          <p className="mt-2 font-mono text-[10px] text-[var(--text-ghost)]">
            Modo ROBIN só usa Groq ou NVIDIA. Selecione um desses ambientes ou mude para Fixo/Auto.
          </p>
        )}

        <div className="mt-4 rounded-lg border border-dashed border-[var(--border)] p-3">
          <label className="font-mono text-[9px] uppercase tracking-wider text-[var(--text-dim)]">
            ID do modelo (opcional — estilo OpenRouter)
          </label>
          <input
            type="text"
            value={prefs.customModelId ?? ""}
            onChange={(e) =>
              patch({
                customModelId: e.target.value,
                useCustomModel: e.target.value.trim().length > 0,
              })
            }
            placeholder="ex.: anthropic/claude-sonnet-4-6 (referência de ID; roteia via OpenRouter)"
            className="mt-2 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 font-mono text-[11px] text-[var(--foreground)]"
          />
          <p className="mt-2 font-mono text-[9px] text-[var(--text-ghost)] leading-relaxed">
            Cole o slug exato da API. Quando preenchido, substitui o preset acima no modo Fixo. Atualize a lista
            de atalhos na próxima sessão — este campo sempre aceita o ID mais novo.
          </p>
        </div>
      </div>

      {/* ─── Passo 3: Modo agente ─── */}
      <div className="mb-6 rounded-lg border border-[var(--border)] bg-[var(--surface-2)]/40 p-4">
        <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--text-dim)] mb-3">
          3 · Como o agente usa o modelo
        </p>
        <div className="flex flex-wrap gap-2">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => {
                if (m.id === "robin") {
                  patch({
                    mode: "robin",
                    poolProvider: selectedEnv === "nvidia" ? "nvidia" : "groq",
                    robinPoolModelId:
                      selectedEnv === "nvidia"
                        ? PLATFORM_ROBIN_TASTE_PRESET_ID
                        : "pool-groq-flash",
                  });
                } else {
                  patch({ mode: m.id });
                }
              }}
              className={`px-4 py-2 rounded-lg border font-mono text-[11px] transition-colors ${
                prefs.mode === m.id
                  ? "border-[var(--primary)] bg-[var(--primary)]/15 text-[var(--foreground)]"
                  : "border-[var(--border)] text-[var(--text-dim)] hover:bg-[var(--surface-2)]"
              }`}
            >
              <span className="block font-medium">{m.title}</span>
              <span className="block text-[9px] opacity-70 mt-0.5">{m.hint}</span>
            </button>
          ))}
        </div>
        {!isAgentPreferencesConfigured(prefs) && (
          <p className="mt-3 font-mono text-[9px] text-amber-400/90 leading-relaxed">
            Setup obrigatório: escolha modo (Fixo ou ROBIN), selecione o modelo abaixo e conecte as chaves
            necessárias. Sem isso o agente não inicia.
          </p>
        )}
        {prefs.mode === "fixed" && (
          <p className="mt-3 font-mono text-[9px] text-emerald-400/80">
            Fixo ativo: {getPresetById(prefs.fixedPresetId).label} (
            {prefs.useCustomModel && prefs.customModelId
              ? prefs.customModelId
              : getPresetById(prefs.fixedPresetId).model}
            )
          </p>
        )}
      </div>

      {/* ─── Voz STT ─── */}
      <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)]/30 p-4">
        <label className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-wider text-[var(--text-dim)] mb-3">
          <Mic className="size-3" />
          Voz (STT) — sem troca silenciosa de provedor
        </label>
        <div className="grid gap-2 sm:grid-cols-3">
          {STT_OPTIONS.map((opt) => (
            <ModelCard
              key={opt.id}
              active={(prefs.sttProvider ?? "grok") === opt.id}
              label={opt.label}
              description={opt.description}
              badges={[
                connected[opt.requiresEnv] ? "chave OK" : "precisa chave",
                AI_ENV_META[opt.requiresEnv].label,
              ]}
              disabled={false}
              onClick={() => patch({ sttProvider: opt.id as SttProviderId })}
            />
          ))}
        </div>
        {!sttReady && (
          <p className="mt-3 font-mono text-[10px] text-amber-400/90">
            STT em {STT_OPTIONS.find((o) => o.id === (prefs.sttProvider ?? "grok"))?.label ?? "Grok"} exige chave{" "}
            {AI_ENV_META[sttNeeds].label} em{" "}
            <Link to={keysSectionHref} className="text-[var(--primary)] underline">
              API
            </Link>
            .
          </p>
        )}
        {sttReady && (
          <p className="mt-3 font-mono text-[10px] text-emerald-400/80">
            Microfone usará exclusivamente{" "}
            {STT_OPTIONS.find((o) => o.id === (prefs.sttProvider ?? "grok"))?.label}.
          </p>
        )}
      </div>
    </motion.section>
  );
}

/** Versão compacta no editor (link + resumo) */
export function AiModelStudioSummary() {
  const prefs = loadAgentPreferences();
  const preset = isAgentPreferencesConfigured(prefs)
    ? getPresetById(prefs.mode === "robin" ? prefs.robinPoolModelId : prefs.fixedPresetId)
    : getPresetById("");
  const stt =
    prefs.sttProvider === "groq"
      ? "Groq STT"
      : prefs.sttProvider === "openrouter"
        ? "OpenRouter STT"
        : "Grok STT";

  return (
    <Link
      to="/models"
      className="forge-composer-chip max-w-[200px] hover:border-[var(--primary)]/50"
      title="Configurar ambiente e modelo"
    >
      <span className="truncate font-mono text-[10px]">
        {preset.label} · {prefs.mode ?? "setup"}
      </span>
      <span className="text-[8px] opacity-60">| {stt}</span>
    </Link>
  );
}