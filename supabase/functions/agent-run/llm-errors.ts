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
      msg.includes("openai api error"))
  );
}

export function friendlyLlmError(err: unknown, robinActive: boolean): string {
  if (isModelNotFoundError(err)) {
    return (
      "Modelo não encontrado na API OpenAI (404). Em Modelos, escolha GPT-5.5 com chave OpenAI válida " +
      "ou use OpenRouter com o slug openai/gpt-5.5. Se acabou de adicionar a chave, salve de novo em /api."
    );
  }
  if (isRateLimitError(err)) {
    return robinActive
      ? "Limite por minuto atingido nesta chave. O modo ROBIN está tentando a próxima chave do pool…"
      : "Limite por minuto atingido no provedor. Aguarde um pouco ou adicione mais chaves em API Keys (modo ROBIN).";
  }
  if (isConnectionError(err)) {
    return "Conexão com o modelo instável. Seu histórico está salvo — use Continuar para retomar.";
  }
  return errorMessage(err).slice(0, 400);
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err ?? "Erro desconhecido");
}