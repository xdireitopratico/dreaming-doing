import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Zap,
  Check,
  Mic,
  Brain,
  Cpu,
  Gem,
  Globe,
  Box,
  AlertCircle,
  Key,
  Plus,
  X,
  RotateCcw,
} from "lucide-react";
import { providerById, type AiProvider, type AiProviderId } from "@/lib/ai-provider-registry";
import type { AgentPreferences, ModelPowerMode, SttProviderId } from "@/lib/agent-preferences";
import {
  type ForgeModelPreset,
  type UserModelEntry,
  AI_ENV_META,
  STT_OPTIONS,
  STT_DEFAULT_PROVIDER,
  sttActiveModelLine,
  sttProviderName,
  normalizePresetId,
  getPresetById,
} from "@/lib/model-catalog";
import { isAgentPreferencesConfigured } from "@/lib/agent-setup";

const ENV_ICONS: Record<string, React.ReactNode> = {
  alibaba: <Globe className="size-4" />,
  anthropic: <Zap className="size-4" />,
  deepseek: <Brain className="size-4" />,
  gemini: <Gem className="size-4" />,
  groq: <Cpu className="size-4" />,
  minimax: <Brain className="size-4" />,
  moonshotai: <Globe className="size-4" />,
  nvidia: <Cpu className="size-4" />,
  ollama: <Cpu className="size-4" />,
  openai: <Brain className="size-4" />,
  openrouter: <Globe className="size-4" />,
  xai: <Globe className="size-4" />,
  xiaomi: <Box className="size-4" />,
};

const MODES: { id: ModelPowerMode; title: string; hint: string }[] = [
  {
    id: "auto",
    title: "Automático",
    hint: "O agente escolhe entre os modelos que você marcar.",
  },
  {
    id: "fixed",
    title: "Fixo",
    hint: "Sempre o mesmo modelo.",
  },
  {
    id: "robin",
    title: "ROBIN",
    hint: "Rotação de chaves em pool.",
  },
];

const MODE_GUIDE: Record<ModelPowerMode, { title: string; body: string; action: string }> = {
  auto: {
    title: "Modo automático",
    body: "Marque um ou mais cards. Pode misturar providers.",
    action: "Marque os modelos permitidos.",
  },
  fixed: {
    title: "Modo fixo",
    body: "Escolha exatamente um card.",
    action: "Clique em um card para selecionar o modelo fixo.",
  },
  robin: {
    title: "Modo ROBIN",
    body: "Rotação de chaves em pool. Só providers que suportam pool.",
    action: "Selecione um provider com pool, depois o modelo.",
  },
};

interface ModelCardProps {
  active: boolean;
  label: string;
  description: string;
  badges?: string[];
  disabled?: boolean;
  disabledReason?: string;
  multi?: boolean;
  onClick: () => void;
  onRemove?: () => void;
  onHide?: () => void;
}

function ModelCard({
  active,
  label,
  description,
  badges,
  disabled,
  disabledReason,
  multi,
  onClick,
  onRemove,
  onHide,
}: ModelCardProps) {
  const cornerAction = onRemove ?? onHide;
  return (
    <div
      className={`relative w-full text-left p-3 rounded-lg border transition-all ${
        disabled ? "opacity-55 cursor-not-allowed" : ""
      } ${
        active
          ? "border-[var(--primary)]/60 bg-[var(--primary)]/10 ring-1 ring-[var(--primary)]/25"
          : "border-[var(--border)] bg-[var(--surface-1)]/40 hover:border-[var(--border-strong,var(--border))] hover:bg-[var(--surface-2)]/60"
      }`}
      title={disabled ? disabledReason : undefined}
    >
      {cornerAction && (
        <button
          type="button"
          title={onRemove ? "Remover" : "Ocultar"}
          onClick={(e) => {
            e.stopPropagation();
            cornerAction();
          }}
          className="absolute top-2 right-2 grid size-6 place-items-center rounded-md text-[var(--text-dim)] hover:bg-[var(--surface-2)] hover:text-[var(--foreground)]"
        >
          <X className="size-3.5" />
        </button>
      )}
      <button type="button" disabled={disabled} onClick={onClick} className="w-full text-left pr-6">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="font-mono text-[11px]">
              {multi && !active ? "○ " : multi && active ? "● " : ""}
              {label}
            </div>
            <p className="mt-0.5 font-mono text-[9px] leading-relaxed text-[var(--text-dim)]">
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

interface ModelEngineSectionProps {
  prefs: AgentPreferences;
  connected: Record<string, boolean>;
  providers: AiProvider[];
  selectedEnv: AiProviderId;
  envModels: ForgeModelPreset[];
  onSetMode: (mode: ModelPowerMode) => void;
  onSelectEnv: (env: AiProviderId) => void;
  onSelectModel: (presetId: string) => void;
  onAddUserModel: (slug: string) => void;
  onRemoveUserModel: (slug: string) => void;
  onPatchPrefs: (partial: Partial<AgentPreferences>) => void;
}

export function ModelEngineSection({
  prefs,
  connected,
  providers,
  selectedEnv,
  envModels,
  onSetMode,
  onSelectEnv,
  onSelectModel,
  onAddUserModel,
  onRemoveUserModel,
  onPatchPrefs,
}: ModelEngineSectionProps) {
  const mode = prefs.mode ?? "fixed";
  const modeGuide = MODE_GUIDE[mode];
  const sortedProviders = useMemo(
    () =>
      [...providers].sort((a, b) => {
        const cmp = a.label.localeCompare(b.label, "pt-BR", { sensitivity: "base" });
        if (cmp !== 0) return cmp;
        return a.id.localeCompare(b.id, "pt-BR", { sensitivity: "base" });
      }),
    [providers],
  );
  const sortedEnvModels = useMemo(
    () =>
      [...envModels].sort((a, b) => {
        const cmp = a.label.localeCompare(b.label, "pt-BR", { sensitivity: "base" });
        if (cmp !== 0) return cmp;
        return a.id.localeCompare(b.id, "pt-BR", { sensitivity: "base" });
      }),
    [envModels],
  );
  const autoAllowed = useMemo(
    () => new Set((prefs.autoAllowedPresetIds ?? []).map((id) => normalizePresetId(id))),
    [prefs.autoAllowedPresetIds],
  );
  const [draftSlug, setDraftSlug] = useState("");

  const sttNeeds =
    prefs.sttProvider === "groq"
      ? "groq"
      : prefs.sttProvider === "openrouter"
        ? "openrouter"
        : "xai";
  const sttReady = connected[sttNeeds];

  const isModelActive = (presetId: string) => {
    const norm = normalizePresetId(presetId);
    if (mode === "robin") return normalizePresetId(prefs.robinPoolModelId) === norm;
    if (mode === "auto") return autoAllowed.has(norm);
    return normalizePresetId(prefs.fixedPresetId) === norm;
  };

  const cardDisabled = (m: ForgeModelPreset): { disabled: boolean; reason?: string } => {
    if (!connected[m.env]) {
      return { disabled: true, reason: `Sem chave ${providerById(m.env as AiProviderId)?.label ?? m.env}` };
    }
    if (mode === "robin" && !providerById(m.env as AiProviderId)?.supportsPool) {
      return { disabled: true, reason: "ROBIN: só providers com pool" };
    }
    return { disabled: false };
  };

  const hidePreset = (presetId: string) => {
    const activeId = mode === "robin" ? prefs.robinPoolModelId : prefs.fixedPresetId;
    if (normalizePresetId(activeId) === normalizePresetId(presetId)) {
      return;
    }
    onPatchPrefs({ hiddenPresetIds: [...(prefs.hiddenPresetIds ?? []), presetId] });
  };

  const restoreHidden = () => onPatchPrefs({ hiddenPresetIds: [] });

  const selectAllInEnv = () => {
    const ids = envModels
      .filter((m) => connected[m.env] && (mode !== "robin" || providerById(m.env as AiProviderId)?.supportsPool))
      .map((m) => m.id);
    onPatchPrefs({ mode: "auto", autoAllowedPresetIds: [...new Set([...autoAllowed, ...ids])] });
  };

  const clearAutoInEnv = () => {
    const envIds = new Set(envModels.map((m) => normalizePresetId(m.id)));
    onPatchPrefs({
      mode: "auto",
      autoAllowedPresetIds: [...autoAllowed].filter((id) => !envIds.has(id)),
    });
  };

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-6 rounded-xl border-2 border-[var(--primary)]/20 bg-[var(--surface-1)]/50 p-5 shadow-lg shadow-black/20"
    >
      <div className="flex items-start justify-between gap-3 mb-5">
        <div>
          <h2 className="flex items-center gap-2 font-display text-lg tracking-tight text-[var(--foreground)]">
            <Zap className="size-5 text-[var(--primary)]" />
            1 · Model Engine
          </h2>
          <p className="mt-1 font-mono text-[10px] text-[var(--text-dim)] max-w-2xl leading-relaxed">
            Escolha o modo, o provider e o modelo que o agente vai usar.
          </p>
        </div>
      </div>

      {/* Modo */}
      <div className="mb-6 rounded-lg border border-[var(--border)] bg-[var(--surface-2)]/40 p-4">
        <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--primary)] mb-3">
          1 · Modo
        </p>
        <div className="flex flex-wrap gap-2">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => onSetMode(m.id)}
              className={`px-4 py-2 rounded-lg border font-mono text-[11px] transition-colors text-left max-w-sm ${
                mode === m.id
                  ? "border-[var(--primary)] bg-[var(--primary)]/15 text-[var(--foreground)]"
                  : "border-[var(--border)] text-[var(--foreground)]/75 hover:bg-[var(--surface-2)]"
              }`}
            >
              <span className="block font-medium">{m.title}</span>
              <span className="block text-[9px] mt-0.5 opacity-80 leading-relaxed">{m.hint}</span>
            </button>
          ))}
        </div>

        <div className="mt-4 rounded-lg border border-[var(--primary)]/20 bg-[var(--primary)]/8 px-3 py-3">
          <p className="font-mono text-[10px] font-medium text-[var(--primary)]">{modeGuide.title}</p>
          <p className="mt-1 font-mono text-[10px] text-[var(--text-dim)] leading-relaxed">
            {modeGuide.body}
          </p>
          <p className="mt-2 font-mono text-[9px] text-[var(--foreground)]/80">→ {modeGuide.action}</p>
          {mode === "auto" && autoAllowed.size > 0 && (
            <p className="mt-2 font-mono text-[9px] text-emerald-400/90">
              {autoAllowed.size} modelo(s) no automático
            </p>
          )}
          {mode === "fixed" && prefs.fixedPresetId && (
            <p className="mt-2 font-mono text-[9px] text-emerald-400/90">
              Fixo: {getPresetById(prefs.fixedPresetId, prefs.userModelEntries).label}
            </p>
          )}
          {mode === "robin" && (
            <p className="mt-2 font-mono text-[9px] text-emerald-400/90">
              ROBIN: {getPresetById(prefs.robinPoolModelId, prefs.userModelEntries).label} ·{" "}
              {prefs.poolProvider ?? "groq"}
            </p>
          )}
        </div>

        {!isAgentPreferencesConfigured(prefs) && (
          <p className="mt-3 font-mono text-[9px] text-amber-400/90">
            Falta concluir: modo + modelo + chave do provider.
          </p>
        )}
      </div>

      {/* Provider */}
      <div className="mb-6">
        <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--primary)] mb-2">
          2 · Provider
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
          {sortedProviders.map((env) => {
            const hasKey = connected[env.id];
            const active = selectedEnv === env.id;
            return (
              <button
                key={env.id}
                type="button"
                onClick={() => onSelectEnv(env.id)}
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
                  {ENV_ICONS[env.id] ?? <Brain className="size-4" />}
                </span>
                <span className="font-mono text-[10px] leading-tight">{env.label}</span>
                <span
                  className={`font-mono text-[8px] px-1.5 py-0.5 rounded ${
                    hasKey ? "text-emerald-400 bg-emerald-400/10" : "text-amber-400/90 bg-amber-400/10"
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
            Cadastre {providerById(selectedEnv)?.label ?? selectedEnv} em Providers & Keys.
          </p>
        )}
      </div>

      {/* Modelos */}
      <div className="mb-6">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--primary)]">
            3 · Modelos · {providerById(selectedEnv)?.label ?? selectedEnv}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {mode === "auto" && (
              <>
                <button
                  type="button"
                  onClick={selectAllInEnv}
                  className="font-mono text-[9px] text-[var(--primary)] hover:underline"
                >
                  Marcar todos
                </button>
                <button
                  type="button"
                  onClick={clearAutoInEnv}
                  className="font-mono text-[9px] text-[var(--text-dim)] hover:underline"
                >
                  Desmarcar
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
                Restaurar ({prefs.hiddenPresetIds?.length})
              </button>
            )}
          </div>
        </div>

        <div className="mb-4 rounded-lg border border-[var(--border)] bg-[var(--surface-2)]/50 p-3">
          <p className="font-mono text-[10px] text-[var(--text-dim)] mb-2 leading-relaxed">
            Adicione um modelo deste provider. No OpenRouter, cole o slug completo.
          </p>
          <div className="flex flex-wrap gap-2">
            <input
              type="text"
              value={draftSlug}
              onChange={(e) => setDraftSlug(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  onAddUserModel(draftSlug);
                  setDraftSlug("");
                }
              }}
              placeholder="slug do modelo"
              className="flex-1 min-w-[200px] rounded-lg border border-[var(--border)] bg-[var(--surface-1)] px-3 py-2 font-mono text-[11px] text-[var(--foreground)]"
            />
            <button
              type="button"
              onClick={() => {
                onAddUserModel(draftSlug);
                setDraftSlug("");
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--primary)] bg-[var(--primary)]/15 px-4 py-2 font-mono text-[11px] text-[var(--foreground)] hover:bg-[var(--primary)]/25"
            >
              <Plus className="size-3.5" />
              Adicionar
            </button>
          </div>
        </div>

        {envModels.length === 0 ? (
          <p className="font-mono text-[10px] text-[var(--text-dim)] rounded-lg border border-dashed border-[var(--border)] p-4 leading-relaxed">
            Nenhum modelo neste provider. Adicione o primeiro acima.
          </p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {sortedEnvModels.map((m) => {
              const isCustom = m.id.startsWith("custom--");
              const { disabled, reason } = cardDisabled(m);
              const badges = [
                isCustom ? "seu modelo" : "",
                m.id.startsWith("pool-") ? "pool" : "",
                m.tier,
                m.recommended ? "recomendado" : "",
              ].filter(Boolean) as string[];
              return (
                <ModelCard
                  key={m.id}
                  active={isModelActive(m.id)}
                  label={m.label}
                  description={isCustom ? m.description : m.openRouterSlug}
                  badges={badges}
                  disabled={disabled}
                  disabledReason={reason}
                  multi={mode === "auto"}
                  onClick={() => onSelectModel(m.id)}
                  onRemove={isCustom ? () => onRemoveUserModel(m.openRouterSlug) : undefined}
                  onHide={isCustom ? undefined : () => hidePreset(m.id)}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* STT */}
      <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)]/30 p-4">
        <label className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-wider text-[var(--text-dim)] mb-1">
          <Mic className="size-3" />
          Voz
        </label>
        <p className="font-mono text-[9px] text-[var(--text-ghost)] mb-3">
          Independente do modelo de texto.
        </p>
        <div className="grid gap-2 sm:grid-cols-3">
          {[...STT_OPTIONS]
            .sort((a, b) => a.label.localeCompare(b.label, "pt"))
            .map((opt) => (
              <ModelCard
                key={opt.id}
                active={(prefs.sttProvider ?? STT_DEFAULT_PROVIDER) === opt.id}
                label={opt.label}
                description={opt.hint}
                badges={[
                  connected[opt.requiresEnv] ? "chave OK" : "sem chave",
                  opt.recommended ? "padrão" : "",
                ].filter(Boolean)}
                disabled={false}
                onClick={() => onPatchPrefs({ sttProvider: opt.id as SttProviderId })}
              />
            ))}
        </div>
        <p className="mt-3 font-mono text-[10px] text-[var(--text-dim)] rounded-md border border-[var(--border)] bg-[var(--surface-1)]/60 px-3 py-2">
          {sttActiveModelLine(prefs.sttProvider ?? STT_DEFAULT_PROVIDER)}
        </p>
        {!sttReady && (
          <p className="mt-2 font-mono text-[10px] text-amber-400/90">
            Cadastre a chave em Providers & Keys.
          </p>
        )}
      </div>
    </motion.section>
  );
}
