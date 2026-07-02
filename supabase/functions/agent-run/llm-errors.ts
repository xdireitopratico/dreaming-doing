/** Classifica erros de APIs LLM para retry e mensagens amigáveis. */

export function isRateLimitError(err: unknown): boolean {
  const msg = errorMessage(err).toLowerCase();
  if (/\b429\b/.test(msg)) return true;
  return (
    msg.includes("rate limit") ||
    msg.includes("rate_limit") ||
    msg.includes("too many requests") ||
    msg.includes("quota") ||
    msg.includes("capacity") ||
    msg.includes("overloaded") ||
    msg.includes("rpm") ||
    msg.includes("tpm")
  );
}

export function isOverloadError(err: unknown): boolean {
  const msg = errorMessage(err).toLowerCase();
  return (
    /\b529\b/.test(msg) ||
    /\b503\b/.test(msg) ||
    msg.includes("overloaded") ||
    msg.includes("service unavailable") ||
    msg.includes("temporarily unavailable")
  );
}

export function isTimeoutError(err: unknown): boolean {
  const msg = errorMessage(err).toLowerCase();
  return msg.includes("timeout") || msg.includes("timed out");
}

export function isRetryableLlmError(err: unknown): boolean {
  return (
    isRateLimitError(err) ||
    isOverloadError(err) ||
    isConnectionError(err) ||
    isTimeoutError(err)
  );
}

/**
 * Erro de provider externo (HTTP 5xx sem ser 503/529) — ex: NVIDIA NIM
 * retornando 500 com "invalid type: unit variant, expected newtype variant"
 * por causa de payload incompatível.
 *
 * Diferente de `isRetryableLlmError` (que cobre 429/529/503/connection):
 *   - Retry com mesma config NÃO vai consertar (problema é de payload/serialização)
 *   - Retry com outra chave do MESMO pool também não (mesmo provider)
 *   - Útil retry seria com OUTRO provedor (groq/anthropic/etc)
 *
 * Por isso NÃO está incluído em `isRetryableLlmError`. Quem quiser
 * classificar 500 como retryable em outros lugares (ex: Auto mode que
 * troca provedor) pode importar esta função diretamente.
 */
export function isProviderError(err: unknown): boolean {
  const msg = errorMessage(err);
  // 500 ou 502 sem cair em 503 (overload)
  if (/\b500\b/.test(msg) || /\b502\b/.test(msg) || /\b504\b/.test(msg)) return true;
  return msg.toLowerCase().includes("internal server error");
}

export function parseRetryAfterSec(err: unknown): number | null {
  const msg = errorMessage(err);
  const headerMatch = msg.match(/retry[- ]after[:\s]+(\d+)/i);
  if (headerMatch) return Number(headerMatch[1]);
  const secMatch = msg.match(/retry in (\d+(?:\.\d+)?)\s*s/i);
  if (secMatch) return Math.ceil(Number(secMatch[1]));
  return null;
}

export function isConnectionError(err: unknown): boolean {
  const msg = errorMessage(err).toLowerCase();
  return (
    msg.includes("network") ||
    msg.includes("connection") ||
    msg.includes("econnreset") ||
    msg.includes("fetch failed") ||
    msg.includes("broken pipe") ||
    msg.includes("stream closed")
  );
}

export function isModelNotFoundError(err: unknown): boolean {
  const msg = errorMessage(err).toLowerCase();
  return (
    /\b404\b/.test(msg) &&
    (msg.includes("model") ||
      msg.includes("does not exist") ||
      msg.includes("not found") ||
      msg.includes("api error"))
  );
}

function isAuthLlmError(err: unknown): boolean {
  const msg = errorMessage(err).toLowerCase();
  return (
    /\b(401|402|403)\b/.test(msg) ||
    /unauthorized|invalid api key|invalid_token|forbidden|payment required|insufficient credits/i.test(
      msg,
    )
  );
}

/** Erros que não melhoram com retry na mesma config — falha imediata com mensagem amigável. */
export function shouldFailFastLlmError(err: unknown): boolean {
  if (isModelNotFoundError(err)) return true;
  if (isAuthLlmError(err)) return true;
  if (isProviderError(err)) return true;
  return false;
}

export function friendlyLlmError(err: unknown, robinActive: boolean): string {
  const msg = errorMessage(err);
  const lower = msg.toLowerCase();

  if (isModelNotFoundError(err)) {
    if (lower.includes("nvidia nim")) {
      return (
        "NVIDIA NIM retornou 404 para o Nemotron. IDs oficiais: Ultra " +
        "`nvidia/nemotron-3-ultra-550b-a55b`, Super 120B `nvidia/nemotron-3-super-120b-a12b`. " +
        "Recarregue a página, confira o modelo em /models e a chave NVIDIA em /api."
      );
    }
    if (lower.includes("openai api error") || lower.includes("openai")) {
      return (
        "Modelo não encontrado na API OpenAI (404). Em Modelos, escolha GPT-5.5 com chave OpenAI válida " +
        "ou use OpenRouter com o slug openai/gpt-5.5."
      );
    }
    return "Modelo não encontrado no provedor (404). Ajuste em Modelos (/models) ou troque o pool ROBIN.";
  }
  if (isOverloadError(err)) {
    return "Servidor do modelo sobrecarregado (529/503). O FORGE está aguardando com backoff antes de tentar de novo…";
  }
  if (isRateLimitError(err)) {
    return robinActive
      ? "Limite por minuto atingido nesta chave. O modo ROBIN está tentando a próxima chave do pool…"
      : "Limite por minuto atingido no provedor. Aguarde um pouco ou adicione mais chaves em API Keys (modo ROBIN).";
  }
  if (isTimeoutError(err)) {
    return "O modelo demorou demais para responder. Seu histórico está salvo — use Continuar para retomar.";
  }
  if (isConnectionError(err)) {
    return "Conexão com o modelo instável. Seu histórico está salvo — use Continuar para retomar.";
  }
  if (lower.includes("create_plan") && lower.includes("modo plan")) {
    return (
      "O modelo tentou usar create_plan fora do modo Plan. " +
      "No composer: Chat = conversa; Plan = planos formais; Build = implementação."
    );
  }
  if (isProviderError(err)) {
    return (
      "Provedor de modelo retornou erro 5xx (provavelmente incompatibilidade de payload). " +
      "Tente outro modelo em /models ou troque a chave do pool ROBIN em /api."
    );
  }
  return errorMessage(err).slice(0, 400);
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err ?? "Erro desconhecido");
}
