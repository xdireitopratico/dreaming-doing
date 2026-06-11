/**
 * Estúdio de modelo — catálogo sempre visível; IDs do usuário viram cards no provedor ativo.
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { toast } from "@/lib/toast";
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
  Plus,
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
  AI_ENV_META,
  AI_ENVS_SORTED,
  STT_OPTIONS,
  STT_DEFAULT_PROVIDER,
  sttActiveModelLine,
  sttProviderName,
  modelsForStudioStep,
  getPresetById,
  normalizePresetId,
  userModelPresetId,
  PLATFORM_ROBIN_TASTE_PRESET_ID,
  type AiEnvId,
  type UserModelEntry,
  type ForgeModelPreset,
} from "@/lib/model-catalog";
import { isAgentPreferencesConfigured } from "@/lib/agent-setup";
import { type ConnectorRow, connectedEnvsFromRows } from "@/lib/connector-env-status";

const ENV_ICONS: Record<AiEnvId, React.ReactNode> = {
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
  xiaomi: <Cpu className="size-4" />,
};

const MODES: { id: ModelPowerMode; title: string; hint: string }[] = [
  {
    id: "auto",
    title: "Automático",
    hint: "O agente escolhe entre os modelos que você marcar (pode misturar provedores).",
  },
  {
    id: "fixed",
    title: "Fixo",
    hint: "Sempre o mesmo modelo — clique em um card abaixo para definir qual.",
  },
  {
    id: "robin",
    title: "ROBIN (pool)",
    hint: "Rotação de chaves Groq ou NVIDIA — adicione várias chaves em API e escolha um modelo de pool.",
  },
];

const MODE_GUIDE: Record<ModelPowerMode, { title: string; body: string; action: string }> = {
  auto: {
    title: "Modo automático",
    body: "Marque um ou mais cards (○ vira ●). Pode marcar modelos de OpenAI, Anthropic, Groq, etc. no mesmo modo. Se não marcar nenhum, o agente usa todas as chaves que você cadastrou em API.",
    action: "Marque os modelos permitidos neste ambiente ou em vários ambientes.",
  },
  fixed: {
    title: "Modo fixo",
    body: "Escolha exatamente um card — esse modelo responde em toda mensagem. Troque de ambiente (passo 2) para ver outros provedores.",
    action: "Clique em um card para selecionar o modelo fixo.",
  },
  robin: {
    title: "Modo ROBIN",
    body: "Só funciona com chaves em pool Groq ou NVIDIA (várias chaves em API → Adicionar ao pool). O card escolhido define qual modelo o pool usa. Outros provedores aparecem aqui só para referência — use Auto ou Fixo para eles.",
    action: "Selecione ambiente Groq ou NVIDIA, depois um card de pool (ex.: Nemotron 550B).",
  },
};

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
}: {
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
}) {
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
          title={onRemove ? "Remover da sua lista" : "Ocultar da biblioteca"}
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

function robinCanSelect(preset: ForgeModelPreset): boolean {
  return preset.env === "groq" || preset.env === "nvidia";
}

interface AiModelStudioProps {
  connectorRows?: ConnectorRow[];
  keysSectionHref?: string;
}

export function AiModelStudio({ connectorRows, keysSectionHref = "/api" }: AiModelStudioProps) {
  const [prefs, setPrefs] = useState<AgentPreferences>(() => loadAgentPreferences());
  const connected = connectedEnvsFromRows(connectorRows);
  const userModels = prefs.userModelEntries;
  const mode = prefs.mode ?? "fixed";
  const activePreset = getPresetById(
    prefs.mode === "robin" ? prefs.robinPoolModelId : prefs.fixedPresetId,
    userModels,
  );
  const [selectedEnv, setSelectedEnv] = useState<AiEnvId>(activePreset.env);
  const [draftModelSlug, setDraftModelSlug] = useState("");

  useEffect(() => {
    const p = getPresetById(
      prefs.mode === "robin" ? prefs.robinPoolModelId : prefs.fixedPresetId,
      userModels,
    );
    if (p.id) setSelectedEnv(p.env);
  }, [prefs.fixedPresetId, prefs.robinPoolModelId, prefs.mode, userModels]);

  const patch = (partial: Partial<AgentPreferences>) =>
    setPrefs((p) => {
      const next = { ...p, ...partial };
      saveAgentPreferences(next);
      return next;
    });

  const hidden = new Set(prefs.hiddenPresetIds ?? []);
  const envModels = useMemo(
    () => modelsForStudioStep(selectedEnv, prefs.mode, userModels).filter((m) => !hidden.has(m.id)),
    [selectedEnv, hidden, prefs.mode, userModels],
  );
  const connectedCount = AI_ENVS_SORTED.filter((e) => connected[e]).length;
  const autoAllowed = new Set((prefs.autoAllowedPresetIds ?? []).map(normalizePresetId));
  const modeGuide = MODE_GUIDE[mode];

  const sttNeeds: keyof typeof connected =
    prefs.sttProvider === "groq"
      ? "groq"
      : prefs.sttProvider === "openrouter"
        ? "openrouter"
        : "xai";
  const sttReady = connected[sttNeeds];

  const hidePreset = (presetId: string) => {
    const activeId = prefs.mode === "robin" ? prefs.robinPoolModelId : prefs.fixedPresetId;
    if (normalizePresetId(activeId) === normalizePresetId(presetId)) {
      toast.error("Este modelo está ativo — troque antes de ocultar.");
      return;
    }
    patch({ hiddenPresetIds: [...(prefs.hiddenPresetIds ?? []), presetId] });
  };

  const restoreHidden = () => patch({ hiddenPresetIds: [] });

  const addUserModel = () => {
    const raw = draftModelSlug.trim();
    if (!raw) {
      toast.error("Digite o ID do modelo (slug da API).");
      return;
    }
    const slug = raw.includes("/") ? raw : `${selectedEnv}/${raw}`;
    const entry: UserModelEntry = {
      slug,
      env: selectedEnv,
      label: raw.includes("/") ? raw.split("/").pop()! : raw,
    };
    const id = userModelPresetId(slug);
    if ((userModels ?? []).some((e) => userModelPresetId(e.slug) === id)) {
      return;
    }
    const entries = [...(userModels ?? []), entry];
    const nextAllowed =
      prefs.mode === "auto"
        ? [...new Set([...(prefs.autoAllowedPresetIds ?? []).map(normalizePresetId), id])]
        : prefs.autoAllowedPresetIds;
    patch({
      userModelEntries: entries,
      autoAllowedPresetIds: nextAllowed,
      useCustomModel: false,
      customModelId: undefined,
    });
    setDraftModelSlug("");
  };

  const removeUserModel = (slug: string) => {
    const id = userModelPresetId(slug);
    const entries = (userModels ?? []).filter((e) => userModelPresetId(e.slug) !== id);
    patch({
      userModelEntries: entries,
      autoAllowedPresetIds: (prefs.autoAllowedPresetIds ?? [])
        .map(normalizePresetId)
        .filter((x) => x !== id),
      fixedPresetId:
        normalizePresetId(prefs.fixedPresetId) === id ? undefined : prefs.fixedPresetId,
      robinPoolModelId:
        normalizePresetId(prefs.robinPoolModelId) === id ? undefined : prefs.robinPoolModelId,
    });
  };

  const selectModel = (presetId: string) => {
    const preset = getPresetById(presetId, userModels);
    if (!connected[preset.env]) {
      toast.error(`Cadastre a chave ${AI_ENV_META[preset.env].label} em API primeiro.`);
      return;
    }
    if (prefs.mode === "robin") {
      if (!robinCanSelect(preset)) {
        toast.error(
          "ROBIN só seleciona modelos Groq ou NVIDIA. Use Automático ou Fixo para este provedor.",
        );
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

  const cardDisabled = (m: ForgeModelPreset): { disabled: boolean; reason?: string } => {
    if (!connected[m.env]) {
      return { disabled: true, reason: `Sem chave ${AI_ENV_META[m.env].label} em API` };
    }
    if (prefs.mode === "robin" && !robinCanSelect(m)) {
      return {
        disabled: true,
        reason: "ROBIN: só Groq/NVIDIA — mude o modo ou o provedor",
      };
    }
    return { disabled: false };
  };

  const selectAllInEnv = () => {
    const ids = envModels
      .filter((m) => connected[m.env] && (prefs.mode !== "robin" || robinCanSelect(m)))
      .map((m) => m.id);
    patch({ mode: "auto", autoAllowedPresetIds: [...new Set([...autoAllowed, ...ids])] });
  };

  const clearAutoInEnv = () => {
    const envIds = new Set(envModels.map((m) => normalizePresetId(m.id)));
    patch({
      mode: "auto",
      autoAllowedPresetIds: [...autoAllowed].filter((id) => !envIds.has(id)),
    });
  };

  const setMode = (nextMode: ModelPowerMode) => {
    if (nextMode === "robin") {
      patch({
        mode: "robin",
        poolProvider: selectedEnv === "nvidia" ? "nvidia" : "groq",
        robinPoolModelId:
          selectedEnv === "nvidia" ? PLATFORM_ROBIN_TASTE_PRESET_ID : "pool-groq-flash",
      });
      if (selectedEnv !== "groq" && selectedEnv !== "nvidia") {
        setSelectedEnv("nvidia");
      }
      return;
    }
    patch({ mode: nextMode });
  };

  const modelGridClass = "grid gap-2 sm:grid-cols-2 lg:grid-cols-3";
  const customCount = (userModels ?? []).filter((e) => e.env === selectedEnv).length;

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
            Como o agente usa IA
          </h2>
          <p className="mt-1 font-mono text-[10px] text-[var(--text-dim)] max-w-2xl leading-relaxed">
            Escolha o <strong className="text-[var(--foreground)]/90">modo</strong>, depois o{" "}
            <strong className="text-[var(--foreground)]/90">provedor</strong> (OpenAI, NVIDIA,
            OpenRouter…), depois{" "}
            <strong className="text-[var(--foreground)]/90">qual modelo</strong> — inclusive IDs que
            você colar. Nada some ao trocar de modo: só muda o que você pode clicar.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2">
          {connectedCount > 0 ? (
            <CheckCircle2 className="size-4 text-emerald-400" />
          ) : (
            <AlertCircle className="size-4 text-amber-400" />
          )}
          <span className="font-mono text-[10px] text-[var(--foreground)]/90">
            {connectedCount}/{AI_ENVS_SORTED.length} com chave em API
          </span>
        </div>
      </div>

      {/* Modo */}
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
              className={`px-4 py-2 rounded-lg border font-mono text-[11px] transition-colors text-left max-w-sm ${
                prefs.mode === m.id
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
          <p className="font-mono text-[10px] font-medium text-[var(--primary)]">
            {modeGuide.title}
          </p>
          <p className="mt-1 font-mono text-[10px] text-[var(--text-dim)] leading-relaxed">
            {modeGuide.body}
          </p>
          <p className="mt-2 font-mono text-[9px] text-[var(--foreground)]/80">
            → {modeGuide.action}
          </p>
          {prefs.mode === "auto" && autoAllowed.size > 0 && (
            <p className="mt-2 font-mono text-[9px] text-emerald-400/90">
              {autoAllowed.size} modelo(s) marcado(s) no automático
            </p>
          )}
          {prefs.mode === "fixed" && prefs.fixedPresetId && (
            <p className="mt-2 font-mono text-[9px] text-emerald-400/90">
              Fixo ativo: {getPresetById(prefs.fixedPresetId, userModels).label}
            </p>
          )}
          {prefs.mode === "robin" && (
            <p className="mt-2 font-mono text-[9px] text-emerald-400/90">
              ROBIN: {getPresetById(prefs.robinPoolModelId, userModels).label} · pool{" "}
              {prefs.poolProvider ?? "groq"} ·{" "}
              <Link to={keysSectionHref} className="text-[var(--primary)] underline">
                adicione chaves ao pool em API
              </Link>
            </p>
          )}
        </div>

        {!isAgentPreferencesConfigured(prefs) && (
          <p className="mt-3 font-mono text-[9px] text-amber-400/90">
            Falta concluir: modo + pelo menos um modelo selecionado + chave do provedor em API.
          </p>
        )}
      </div>

      {/* Provedor */}
      <div className="mb-6">
        <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--primary)] mb-2">
          2 · Provedor (onde está a chave)
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
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
                    active
                      ? "border-[var(--primary)]/40 text-[var(--primary)]"
                      : "border-[var(--border)]"
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
              ? "OpenRouter: cadastre a chave e adicione cada modelo pelo slug (vira card abaixo)."
              : selectedEnv === "ollama"
                ? "Ollama: URL do servidor local (não é chave de nuvem)."
                : `Cadastre ${AI_ENV_META[selectedEnv].label} em API`}
            <Link
              to={keysSectionHref}
              hash={
                selectedEnv === "openrouter"
                  ? "forge-key-openrouter"
                  : selectedEnv === "ollama"
                    ? "forge-key-ollama"
                    : `forge-key-${selectedEnv}`
              }
              className="text-[var(--primary)] underline"
            >
              ir para API →
            </Link>
          </p>
        )}
      </div>

      {/* Catálogo + adicionar modelo (mesma grade) */}
      <div className="mb-6">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--primary)]">
            3 · Modelos — {AI_ENV_META[selectedEnv].label}
            {prefs.mode === "auto" && " · marque ○/●"}
            {prefs.mode === "fixed" && " · um card"}
            {prefs.mode === "robin" && " · pool Groq/NVIDIA"}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {prefs.mode === "auto" && (
              <>
                <button
                  type="button"
                  onClick={selectAllInEnv}
                  className="font-mono text-[9px] text-[var(--primary)] hover:underline"
                >
                  Marcar todos (com chave)
                </button>
                <button
                  type="button"
                  onClick={clearAutoInEnv}
                  className="font-mono text-[9px] text-[var(--text-dim)] hover:underline"
                >
                  Desmarcar neste provedor
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

        <div className="mb-4 rounded-lg border border-[var(--border)] bg-[var(--surface-2)]/50 p-3">
          <p className="font-mono text-[10px] text-[var(--text-dim)] mb-2 leading-relaxed">
            Adicione um modelo deste provedor — ele vira{" "}
            <strong className="text-[var(--foreground)]/90">card na grade</strong>, igual aos do
            catálogo. No OpenRouter, cole o slug completo (ex.{" "}
            <code className="text-[var(--primary)]">zhipu/glm-5</code>).
          </p>
          <div className="flex flex-wrap gap-2">
            <input
              type="text"
              value={draftModelSlug}
              onChange={(e) => setDraftModelSlug(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addUserModel();
                }
              }}
              placeholder={
                selectedEnv === "openrouter"
                  ? "slug OpenRouter, ex.: meta-llama/llama-3.3-70b-instruct"
                  : selectedEnv === "nvidia"
                    ? "ex.: nvidia/nemotron-3-ultra-550b-a55b"
                    : `ex.: ${selectedEnv}/nome-do-modelo-na-api`
              }
              className="flex-1 min-w-[200px] rounded-lg border border-[var(--border)] bg-[var(--surface-1)] px-3 py-2 font-mono text-[11px] text-[var(--foreground)]"
            />
            <button
              type="button"
              onClick={addUserModel}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--primary)] bg-[var(--primary)]/15 px-4 py-2 font-mono text-[11px] text-[var(--foreground)] hover:bg-[var(--primary)]/25"
            >
              <Plus className="size-3.5" />
              Adicionar card
            </button>
          </div>
          {customCount > 0 && (
            <p className="mt-2 font-mono text-[9px] text-[var(--text-ghost)]">
              {customCount} modelo(s) seu(s) neste provedor — cards com etiqueta &quot;seu
              modelo&quot;
            </p>
          )}
        </div>

        {envModels.length === 0 ? (
          <p className="font-mono text-[10px] text-[var(--text-dim)] rounded-lg border border-dashed border-[var(--border)] p-4 leading-relaxed">
            Nenhum atalho pré-carregado neste provedor. Use o campo acima para adicionar o primeiro
            card.
            {selectedEnv === "openrouter" &&
              " No OpenRouter quase tudo é por slug — cada um vira um card selecionável."}
          </p>
        ) : (
          <div className={modelGridClass}>
            {envModels.map((m) => {
              const isCustom = m.id.startsWith("custom--");
              const { disabled, reason } = cardDisabled(m);
              const badges = [
                isCustom ? "seu modelo" : "",
                m.id.startsWith("pool-") ? "pool ROBIN" : "",
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
                  multi={prefs.mode === "auto"}
                  onClick={() => selectModel(m.id)}
                  onRemove={isCustom ? () => removeUserModel(m.openRouterSlug) : undefined}
                  onHide={isCustom ? undefined : () => hidePreset(m.id)}
                />
              );
            })}
          </div>
        )}

        <p className="mt-2 font-mono text-[9px] text-[var(--text-ghost)] leading-relaxed">
          Ordem: mais capaz → mais econômico. Cards sem chave em API ficam acinzentados. No ROBIN,
          só Groq e NVIDIA são clicáveis; os outros provedores continuam visíveis para você
          comparar.
        </p>
      </div>

      {/* STT */}
      <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)]/30 p-4">
        <label className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-wider text-[var(--text-dim)] mb-1">
          <Mic className="size-3" />4 · Voz (microfone)
        </label>
        <p className="font-mono text-[9px] text-[var(--text-ghost)] mb-3">
          Independente do modelo de texto — só quem transcreve áudio.
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
                onClick={() => patch({ sttProvider: opt.id as SttProviderId })}
              />
            ))}
        </div>
        <p className="mt-3 font-mono text-[10px] text-[var(--text-dim)] rounded-md border border-[var(--border)] bg-[var(--surface-1)]/60 px-3 py-2">
          {sttActiveModelLine(prefs.sttProvider ?? STT_DEFAULT_PROVIDER)}
        </p>
        {!sttReady && (
          <p className="mt-2 font-mono text-[10px] text-amber-400/90">
            Cadastre a chave em{" "}
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
    ? getPresetById(
        prefs.mode === "robin" ? prefs.robinPoolModelId : prefs.fixedPresetId,
        prefs.userModelEntries,
      )
    : getPresetById("");
  const stt = sttProviderName(prefs.sttProvider ?? STT_DEFAULT_PROVIDER);
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
