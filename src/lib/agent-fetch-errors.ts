/** Mensagens amigáveis para falhas de rede no agent-run / SSE. */

export function formatAgentFetchError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const lower = raw.toLowerCase();

  if (lower.includes("failed to fetch") || lower.includes("networkerror")) {
    return (
      "Não foi possível conectar ao agente (rede ou Edge Function indisponível). " +
      "Aguarde alguns segundos e use Continuar. Se repetir: confira E2B e chaves em API, " +
      "ou o status de agent-run no Supabase."
    );
  }

  if (lower.includes("aborterror")) {
    return "Agente interrompido.";
  }

  if (/\b404\b/.test(raw) && lower.includes("openai")) {
    return (
      "OpenAI retornou 404 para o modelo configurado. O FORGE agora usa a API Responses para GPT-5.x — " +
      "atualize a página, confira o modelo em /models e tente de novo. Alternativa: chave OpenRouter + openai/gpt-5.5."
    );
  }

  if (/\b404\b/.test(raw) && lower.includes("model")) {
    return "Modelo não encontrado no provedor. Ajuste em Modelos (/models) ou troque para Groq/NVIDIA no modo ROBIN.";
  }

  return raw || "Erro ao conectar ao agente.";
}