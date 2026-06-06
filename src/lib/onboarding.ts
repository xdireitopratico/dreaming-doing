/**
 * Onboarding state — tracks 4-step wizard progress.
 * Storage:
 * - `forge:onboarding:state` no localStorage (passo atual, dados do form)
 * - `profiles.onboarding_completed_at` no Supabase (terminal state)
 *
 * O wizard não é gateado pelo servidor: usuário pode acessar /api, /models, etc. diretamente.
 * O onboarding é um convite gentil pra novos usuários completarem setup.
 */

import { supabase } from "@/integrations/supabase/client";

export type OnboardingStepId = "welcome" | "api_keys" | "model" | "sandbox" | "deploy" | "done";

export const ONBOARDING_STEPS: { id: OnboardingStepId; title: string; description: string; required: boolean }[] = [
  {
    id: "welcome",
    title: "Bem-vindo ao FORGE",
    description: "Em 4 passos rápidos você sai do modo TASTE e libera o agente de verdade.",
    required: false,
  },
  {
    id: "api_keys",
    title: "Chaves de API",
    description: "Conecte seu provedor de LLM (NVIDIA, OpenAI, Anthropic…). Recomendado: pool NVIDIA pra ROBIN.",
    required: true,
  },
  {
    id: "model",
    title: "Modelo",
    description: "Escolha Auto, Fixo ou ROBIN + o modelo. Nemotron 550B é a melhor relação custo × qualidade.",
    required: true,
  },
  {
    id: "sandbox",
    title: "Sandbox E2B",
    description: "E2B roda o código em ambiente isolado. Sua chave fica criptografada no Supabase.",
    required: true,
  },
  {
    id: "deploy",
    title: "Deploy (opcional)",
    description: "Conecte Vercel, Netlify ou Cloudflare pra publicar com 1 clique no fim do projeto.",
    required: false,
  },
];

const LS_KEY = "forge:onboarding:state";

export type OnboardingLocalState = {
  /** Step atual (incluindo "welcome" inicial) */
  currentStep: OnboardingStepId;
  /** Step máximo já alcançado (pra não permitir pular adiante) */
  highestReached: OnboardingStepId;
  /** Steps marcados como completos (mesmo que não consecutivos) */
  completed: OnboardingStepId[];
  /** Quando começou */
  startedAt: string;
};

export function loadOnboardingState(): OnboardingLocalState {
  if (typeof window === "undefined") {
    return defaultOnboardingState();
  }
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return defaultOnboardingState();
    const parsed = JSON.parse(raw) as Partial<OnboardingLocalState>;
    return {
      currentStep: parsed.currentStep ?? "welcome",
      highestReached: parsed.highestReached ?? "welcome",
      completed: Array.isArray(parsed.completed) ? parsed.completed : [],
      startedAt: parsed.startedAt ?? new Date().toISOString(),
    };
  } catch {
    return defaultOnboardingState();
  }
}

export function saveOnboardingState(state: OnboardingLocalState): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

export function clearOnboardingState(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(LS_KEY);
  } catch {
    /* ignore */
  }
}

function defaultOnboardingState(): OnboardingLocalState {
  return {
    currentStep: "welcome",
    highestReached: "welcome",
    completed: [],
    startedAt: new Date().toISOString(),
  };
}

/** Index do step no array ONBOARDING_STEPS. */
export function stepIndex(step: OnboardingStepId): number {
  return ONBOARDING_STEPS.findIndex((s) => s.id === step);
}

/** Próximo step na ordem (pula "done"). */
export function nextStep(step: OnboardingStepId): OnboardingStepId {
  const idx = stepIndex(step);
  if (idx < 0 || idx >= ONBOARDING_STEPS.length - 1) return "done";
  return ONBOARDING_STEPS[idx + 1]!.id;
}

/** Step anterior na ordem. "done" volta para o último setup step ("deploy"). */
export function prevStep(step: OnboardingStepId): OnboardingStepId {
  // "done" é terminal: volta pro último setup step
  if (step === "done") return "deploy";
  const idx = stepIndex(step);
  if (idx <= 0) return "welcome";
  return ONBOARDING_STEPS[idx - 1]!.id;
}

/** Persiste no servidor que o usuário completou (ou chegou até certo step). */
export async function syncOnboardingToServer(
  userId: string,
  state: OnboardingLocalState,
): Promise<void> {
  const completedAt =
    state.currentStep === "done" || state.completed.includes("done")
      ? new Date().toISOString()
      : null;
  await supabase
    .from("profiles")
    .update({
      onboarding_step: state.currentStep,
      onboarding_completed_at: completedAt,
    })
    .eq("id", userId);
}

/** Verifica no servidor se o usuário já completou onboarding alguma vez. */
export async function checkOnboardingCompleted(userId: string): Promise<{
  completed: boolean;
  step: OnboardingStepId | null;
}> {
  const { data } = await supabase
    .from("profiles")
    .select("onboarding_completed_at, onboarding_step")
    .eq("id", userId)
    .maybeSingle();
  return {
    completed: !!data?.onboarding_completed_at,
    step: (data?.onboarding_step as OnboardingStepId | null) ?? null,
  };
}
