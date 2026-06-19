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
      message: "Sua chave de API está inválida ou expirou.",
      action: "Atualizar chave",
      link: LINKS.apiKeys,
      severity: "error",
      code: "auth.invalid_key",
      tip: "A última requisição foi rejeitada pelo provedor antes de qualquer chamada custosa.",
    };
  }
  if (status === 403 || /forbidden|permission/i.test(lower)) {
    return {
      message: "Provedor recusou a chave (403). Pode estar sem permissão para o modelo escolhido.",
      action: "Trocar modelo ou chave",
      link: LINKS.models,
      severity: "error",
      code: "auth.forbidden",
    };
  }
  if (status === 402 || /payment|insufficient credits|quota exceeded/i.test(lower)) {
    return {
      message: "Sem créditos ou quota esgotada na sua conta do provedor.",
      action: "Recarregar créditos",
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
        message: "Modelo NVIDIA não encontrado. Pode estar deprecado ou sua chave não tem acesso.",
        action: "Trocar modelo",
        link: LINKS.models,
        severity: "error",
        code: "model.not_found.nvidia",
        tip: "Tente o preset Llama 3.3 70B ou Groq Llama 3.3 70B Versatile.",
      };
    }
    return {
      message: "Modelo não encontrado no provedor (404).",
      action: "Escolher outro modelo",
      link: LINKS.models,
      severity: "error",
      code: "model.not_found",
    };
  }

  if (/\b529\b/.test(msg) || /\b503\b/.test(msg) || /overloaded|service unavailable/i.test(lower)) {
    return {
      message: "Servidor do modelo sobrecarregado (529/503).",
      action: "Aguardar e continuar",
      link: null,
      severity: "warning",
      code: "model.overloaded",
      tip: "O FORGE aplica backoff automático. Se persistir, troque o pool no modo ROBIN.",
    };
  }

  if (
    /\b429\b/.test(msg) ||
    /rate limit|too many requests|quota|capacity|overloaded|rpm|tpm/i.test(lower)
  ) {
    if (robinActive) {
      return {
        message: "Limite por minuto nesta chave. ROBIN está alternando para a próxima…",
        action: "Adicionar mais chaves",
        link: LINKS.apiKeys,
        severity: "warning",
        code: "rate_limit.robin_rotating",
        tip: "Cada chave adicionada multiplica o throughput do pool.",
      };
    }
    return {
      message: "Limite por minuto atingido no provedor.",
      action: "Adicionar chaves (ROBIN) ou aguardar",
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
      message: "Conexão com o modelo instável. O estado foi salvo.",
      action: "Continuar run",
      link: null,
      severity: "warning",
      code: "connection.unstable",
      tip: "O agente retoma exatamente de onde parou — sem perder trabalho.",
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
      message: "Você ainda não configurou sua chave E2B (sandbox de preview).",
      action: "Configurar E2B",
      link: LINKS.onboarding,
      severity: "info",
      code: "e2b.not_configured",
      tip: "Você pode pegar uma chave grátis em e2b.dev/dashboard.",
    };
  }

  if (/401|403|invalid.*key|unauthorized/i.test(lower)) {
    return {
      message: "Sua chave E2B foi rejeitada.",
      action: "Atualizar chave E2B",
      link: LINKS.apiKeys,
      severity: "error",
      code: "e2b.invalid_key",
    };
  }

  if (/template.*not found|template.*unavailable/i.test(lower)) {
    return {
      message: "Template E2B solicitado indisponível. FORGE vai usar o fallback automaticamente.",
      action: "Aguardar recriação",
      link: null,
      severity: "warning",
      code: "e2b.template_fallback",
      tip: "Se persistir, salve o projeto e reabra — o sandbox será recriado.",
    };
  }

  if (/timeout|killed|sandbox.*dead/i.test(lower)) {
    return {
      message: "Sandbox E2B travou ou foi morto pelo timeout (limite de 5 min).",
      action: "Reabrir preview",
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
    message: "O agente atingiu o tempo limite da Edge Function (120s).",
    action: "Continuar run",
    link: null,
    severity: "warning",
    code: "edge.timeout",
    tip: "O estado foi salvo em checkpoint — Continue retoma sem perder trabalho.",
  };
}

export function staleStreamHint(): ErrorHint {
  return {
    message: "A conexão com o agente foi interrompida antes do início da execução.",
    action: "Continuar run",
    link: null,
    severity: "warning",
    code: "agent.stale_stream",
    tip: "Isso pode ocorrer quando o servidor demora para iniciar. Tente novamente com Continuar.",
  };
}

export function zombieRunHint(): ErrorHint {
  return {
    message: "A execução expirou (run zumbi) — o servidor marcou como falha após 15 minutos.",
    action: "Reenviar mensagem",
    link: null,
    severity: "warning",
    code: "agent.zombie_run",
    tip: "Envie o pedido de novo no chat. Se a fila estava presa, ela deve drenar no próximo agent-run.",
  };
}

export function inngestQueueHint(): ErrorHint {
  return {
    message: "A fila do agente não conseguiu disparar o Inngest (secret ausente ou inválido).",
    action: "Verificar INNGEST_EVENT_KEY",
    link: null,
    severity: "error",
    code: "inngest.queue_failed",
    tip: "Configure INNGEST_EVENT_KEY em Supabase → Edge Functions → Secrets. Ver docs/EDGE-SECRETS.md.",
  };
}
