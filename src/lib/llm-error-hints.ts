// llm-error-hints.ts (browser mirror) — mesmo mapeamento do agent-run/llm-error-hints.ts
// usado pra renderizar cards de erro acionáveis no chat.
export type ErrorSeverity = "info" | "warning" | "error";

export type ErrorHint = {
  message: string;
  action: string;
  link: string | null;
  severity: ErrorSeverity;
  code: string;
  tip?: string;
};

const LINKS = {
  apiKeys: "/api",
  models: "/models",
  onboarding: "/onboarding",
  apiConnectors: "/connectors",
};

function errorMessage(err: unknown): string {
  if (typeof err === "string") return err;
  if (err && typeof err === "object" && "message" in err) {
    return String((err as { message: unknown }).message);
  }
  return String(err ?? "Erro desconhecido");
}

function hintFromStatus(status: number | undefined, msg: string): ErrorHint | null {
  const lower = msg.toLowerCase();
  if (status === 401 || /unauthorized|invalid api key|invalid_token/i.test(lower)) {
    return {
      message: "Chave inválida ou expirada.",
      action: "→ /api",
      link: LINKS.apiKeys,
      severity: "error",
      code: "auth.invalid_key",

    };
  }
  if (status === 403 || /forbidden|permission/i.test(lower)) {
    return {
      message: "Chave sem permissão (403).",
      action: "→ /models",
      link: LINKS.models,
      severity: "error",
      code: "auth.forbidden",
    };
  }
  if (status === 402 || /payment|insufficient credits|quota exceeded/i.test(lower)) {
    return {
      message: "Sem créditos.",
      action: "→ /api",
      link: LINKS.apiKeys,
      severity: "error",
      code: "billing.no_credits",
    };
  }
  return null;
}

export function llmErrorHint(err: unknown, robinActive: boolean): ErrorHint {
  const msg = errorMessage(err);
  const lower = msg.toLowerCase();

  const statusMatch = msg.match(/\b(401|402|403|404|429|500|502|503|529)\b/);
  const status = statusMatch ? Number(statusMatch[1]) : undefined;
  const statusHint = hintFromStatus(status, msg);
  if (statusHint) return statusHint;

  if (
    /\b404\b/.test(msg) &&
    (lower.includes("model") || lower.includes("does not exist") || lower.includes("not found"))
  ) {
    if (lower.includes("nvidia")) {
      return {
      message: "Modelo NVIDIA 404.",
      action: "→ /models",
      link: LINKS.models,
      severity: "error",
      code: "model.not_found.nvidia",
      };
    }
    return {
      message: "Modelo 404.",
      action: "→ /models",
      link: LINKS.models,
      severity: "error",
      code: "model.not_found",
    };
  }

  if (/\b529\b/.test(msg) || /\b503\b/.test(msg) || /overloaded|service unavailable/i.test(lower)) {
    return {
      message: "Modelo sobrecarregado (529/503).",
      action: "Retry automático",
      link: null,
      severity: "warning",
      code: "model.overloaded",

    };
  }

  if (
    /\b429\b/.test(msg) ||
    /rate limit|too many requests|quota|capacity|overloaded|rpm|tpm/i.test(lower)
  ) {
    if (robinActive) {
      return {
        message: "Rate limit — ROBIN alternando.",
        action: "→ /api",
        link: LINKS.apiKeys,
        severity: "warning",
        code: "rate_limit.robin_rotating",

      };
    }
    return {
      message: "Rate limit.",
      action: "→ /api",
      link: LINKS.apiKeys,
      severity: "warning",
      code: "rate_limit.single_key",
    };
  }

  if (
    /network|connection|timeout|timed out|econnreset|fetch failed|broken pipe|stream closed/i.test(
      lower,
    )
  ) {
    return {
      message: "Conexão instável. Estado salvo.",
      action: "→ Continuar",
      link: null,
      severity: "warning",
      code: "connection.unstable",

    };
  }

  return {
    message: msg.slice(0, 300),
    action: "Reportar problema",
    link: null,
    severity: "error",
    code: "llm.unknown",
  };
}

export function e2bErrorHint(err: unknown): ErrorHint {
  const msg = errorMessage(err);
  const lower = msg.toLowerCase();

  if (/e2b.*(not configured|missing|api key)/i.test(lower) || /e2b_setup/.test(lower)) {
    return {
      message: "E2B não configurado.",
      action: "→ /api",
      link: LINKS.onboarding,
      severity: "info",
      code: "e2b.not_configured",

    };
  }

  if (/401|403|invalid.*key|unauthorized/i.test(lower)) {
    return {
      message: "Chave E2B inválida.",
      action: "→ /api",
      link: LINKS.apiKeys,
      severity: "error",
      code: "e2b.invalid_key",
    };
  }

  if (/template.*not found|template.*unavailable/i.test(lower)) {
    return {
      message: "Template E2B indisponível — usando fallback.",
      action: "Retry",
      link: null,
      severity: "warning",
      code: "e2b.template_fallback",

    };
  }

  if (/timeout|killed|sandbox.*dead/i.test(lower)) {
    return {
      message: "E2B travou — recarregue.",
      action: "Recarregar",
      link: null,
      severity: "warning",
      code: "e2b.sandbox_dead",
    };
  }

  return {
    message: `Erro E2B: ${msg.slice(0, 250)}`,
    action: "Reportar",
    link: null,
    severity: "error",
    code: "e2b.unknown",
  };
}

export function timeoutHint(): ErrorHint {
  return {
    message: "Timeout — progresso salvo.",
    action: "→ Continuar",
    link: null,
    severity: "warning",
    code: "agent.execution_window",

  };
}

export function staleStreamHint(): ErrorHint {
  return {
    message: "Conexão perdida.",
    action: "→ Continuar",
    link: null,
    severity: "warning",
    code: "agent.stale_stream",

  };
}

export function zombieRunHint(): ErrorHint {
  return {
    message: "Run expirou.",
    action: "Reenviar",
    link: null,
    severity: "warning",
    code: "agent.zombie_run",

  };
}

export function inngestQueueHint(): ErrorHint {
  return {
    message: "Inngest não configurado.",
    action: "→ Secrets",
    link: null,
    severity: "error",
    code: "inngest.queue_failed",

  };
}
