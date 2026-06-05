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

  return raw || "Erro ao conectar ao agente.";
}