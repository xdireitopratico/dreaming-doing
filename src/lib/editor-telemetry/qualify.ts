import type {
  EditorHealth,
  EditorTelemetrySnapshot,
  TelemetryLevel,
  TelemetrySignal,
} from "./types";

function signal(
  id: string,
  level: TelemetryLevel,
  category: TelemetrySignal["category"],
  message: string,
  hint?: string,
): TelemetrySignal {
  return { id, level, category, message, hint };
}

/** Deriva sinais acionáveis + score 0–100 a partir do snapshot. */
export function qualifySnapshot(
  snap: EditorTelemetrySnapshot,
): { signals: TelemetrySignal[]; health: EditorHealth; score: number } {
  const signals: TelemetrySignal[] = [];
  let score = 100;

  const penalize = (n: number) => {
    score = Math.max(0, score - n);
  };

  if (!snap.env.supabaseConfigured) {
    signals.push(
      signal(
        "env-missing",
        "error",
        "env",
        "Supabase não configurado no build",
        "Defina VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY na Vercel.",
      ),
    );
    penalize(40);
  } else if (!snap.env.projectRefOk) {
    signals.push(
      signal(
        "env-wrong-ref",
        "warn",
        "env",
        "URL Supabase não aponta para o projeto FORGE esperado",
        "Confira o project ref em supabase/.temp/project-ref.",
      ),
    );
    penalize(15);
  }

  if (!snap.auth.signedIn) {
    signals.push(
      signal("auth-none", "error", "auth", "Usuário não autenticado", "Faça login em /auth."),
    );
    penalize(35);
  }

  if (!snap.connectors.e2bConnected) {
    signals.push(
      signal(
        "e2b-missing",
        "error",
        "connectors",
        "Chave E2B ausente",
        "Cole em API Keys → Sandbox E2B. Sem isso agente e preview não sobem.",
      ),
    );
    penalize(30);
  }

  if (snap.connectors.hasUserLlmKey && !snap.agent.preferencesConfigured) {
    signals.push(
      signal(
        "agent-setup",
        "warn",
        "agent",
        "API Keys OK, mas modo/modelo não salvos",
        "Abra /api ou /models, escolha Fixo/Auto/ROBIN e salve.",
      ),
    );
    penalize(12);
  }

  if (!snap.connectors.hasUserLlmKey && snap.connectors.tasteChatRemaining <= 0) {
    signals.push(
      signal(
        "taste-exhausted",
        "warn",
        "connectors",
        "Taste Chat esgotado e sem BYOK",
        "Adicione chaves LLM em /api para o agente construir código.",
      ),
    );
    penalize(10);
  }

  if (
    snap.agent.lastError &&
    /inngest|continue_queue|inngest_failed|inngest_event_key/i.test(snap.agent.lastError)
  ) {
    signals.push(
      signal(
        "inngest-queue",
        "error",
        "agent",
        "Fila/agente: Inngest não configurado ou falhou ao disparar",
        "Defina INNGEST_EVENT_KEY em Supabase Edge secrets (docs/EDGE-SECRETS.md).",
      ),
    );
    penalize(30);
  }

  if (snap.agent.lastError) {
    const errLower = snap.agent.lastError.toLowerCase();
    const isNvidia404 = /\b404\b/i.test(snap.agent.lastError) &&
      (errLower.includes("nvidia") || errLower.includes("nemotron"));
    const isOpenAi404 = /\b404\b/i.test(snap.agent.lastError) &&
      errLower.includes("openai") && !isNvidia404;
    signals.push(
      signal(
        "agent-error",
        "error",
        "agent",
        `Agente: ${truncate(snap.agent.lastError, 120)}`,
        isNvidia404
          ? "ROBIN NVIDIA: ID Nemotron corrigido para -a55b — recarregue e reenvie; chave em /api."
          : isOpenAi404
            ? "GPT-5.x na OpenAI usa API Responses — recarregue e reenvie; ou OpenRouter em /api."
            : snap.agent.resumable
            ? "Tente Retomar no painel do agente."
            : "Veja TERMINAL e eventos abaixo.",
      ),
    );
    penalize(25);
  }

  if (snap.preview.lastBootError) {
    const isSandbox = /sandbox|e2b|ambiente ao vivo|agente/i.test(snap.preview.lastBootError);
    signals.push(
      signal(
        "preview-boot",
        "error",
        "preview",
        `Preview: ${truncate(snap.preview.lastBootError, 120)}`,
        isSandbox
          ? "Envie um pedido ao agente (BYOK) ou use Abrir preview após o agente terminar."
          : "Use Tentar de novo no preview.",
      ),
    );
    penalize(20);
  }

  if (snap.preview.isReactProject && !snap.preview.devUrl && snap.preview.agentHasRun) {
    signals.push(
      signal(
        "preview-missing-url",
        "warn",
        "preview",
        "Projeto React sem previewUrl após agente",
        "Clique Abrir preview ou aguarde preview-boot após o agente.",
      ),
    );
    penalize(8);
  }

  if (snap.preview.isReactProject && !snap.sandbox.previewSandboxId && snap.connectors.e2bConnected) {
    signals.push(
      signal(
        "sandbox-not-provisioned",
        "warn",
        "sandbox",
        "Nenhum sandbox E2B registrado no projeto",
        "O agente BYOK cria o sandbox no primeiro sync; Taste Chat não cria.",
      ),
    );
    penalize(10);
  }

  if (snap.agent.running && !snap.agent.agentConnected) {
    signals.push(
      signal(
        "realtime-stale",
        "warn",
        "agent",
        "UI marca agente rodando mas Realtime desconectado",
        "Pode ser queda de rede; tente parar e reenviar mensagem.",
      ),
    );
    penalize(8);
  }

  if (signals.length === 0) {
    signals.push(
      signal("all-clear", "ok", "ui", "Nenhum bloqueio detectado no snapshot atual"),
    );
  }

  const hasError = signals.some((s) => s.level === "error");
  const hasWarn = signals.some((s) => s.level === "warn");
  const health: EditorHealth = hasError ? "critical" : hasWarn ? "degraded" : "healthy";

  return { signals, health, score };
}

export function buildShotHeadline(
  health: EditorHealth,
  score: number,
  signals: TelemetrySignal[],
  snap: EditorTelemetrySnapshot,
): string {
  const label = snap.projectName ?? snap.projectId ?? "editor";
  const blockers = signals.filter((s) => s.level === "error");
  if (blockers.length > 0) {
    return `${health.toUpperCase()} (${score}/100) · ${blockers[0].message}`;
  }
  if (snap.agent.running) {
    return `Agente ativo · ${snap.agent.phase ?? "em execução"} · ${snap.agent.sessionKindResolved ?? "?"} · ${label}`;
  }
  if (snap.preview.booting) {
    return `Preview iniciando · ${label}`;
  }
  return `OK (${score}/100) · ${label}`;
}

export function partitionSignals(signals: TelemetrySignal[]): {
  blockers: TelemetrySignal[];
  warnings: TelemetrySignal[];
} {
  return {
    blockers: signals.filter((s) => s.level === "error"),
    warnings: signals.filter((s) => s.level === "warn"),
  };
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max)}…`;
}