/**
 * Estúdio de modelo — modo primeiro; Auto com multi-seleção; ordem alfabética.
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { toast } from "sonner";
import {
  Brain,
  Zap,
  Mic,
  Gem,
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
  AI_ENVS_SORTED,
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
  alibaba: <Globe className="size-4" />,
  anthropic: <Zap className="size-4" />,
  deepseek: <Brain className="size-4" />,
  gemini: <Gem className="size-4" />,
  openai: <Brain className="size-4" />,
  xai: <Globe className="size-4" />,
  groq: <Cpu className="size-4" />,
  nvidia: <Cpu className="size-4" />,
  openrouter: <Globe className="size-4" />,
};

const MODES: { id: ModelPowerMode; title: string; hint: string }[] = [
  { id: "auto", title: "Auto", hint: "Router entre os modelos que você marcar (barato vs forte)" },
  { id: "fixed", title: "Fixo", hint: "Sempre o mesmo modelo em cada mensagem" },
  { id: "robin", title: "ROBIN", hint: "Pool rotativo nas suas chaves Groq ou NVIDIA" },
].sort((a, b) => a.title.localeCompare(b.title, "pt"));

function ModelCard({
  active,
  label,
  description,
  badges,
  disabled,
  multi,
  onClick,
  onHide,
}: {
  active: boolean;
  label: string;
  description: string;
  badges?: string[];
  disabled?: boolean;
  multi?: boolean;
  onClick: () => void;
  onHide?: () => void;
}) {
  return (
    <div
      className={`relative w-full text-left p-3 rounded-lg border transition-all ${
        disabled ? "opacity-50 cursor-not-allowed" : ""
      } ${
        active
          ? "border-[var(--primary)]/60 bg-[var(--primary)]/10 ring-1 ring-[var(--primary)]/25"
          : "border-[var(--border)] bg-[var(--surface-1)]/40 hover:border-[var(--border-strong,var(--border))] hover:bg-[var(--surface-2)]/60"
      }`}
    >
      {onHide && (
        <button
          type="button"
          title="Ocultar da biblioteca"
          onClick={(e) => {
            e.stopPropagation();
            onHide();
          }}
          className="absolute top-2 right-2 grid size-6 place-items-center rounded-md text-[var(--text-dim)] hover:bg-[var(--surface-2)] hover:text-[var(--foreground)]"
        >
          <X className="size-3.5" />
        </button>
      )}
      <button type="button" disabled={disabled} onClick={onClick} className="w-full text-left pr-6">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div
              className={`font-mono text-[11px] ${active ? "text-[var(--foreground)]" : "text-[var(--foreground)]/90"}`}
            >
              {multi && !active ? "○ " : multi && active ? "● " : ""}
              {label}
            </div>
            <p
              className={`mt-0.5 font-mono text-[9px] leading-relaxed ${
                active ? "text-[var(--text-dim)]" : "text-[var(--text-dim)]/95"
              }`}
            >
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
    if (p.id) setSelectedEnv(p.env);
  }, [prefs.fixedPresetId, prefs.robinPoolModelId, prefs.mode]);

  const patch = (partial: Partial<AgentPreferences>) =>
    setPrefs((p) => {
      const next = { ...p, ...partial };
      saveAgentPreferences(next);
      return next;
    });

  const hidden = new Set(prefs.hiddenPresetIds ?? []);
  const envModels = useMemo(
    () =>
      presetsForEnv(selectedEnv)
        .filter((m) => !hidden.has(m.id))
        .sort((a, b) => a.label.localeCompare(b.label, "pt")),
    [selectedEnv, hidden],
  );
  const poolProvider = prefs.poolProvider ?? "groq";
  const poolModels = poolPresetsForProvider(poolProvider).filter((m) => !hidden.has(m.id));
  const connectedCount = AI_ENVS_SORTED.filter((e) => connected[e]).length;
  const autoAllowed = new Set((prefs.autoAllowedPresetIds ?? []).map(normalizePresetId));

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
      toast.info("Este modelo está ativo — troque antes de ocultar.");
      return;
    }
    patch({ hiddenPresetIds: [...(prefs.hiddenPresetIds ?? []), presetId] });
    toast.success("Removido da biblioteca");
  };

  const restoreHidden = () => patch({ hiddenPresetIds: [] });

  const selectModel = (presetId: string) => {
    const preset = getPresetById(presetId);
    if (!connected[preset.env]) {
      toast.error(`Cadastre a chave ${AI_ENV_META[preset.env].label} em API primeiro.`);
      return;
    }
    if (prefs.mode === "robin") {
      if (preset.env !== "groq" && preset.env !== "nvidia") {
        toast.info("ROBIN só usa modelos Groq ou NVIDIA.");
        return;
      }
      patch({
        robinPoolModelId: presetId,
        poolProvider: preset.env as PoolProviderId,
      });
      return;
    }
    if (prefs.mode === "auto") {
      const norm = normalizePresetId(presetId);
      const next = new Set(autoAllowed);
      if (next.has(norm)) next.delete(norm);
      else next.add(norm);
      patch({ mode: "auto", autoAllowedPresetIds: [...next] });
      return;
    }
    patch({ mode: "fixed", fixedPresetId: presetId });
  };

  const isModelActive = (presetId: string) => {
    const norm = normalizePresetId(presetId);
    if (prefs.mode === "robin") {
      return normalizePresetId(prefs.robinPoolModelId) === norm;
    }
    if (prefs.mode === "auto") {
      return autoAllowed.has(norm);
    }
    return prefs.mode === "fixed" && normalizePresetId(prefs.fixedPresetId) === norm;
  };

  const selectAllInEnv = () => {
    const ids = envModels.filter((m) => connected[m.env]).map((m) => m.id);
    patch({ mode: "auto", autoAllowedPresetIds: [...new Set([...autoAllowed, ...ids])] });
  };

  const clearAutoInEnv = () => {
    const envIds = new Set(envModels.map((m) => normalizePresetId(m.id)));
    patch({
      mode: "auto",
      autoAllowedPresetIds: [...autoAllowed].filter((id) => !envIds.has(id)),
    });
  };

  const setMode = (mode: ModelPowerMode) => {
    if (mode === "robin") {
      patch({
        mode: "robin",
        poolProvider: selectedEnv === "nvidia" ? "nvidia" : "groq",
        robinPoolModelId:
          selectedEnv === "nvidia" ? PLATFORM_ROBIN_TASTE_PRESET_ID : "pool-groq-flash",
      });
      return;
    }
    patch({ mode });
  };

  const modelGridClass =
    prefs.mode === "robin"
      ? "flex flex-wrap gap-2"
      : "grid gap-2 sm:grid-cols-2 lg:grid-cols-3";

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
            Passo 1: como o agente usa os modelos · Passo 2: ambiente · Passo 3: modelos · Voz (STT).
            Listas em ordem alfabética.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2">
          {connectedCount > 0 ? (
            <CheckCircle2 className="size-4 text-emerald-400" />
          ) : (
            <AlertCircle className="size-4 text-amber-400" />
          )}
          <span className="font-mono text-[10px] text-[var(--foreground)]/90">
            {connectedCount}/{AI_ENVS_SORTED.length} ambientes com chave
          </span>
        </div>
      </div>

      {/* Passo 1: Modo */}
      <div className="mb-6 rounded-lg border border-[var(--border)] bg-[var(--surface-2)]/40 p-4">
        <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--primary)] mb-3">
          1 · Modo do agente
        </p>
        <div className="flex flex-wrap gap-2">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setMode(m.id)}
              className={`px-4 py-2 rounded-lg border font-mono text-[11px] transition-colors text-left max-w-xs ${
                prefs.mode === m.id
                  ? "border-[var(--primary)] bg-[var(--primary)]/15 text-[var(--foreground)]"
                  : "border-[var(--border)] text-[var(--foreground)]/75 hover:bg-[var(--surface-2)]"
              }`}
            >
              <span className="block font-medium">{m.title}</span>
              <span className="block text-[9px] mt-0.5 opacity-80">{m.hint}</span>
            </button>
          ))}
        </div>
        {prefs.mode === "auto" && (
          <p className="mt-3 font-mono text-[10px] text-[var(--text-dim)] leading-relaxed">
            Marque um ou mais modelos abaixo. O router alterna entre eles conforme a complexidade da
            tarefa. Nenhum marcado = usa todas as chaves que você cadastrou em API.
            {autoAllowed.size > 0 && (
              <span className="text-[var(--primary)]"> · {autoAllowed.size} selecionado(s)</span>
            )}
          </p>
        )}
        {prefs.mode === "fixed" && prefs.fixedPresetId && (
          <p className="mt-3 font-mono text-[10px] text-emerald-400/90">
            Fixo: {getPresetById(prefs.fixedPresetId).label}
          </p>
        )}
        {prefs.mode === "robin" && (
          <p className="mt-3 font-mono text-[10px] text-[var(--text-dim)]">
            ROBIN: {getPresetById(prefs.robinPoolModelId).label} · pool {prefs.poolProvider ?? "groq"}
          </p>
        )}
        {!isAgentPreferencesConfigured(prefs) && (
          <p className="mt-3 font-mono text-[9px] text-amber-400/90">
            Escolha um modo e configure modelos + chaves em API.
          </p>
        )}
      </div>

      {/* Passo 2: Ambientes */}
      <div className="mb-6">
        <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--primary)] mb-2">
          2 · Ambiente (provedor)
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          {AI_ENVS_SORTED.map((env) => {
            const meta = AI_ENV_META[env];
            const hasKey = connected[env];
            const active = selectedEnv === env;
            return (
              <button
                key={env}
                type="button"
                onClick={() => setSelectedEnv(env)}
                className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border text-center transition-all ${
                  active
                    ? "border-[var(--primary)] bg-[var(--primary)]/12 text-[var(--foreground)]"
                    : "border-[var(--border)] text-[var(--foreground)]/80 hover:border-[var(--border-strong,var(--border))]"
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
              ? "Kimi, MiniMax, Zhipu, etc. — chave OpenRouter em API."
              : `Chave ${AI_ENV_META[selectedEnv].label} (${AI_ENV_META[selectedEnv].keyPrefix}…)`}
            <Link
              to={keysSectionHref}
              hash={
                selectedEnv === "openrouter"
                  ? "forge-key-openrouter"
                  : `forge-key-${selectedEnv}`
              }
              className="text-[var(--primary)] underline"
            >
              ir para API →
            </Link>
          </p>
        )}
      </div>

      {/* Passo 3: Modelos */}
      <div className="mb-6">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--primary)]">
            3 · Modelos — {AI_ENV_META[selectedEnv].label}
            {prefs.mode === "auto" ? " (marque vários)" : prefs.mode === "fixed" ? " (um só)" : ""}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {prefs.mode === "auto" && (
              <>
                <button
                  type="button"
                  onClick={selectAllInEnv}
                  className="font-mono text-[9px] text-[var(--primary)] hover:underline"
                >
                  Selecionar todos neste ambiente
                </button>
                <button
                  type="button"
                  onClick={clearAutoInEnv}
                  className="font-mono text-[9px] text-[var(--text-dim)] hover:underline"
                >
                  Limpar neste ambiente
                </button>
              </>
            )}
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
        </div>

        {prefs.mode === "robin" && selectedEnv !== "groq" && selectedEnv !== "nvidia" ? (
          <p className="font-mono text-[10px] text-[var(--text-dim)] rounded-lg border border-dashed border-[var(--border)] p-3">
            ROBIN só usa Groq ou NVIDIA. Selecione um desses ambientes ou mude para Auto/Fixo.
          </p>
        ) : (
          <div className={modelGridClass}>
            {(prefs.mode === "robin" && (selectedEnv === "groq" || selectedEnv === "nvidia")
              ? poolModels
              : envModels
            ).map((m) => (
              <ModelCard
                key={m.id}
                active={isModelActive(m.id)}
                label={m.label}
                description={m.description}
                badges={[
                  m.tier,
                  m.recommended ? "recomendado" : "",
                  m.env === "openrouter" ? m.openRouterSlug : AI_ENV_META[m.env].label,
                ].filter(Boolean) as string[]}
                disabled={!connected[m.env]}
                multi={prefs.mode === "auto"}
                onClick={() => selectModel(m.id)}
                onHide={() => hidePreset(m.id)}
              />
            ))}
          </div>
        )}

        <div className="mt-4 rounded-lg border border-dashed border-[var(--border)] p-3">
          <label className="font-mono text-[9px] uppercase tracking-wider text-[var(--text-dim)]">
            ID do modelo (opcional — slug exato da API)
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
            placeholder="ex.: anthropic/claude-sonnet-4-6"
            className="mt-2 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 font-mono text-[11px] text-[var(--foreground)]"
          />
          <p className="mt-2 font-mono text-[9px] text-[var(--text-dim)] leading-relaxed">
            No modo Fixo, substitui o preset acima. OpenRouter aceita qualquer slug; DeepSeek e Qwen
            usam as chaves nativas em API.
          </p>
        </div>
      </div>

      {/* STT */}
      <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)]/30 p-4">
        <label className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-wider text-[var(--text-dim)] mb-3">
          <Mic className="size-3" />
          Voz (STT)
        </label>
        <div className="grid gap-2 sm:grid-cols-3">
          {[...STT_OPTIONS]
            .sort((a, b) => a.label.localeCompare(b.label, "pt"))
            .map((opt) => (
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
            STT exige chave {AI_ENV_META[sttNeeds].label} em{" "}
            <Link to={keysSectionHref} className="text-[var(--primary)] underline">
              API
            </Link>
            .
          </p>
        )}
      </div>
    </motion.section>
  );
}

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
  const modeLabel =
    prefs.mode === "auto"
      ? `auto${(prefs.autoAllowedPresetIds?.length ?? 0) > 0 ? `·${prefs.autoAllowedPresetIds!.length}` : ""}`
      : (prefs.mode ?? "setup");

  return (
    <Link
      to="/models"
      className="forge-composer-chip max-w-[200px] hover:border-[var(--primary)]/50"
      title="Configurar ambiente e modelo"
    >
      <span className="truncate font-mono text-[10px]">
        {preset.label} · {modeLabel}
      </span>
      <span className="text-[8px] opacity-60">| {stt}</span>
    </Link>
  );
}