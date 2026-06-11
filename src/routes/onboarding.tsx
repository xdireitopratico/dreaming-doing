import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Circle,
  Key,
  Brain,
  Server,
  Rocket,
  Sparkles,
  PartyPopper,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { Button, FadeIn } from "@forge/ui";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { useAuth } from "@/lib/auth";
import { useConnectors } from "@/hooks/useConnectors";
import {
  loadAgentPreferences,
  saveAgentPreferences,
  EMPTY_AGENT_PREFERENCES,
  type AgentPreferences,
} from "@/lib/agent-preferences";
import { isAgentPreferencesConfigured } from "@/lib/agent-setup";
import {
  ONBOARDING_STEPS,
  loadOnboardingState,
  saveOnboardingState,
  nextStep as nextStepFn,
  prevStep as prevStepFn,
  stepIndex,
  syncOnboardingToServer,
  checkOnboardingCompleted,
  type OnboardingStepId,
  type OnboardingLocalState,
} from "@/lib/onboarding";

export const Route = createFileRoute("/onboarding")({
  component: () => (
    <DashboardShell requireAuth activeNav="settings">
      <OnboardingPage />
    </DashboardShell>
  ),
});

const STEP_ICONS: Record<OnboardingStepId, React.ComponentType<{ className?: string }>> = {
  welcome: Sparkles,
  api_keys: Key,
  model: Brain,
  sandbox: Server,
  deploy: Rocket,
  done: PartyPopper,
};

function OnboardingPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [state, setState] = useState<OnboardingLocalState | null>(null);
  const [prefs, setPrefs] = useState<AgentPreferences>(EMPTY_AGENT_PREFERENCES);
  const [serverCompleted, setServerCompleted] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);

  // ─── Init: load local + check server
  useEffect(() => {
    const local = loadOnboardingState();
    setState(local);
    setPrefs(loadAgentPreferences());
    if (user?.id) {
      checkOnboardingCompleted(user.id).then((r) => {
        setServerCompleted(r.completed);
        // Se o servidor já marcou como completo, marca no local
        if (r.completed && !local.completed.includes("done")) {
          const next: OnboardingLocalState = {
            ...local,
            currentStep: "done",
            highestReached: "done",
            completed: [...local.completed, "done" as OnboardingStepId],
          };
          setState(next);
          saveOnboardingState(next);
        }
      });
    }
  }, [user?.id]);

  // ─── Persist local state
  const updateState = useCallback((patch: Partial<OnboardingLocalState>) => {
    setState((prev) => {
      if (!prev) return prev;
      const next: OnboardingLocalState = { ...prev, ...patch };
      saveOnboardingState(next);
      return next;
    });
  }, []);

  const gotoStep = useCallback(
    (target: OnboardingStepId) => {
      if (!state) return;
      const currentIdx = stepIndex(state.currentStep);
      const targetIdx = stepIndex(target);
      const highestIdx = stepIndex(state.highestReached);
      if (targetIdx > highestIdx) {
        toast.error("Complete o passo atual antes de avançar");
        return;
      }
      // Pra trás, sempre pode
      if (targetIdx < currentIdx || state.completed.includes(target) || target === "done") {
        updateState({ currentStep: target });
        return;
      }
      // Pra frente, só se o anterior está completed
      const prevId = prevStepFn(target);
      if (state.completed.includes(prevId) || prevId === "welcome") {
        updateState({ currentStep: target });
      } else {
        toast.error("Complete o passo anterior primeiro");
      }
    },
    [state, updateState],
  );

  const completeStep = useCallback(
    async (stepId: OnboardingStepId) => {
      if (!state) return;
      const completed = state.completed.includes(stepId)
        ? state.completed
        : [...state.completed, stepId];
      const ns = nextStepFn(stepId);
      const highestReachedIdx = stepIndex(state.highestReached);
      const nextReachedIdx = stepIndex(ns);
      const newHighest: OnboardingStepId =
        nextReachedIdx > highestReachedIdx ? ns : state.highestReached;
      updateState({
        completed,
        currentStep: ns,
        highestReached: newHighest,
      });
      if (user?.id) {
        try {
          await syncOnboardingToServer(user.id, {
            ...state,
            completed,
            currentStep: ns,
            highestReached: newHighest,
          });
        } catch {
          /* non-blocking */
        }
      }
    },
    [state, updateState, user?.id],
  );

  const finishOnboarding = useCallback(async () => {
    if (!user?.id || !state) return;
    setSaving(true);
    try {
      await syncOnboardingToServer(user.id, {
        ...state,
        currentStep: "done",
        completed: [...state.completed, "done"],
        highestReached: "done",
      });

      void navigate({ to: "/projects" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao finalizar onboarding");
    } finally {
      setSaving(false);
    }
  }, [user?.id, state, navigate]);

  // ─── Hooks que checam o estado real (do DB / localStorage)
  const { status, modes, hasUserLlmKey, e2bConnected } = useConnectors() as ReturnType<
    typeof useConnectors
  > & { e2bConnected: boolean };
  const e2bFromStatus = (status as Record<string, { connected?: boolean }>).e2b?.connected ?? false;
  const isE2BConnected = e2bConnected || e2bFromStatus;
  const apiKeysOk = !!hasUserLlmKey;
  const modelOk = isAgentPreferencesConfigured(prefs);
  const deployOk =
    (modes as Record<string, string>).vercel === "connected" ||
    (modes as Record<string, string>).netlify === "connected" ||
    (modes as Record<string, string>).cloudflare === "connected" ||
    (status as Record<string, { connected?: boolean }>).vercel?.connected === true ||
    (status as Record<string, { connected?: boolean }>).netlify?.connected === true ||
    (status as Record<string, { connected?: boolean }>).cloudflare?.connected === true;

  if (!state) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="size-6 animate-spin text-[var(--forge-primary)]" />
      </div>
    );
  }

  const currentStep = state.currentStep;
  const isFinalStep = currentStep === "done";
  const isWelcome = currentStep === "welcome";

  return (
    <div className="px-6 py-8 max-w-[920px] mx-auto">
      {/* ─── Stepper ─── */}
      <Stepper state={state} onGoto={gotoStep} />

      <FadeIn key={currentStep} className="mt-8">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentStep}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
          >
            {isWelcome && <WelcomeStep onNext={() => gotoStep("api_keys")} state={state} />}

            {currentStep === "api_keys" && (
              <ApiKeysStep
                done={apiKeysOk}
                onComplete={() => {
                  void completeStep("api_keys");
                }}
                onSkip={apiKeysOk ? () => void completeStep("api_keys") : null}
              />
            )}

            {currentStep === "model" && (
              <ModelStep
                prefs={prefs}
                onChangePrefs={setPrefs}
                done={modelOk}
                onComplete={() => {
                  saveAgentPreferences(prefs);
                  void completeStep("model");
                }}
              />
            )}

            {currentStep === "sandbox" && (
              <SandboxStep
                done={isE2BConnected}
                onComplete={() => {
                  void completeStep("sandbox");
                }}
                onSkip={isE2BConnected ? () => void completeStep("sandbox") : null}
              />
            )}

            {currentStep === "deploy" && (
              <DeployStep
                done={deployOk}
                onComplete={() => {
                  void completeStep("deploy");
                }}
                onSkip={() => void completeStep("deploy")}
              />
            )}

            {isFinalStep && (
              <DoneStep
                apiKeysOk={apiKeysOk}
                modelOk={modelOk}
                sandboxOk={isE2BConnected}
                deployOk={deployOk}
                saving={saving}
                onFinish={finishOnboarding}
                onBackToWelcome={() => gotoStep("welcome")}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </FadeIn>

      {/* ─── Navigation footer ─── */}
      {!isWelcome && !isFinalStep && (
        <div className="mt-10 flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => gotoStep(prevStepFn(currentStep))}
            className="font-mono text-[10px] uppercase tracking-widest"
          >
            <ArrowLeft className="size-3.5" />
            Voltar
          </Button>
          <div className="font-mono text-[10px] text-[var(--forge-muted)]">
            {stepIndex(currentStep)} / {ONBOARDING_STEPS.length - 2} passos de setup
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Stepper ────────────────────────────────────────────────────────────────

function Stepper({
  state,
  onGoto,
}: {
  state: OnboardingLocalState;
  onGoto: (id: OnboardingStepId) => void;
}) {
  const setupSteps = ONBOARDING_STEPS.filter((s) => s.id !== "welcome" && s.id !== "done");
  const highestIdx = stepIndex(state.highestReached);
  const currentIdx = stepIndex(state.currentStep);

  return (
    <div>
      <Link
        to="/projects"
        className="inline-flex items-center gap-1.5 font-mono text-[10px] text-[var(--forge-muted)] hover:text-[var(--forge-text)] mb-6"
      >
        <ArrowLeft className="size-3" />
        Sair do wizard
      </Link>
      <div className="flex items-center gap-2 overflow-x-auto pb-2">
        {setupSteps.map((step, idx) => {
          const Icon = STEP_ICONS[step.id] ?? Circle;
          const stepIdxNum = idx + 1; // "welcome" is idx 0
          const reachedIdx = stepIndex(state.highestReached);
          const isCurrent = state.currentStep === step.id;
          const isCompleted = state.completed.includes(step.id);
          const isReachable = stepIdxNum <= reachedIdx;
          return (
            <button
              key={step.id}
              type="button"
              disabled={!isReachable}
              onClick={() => onGoto(step.id)}
              className={`group flex items-center gap-2 rounded-md border px-3 py-2 transition-all shrink-0
                ${
                  isCurrent
                    ? "border-[var(--forge-primary)] bg-[var(--forge-primary)]/10"
                    : isCompleted
                      ? "border-emerald-500/30 bg-emerald-500/5 hover:border-emerald-500/60"
                      : isReachable
                        ? "border-[var(--forge-border)] bg-[var(--forge-surface-2)]/50 hover:border-[var(--forge-primary)]/40"
                        : "border-[var(--forge-border)]/50 bg-transparent opacity-40 cursor-not-allowed"
                }`}
            >
              <span
                className={`grid size-6 place-items-center rounded-full
                  ${
                    isCurrent
                      ? "bg-[var(--forge-primary)] text-[var(--forge-bg)]"
                      : isCompleted
                        ? "bg-emerald-500 text-white"
                        : "bg-[var(--forge-surface-3)] text-[var(--forge-muted)]"
                  }`}
              >
                {isCompleted ? <Check className="size-3" /> : <Icon className="size-3" />}
              </span>
              <span className="font-mono text-[10px] uppercase tracking-widest whitespace-nowrap">
                {String(stepIdxNum).padStart(2, "0")} · {step.title}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Steps ──────────────────────────────────────────────────────────────────

function WelcomeStep({ onNext, state }: { onNext: () => void; state: OnboardingLocalState }) {
  return (
    <div className="rounded-2xl border border-[var(--forge-border)] bg-[var(--forge-surface-1)]/60 backdrop-blur-sm p-8 md:p-12">
      <div className="flex items-start gap-6">
        <div className="grid size-16 place-items-center rounded-2xl bg-gradient-to-br from-[var(--forge-primary)]/20 to-[var(--forge-primary)]/5 border border-[var(--forge-primary)]/30 shrink-0">
          <Sparkles className="size-7 text-[var(--forge-primary)]" />
        </div>
        <div className="flex-1">
          <h1 className="font-display text-3xl md:text-4xl tracking-tight text-[var(--forge-text)]">
            Bem-vindo ao FORGE
          </h1>
          <p className="mt-3 text-[var(--forge-silver)] text-sm leading-relaxed max-w-prose">
            Você está no <strong className="text-[var(--forge-text)]">modo TASTE</strong> — estado
            reservado a usuários novos, com até 50 mensagens concierge + 1 start de projeto. Em 4
            passos rápidos você sai do TASTE e libera o agente de verdade: suas chaves, seu modelo,
            seu deploy.
          </p>
          <ul className="mt-6 space-y-2 text-sm">
            {ONBOARDING_STEPS.filter((s) => s.required).map((s) => (
              <li key={s.id} className="flex items-center gap-2 text-[var(--forge-silver)]">
                <CheckCircle2 className="size-3.5 text-[var(--forge-primary)] shrink-0" />
                <span>
                  <strong className="text-[var(--forge-text)]">{s.title}</strong> — {s.description}
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-8 flex items-center gap-3">
            <Button onClick={onNext} size="lg">
              Começar setup
              <ArrowRight className="size-4" />
            </Button>
            <Link
              to="/projects"
              className="font-mono text-[10px] uppercase tracking-widest text-[var(--forge-muted)] hover:text-[var(--forge-text)]"
            >
              Pular por agora
            </Link>
          </div>
          {state.completed.length > 0 && (
            <p className="mt-4 font-mono text-[9px] text-[var(--forge-muted)]">
              Você já completou {state.completed.filter((c) => c !== "done").length} passos antes —
              pode retomar de onde parou.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function ApiKeysStep({
  done,
  onComplete,
  onSkip,
}: {
  done: boolean;
  onComplete: () => void;
  onSkip: (() => void) | null;
}) {
  return (
    <StepCard
      icon={Key}
      title="Chaves de API"
      description="Conecte ao menos um provedor de LLM. Recomendado: pool NVIDIA (5 chaves) pra ROBIN — escala linear sem rate limit."
      done={done}
      ctaLabel={done ? "Continuar" : "Já conectei minha chave"}
      onCta={onComplete}
      skipLabel={done ? null : "Pular (vou usar NVIDIA TASTE por agora)"}
      onSkip={onSkip}
    >
      <div className="rounded-lg border border-[var(--forge-border)] bg-[var(--forge-surface-2)]/40 p-4">
        <p className="font-mono text-[10px] text-[var(--forge-muted)] mb-2">Adicionar chaves em</p>
        <Link
          to="/api"
          className="inline-flex items-center gap-2 font-mono text-xs text-[var(--forge-primary)] hover:underline"
        >
          <Key className="size-3.5" />
          /api — Gerenciador de chaves
        </Link>
        <p className="mt-3 text-xs text-[var(--forge-silver)] leading-relaxed">
          Suportamos NVIDIA, OpenAI, Anthropic, Google, Groq, xAI, OpenRouter, DeepSeek, DashScope,
          Moonshot e Ollama. Chaves ficam criptografadas no Supabase (pgsodium).
        </p>
      </div>
    </StepCard>
  );
}

function ModelStep({
  prefs,
  onChangePrefs,
  done,
  onComplete,
}: {
  prefs: AgentPreferences;
  onChangePrefs: (p: AgentPreferences) => void;
  done: boolean;
  onComplete: () => void;
}) {
  return (
    <StepCard
      icon={Brain}
      title="Modelo do agente"
      description="Escolha o modo + modelo. Nemotron 550B (NVIDIA) é a melhor relação custo × qualidade pra buildar apps. ROBIN distribui 5 chaves em rotação."
      done={done}
      ctaLabel={done ? "Continuar" : "Salvar modelo"}
      onCta={onComplete}
      skipLabel={null}
      onSkip={null}
    >
      <div className="space-y-3">
        <ModelModeOption
          value="auto"
          label="Auto"
          description="Router escolhe o melhor modelo permitido conforme a tarefa"
          selected={prefs.mode === "auto"}
          onSelect={() => onChangePrefs({ ...prefs, mode: "auto" })}
        />
        <ModelModeOption
          value="robin"
          label="ROBIN (recomendado)"
          description="5 chaves NVIDIA em rotação — escala sem rate limit, melhor uptime"
          selected={prefs.mode === "robin"}
          onSelect={() =>
            onChangePrefs({
              ...prefs,
              mode: "robin",
              poolProvider: "nvidia",
              robinPoolModelId: "nvidia/nemotron-3-ultra-550b-a55b",
            })
          }
        />
        <ModelModeOption
          value="fixed"
          label="Fixo"
          description="Trava em 1 modelo. Mais previsível, mas rate-limitado pela chave"
          selected={prefs.mode === "fixed"}
          onSelect={() =>
            onChangePrefs({
              ...prefs,
              mode: "fixed",
              fixedPresetId: prefs.fixedPresetId ?? "anthropic/claude-sonnet-4-5",
            })
          }
        />
      </div>
      <div className="mt-4 rounded-lg border border-[var(--forge-border)] bg-[var(--forge-surface-2)]/40 p-4">
        <p className="font-mono text-[10px] text-[var(--forge-muted)] mb-2">Ajustar presets em</p>
        <Link
          to="/models"
          className="inline-flex items-center gap-2 font-mono text-xs text-[var(--forge-primary)] hover:underline"
        >
          <Brain className="size-3.5" />
          /models — AI Model Studio
        </Link>
      </div>
    </StepCard>
  );
}

function ModelModeOption({
  value,
  label,
  description,
  selected,
  onSelect,
}: {
  value: string;
  label: string;
  description: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`group w-full text-left rounded-lg border p-3 transition-all
        ${
          selected
            ? "border-[var(--forge-primary)] bg-[var(--forge-primary)]/10"
            : "border-[var(--forge-border)] bg-[var(--forge-surface-2)]/30 hover:border-[var(--forge-primary)]/40"
        }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className={`grid size-5 place-items-center rounded-full
              ${selected ? "bg-[var(--forge-primary)] text-[var(--forge-bg)]" : "bg-[var(--forge-surface-3)] text-[var(--forge-muted)]"}
            `}
          >
            {selected && <Check className="size-3" />}
          </span>
          <span className="font-display text-sm text-[var(--forge-text)]">{label}</span>
        </div>
        <span className="font-mono text-[9px] text-[var(--forge-muted)]">{value}</span>
      </div>
      <p className="mt-1 text-xs text-[var(--forge-silver)] pl-7">{description}</p>
    </button>
  );
}

function SandboxStep({
  done,
  onComplete,
  onSkip,
}: {
  done: boolean;
  onComplete: () => void;
  onSkip: (() => void) | null;
}) {
  return (
    <StepCard
      icon={Server}
      title="Sandbox E2B"
      description="E2B é onde o agente roda comandos, instala deps e constrói seu projeto. Sandbox isolado, expira em 30 dias, refresh automático."
      done={done}
      ctaLabel={done ? "Continuar" : "Já configurei a chave E2B"}
      onCta={onComplete}
      skipLabel={done ? null : "Pular (preview pode ficar limitado)"}
      onSkip={onSkip}
    >
      <div className="rounded-lg border border-[var(--forge-border)] bg-[var(--forge-surface-2)]/40 p-4">
        <p className="font-mono text-[10px] text-[var(--forge-muted)] mb-2">
          Adicionar chave E2B em
        </p>
        <Link
          to="/api"
          hash="forge-key-e2b"
          className="inline-flex items-center gap-2 font-mono text-xs text-[var(--forge-primary)] hover:underline"
        >
          <Server className="size-3.5" />
          /api → Seção E2B
        </Link>
        <p className="mt-3 text-xs text-[var(--forge-silver)] leading-relaxed">
          O sandbox é descartável e isolado por usuário. Sua chave fica criptografada e só é usada
          pelo agent-run pra criar/destruir sandboxes em seu nome.
        </p>
      </div>
    </StepCard>
  );
}

function DeployStep({
  done,
  onComplete,
  onSkip,
}: {
  done: boolean;
  onComplete: () => void;
  onSkip: (() => void) | null;
}) {
  return (
    <StepCard
      icon={Rocket}
      title="Deploy (opcional)"
      description="Conecte Vercel, Netlify ou Cloudflare pra publicar com 1 clique no fim de cada projeto. Você pode fazer isso depois, a qualquer momento."
      done={done}
      ctaLabel={done ? "Continuar" : "Já conectei"}
      onCta={onComplete}
      skipLabel="Pular (fazer depois)"
      onSkip={onSkip}
    >
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {(["vercel", "netlify", "cloudflare"] as const).map((p) => (
          <div
            key={p}
            className="rounded-lg border border-[var(--forge-border)] bg-[var(--forge-surface-2)]/30 p-3"
          >
            <p className="font-display text-sm text-[var(--forge-text)] capitalize">{p}</p>
            <p className="mt-1 text-[10px] font-mono text-[var(--forge-muted)]">
              {p === "vercel" && "Recomendado pra Next.js + Vite"}
              {p === "netlify" && "Bom pra JAMstack + SSR"}
              {p === "cloudflare" && "Mais barato, edge-first"}
            </p>
          </div>
        ))}
      </div>
      <div className="mt-4 rounded-lg border border-[var(--forge-border)] bg-[var(--forge-surface-2)]/40 p-4">
        <p className="font-mono text-[10px] text-[var(--forge-muted)] mb-2">Conectar em</p>
        <Link
          to="/connectors"
          className="inline-flex items-center gap-2 font-mono text-xs text-[var(--forge-primary)] hover:underline"
        >
          <Rocket className="size-3.5" />
          /connectors — Conectores
        </Link>
      </div>
    </StepCard>
  );
}

function DoneStep({
  apiKeysOk,
  modelOk,
  sandboxOk,
  deployOk,
  saving,
  onFinish,
  onBackToWelcome,
}: {
  apiKeysOk: boolean;
  modelOk: boolean;
  sandboxOk: boolean;
  deployOk: boolean;
  saving: boolean;
  onFinish: () => void;
  onBackToWelcome: () => void;
}) {
  const requiredOk = apiKeysOk && modelOk && sandboxOk;
  return (
    <div className="rounded-2xl border border-[var(--forge-primary)]/30 bg-gradient-to-br from-[var(--forge-primary)]/10 via-[var(--forge-surface-1)]/60 to-transparent backdrop-blur-sm p-8 md:p-12">
      <div className="flex items-start gap-6">
        <div className="grid size-16 place-items-center rounded-2xl bg-gradient-to-br from-emerald-500/30 to-emerald-500/5 border border-emerald-500/30 shrink-0">
          <PartyPopper className="size-7 text-emerald-400" />
        </div>
        <div className="flex-1">
          <h1 className="font-display text-3xl md:text-4xl tracking-tight text-[var(--forge-text)]">
            Você saiu do TASTE
          </h1>
          <p className="mt-3 text-[var(--forge-silver)] text-sm leading-relaxed max-w-prose">
            A partir de agora{" "}
            <strong className="text-[var(--forge-text)]">TASTE não existe mais</strong> na sua
            conta. Tudo o que você configurou aqui vale. Pode refazer qualquer passo a qualquer
            momento em{" "}
            <Link to="/api" className="text-[var(--forge-primary)] hover:underline">
              /api
            </Link>{" "}
            e{" "}
            <Link to="/models" className="text-[var(--forge-primary)] hover:underline">
              /models
            </Link>
            .
          </p>

          <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-3">
            <ChecklistItem ok={apiKeysOk} label="API keys" />
            <ChecklistItem ok={modelOk} label="Modelo" />
            <ChecklistItem ok={sandboxOk} label="Sandbox E2B" />
            <ChecklistItem ok={deployOk} label="Deploy" optional />
          </div>

          {!requiredOk && (
            <div className="mt-6 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
              <AlertCircle className="size-4 text-amber-400 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-200/90">
                Os passos marcados como pendentes limitam funcionalidades: sem API keys você volta
                pro TASTE; sem modelo o agente não inicia; sem E2B o preview não sobe.
              </p>
            </div>
          )}

          <div className="mt-8 flex items-center gap-3">
            <Button onClick={onFinish} size="lg" disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Finalizando…
                </>
              ) : (
                <>
                  Ir pro editor
                  <ArrowRight className="size-4" />
                </>
              )}
            </Button>
            <button
              type="button"
              onClick={onBackToWelcome}
              className="font-mono text-[10px] uppercase tracking-widest text-[var(--forge-muted)] hover:text-[var(--forge-text)]"
            >
              Rever passos
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ChecklistItem({
  ok,
  label,
  optional,
}: {
  ok: boolean;
  label: string;
  optional?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border p-2.5 ${
        ok
          ? "border-emerald-500/30 bg-emerald-500/5"
          : optional
            ? "border-[var(--forge-border)] bg-[var(--forge-surface-2)]/30"
            : "border-amber-500/30 bg-amber-500/5"
      }`}
    >
      <div className="flex items-center gap-2">
        {ok ? (
          <CheckCircle2 className="size-3.5 text-emerald-400" />
        ) : optional ? (
          <Circle className="size-3.5 text-[var(--forge-muted)]" />
        ) : (
          <AlertCircle className="size-3.5 text-amber-400" />
        )}
        <span className="font-mono text-[10px] uppercase tracking-widest text-[var(--forge-text)]">
          {label}
        </span>
      </div>
    </div>
  );
}

function StepCard({
  icon: Icon,
  title,
  description,
  done,
  ctaLabel,
  onCta,
  skipLabel,
  onSkip,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  done: boolean;
  ctaLabel: string;
  onCta: () => void;
  skipLabel: string | null;
  onSkip: (() => void) | null;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`rounded-2xl border bg-[var(--forge-surface-1)]/60 backdrop-blur-sm p-8
        ${done ? "border-emerald-500/30" : "border-[var(--forge-border)]"}`}
    >
      <div className="flex items-start gap-4 mb-6">
        <div
          className={`grid size-12 place-items-center rounded-xl shrink-0 ${
            done
              ? "bg-emerald-500/10 border border-emerald-500/30"
              : "bg-[var(--forge-primary)]/10 border border-[var(--forge-primary)]/30"
          }`}
        >
          <Icon className={`size-5 ${done ? "text-emerald-400" : "text-[var(--forge-primary)]"}`} />
        </div>
        <div className="flex-1">
          <h2 className="font-display text-2xl tracking-tight text-[var(--forge-text)] flex items-center gap-2">
            {title}
            {done && <CheckCircle2 className="size-4 text-emerald-400" />}
          </h2>
          <p className="mt-1 text-sm text-[var(--forge-silver)] leading-relaxed">{description}</p>
        </div>
      </div>
      <div className="mb-6">{children}</div>
      <div className="flex items-center gap-3 pt-4 border-t border-[var(--forge-border)]/60">
        <Button onClick={onCta}>
          {done && <Check className="size-3.5" />}
          {ctaLabel}
        </Button>
        {skipLabel && onSkip && (
          <button
            type="button"
            onClick={onSkip}
            className="font-mono text-[10px] uppercase tracking-widest text-[var(--forge-muted)] hover:text-[var(--forge-text)]"
          >
            {skipLabel}
          </button>
        )}
      </div>
    </div>
  );
}
