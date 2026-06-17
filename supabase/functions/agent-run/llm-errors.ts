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

export function isRetryableLlmError(err: unknown): boolean {
  return isRateLimitError(err) || isOverloadError(err) || isConnectionError(err);
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
    msg.includes("timeout") ||
    msg.includes("timed out") ||
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

export function friendlyLlmError(err: unknown, robinActive: boolean): string {
  const msg = errorMessage(err);
  const lower = msg.toLowerCase();

  if (isModelNotFoundError(err)) {
    if (lower.includes("nvidia nim")) {
      return (
        "NVIDIA NIM retornou 404 para o Nemotron. O FORGE agora usa o ID oficial " +
        "`nvidia/nemotron-3-ultra-550b-a55b`. Recarregue a página e reenvie; confira a chave NVIDIA em /api (pool ROBIN)."
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
  if (isConnectionError(err)) {
    return "Conexão com o modelo instável. Seu histórico está salvo — use Continuar para retomar.";
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
