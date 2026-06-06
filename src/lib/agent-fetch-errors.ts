import { formatE2bUserError } from "@/lib/e2b-status";

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

  if (/\b404\b/.test(raw) && (lower.includes("nvidia nim") || lower.includes("nemotron"))) {
    return (
      "NVIDIA NIM retornou 404 (modelo Nemotron). Recarregue o editor e tente de novo — o ID correto é " +
      "nvidia/nemotron-3-ultra-550b-a55b. Confira chave NVIDIA no pool ROBIN em /api."
    );
  }

  if (/\b404\b/.test(raw) && lower.includes("openai")) {
    return (
      "OpenAI retornou 404 para o modelo configurado. O FORGE usa a API Responses para GPT-5.x — " +
      "atualize a página, confira o modelo em /models e tente de novo."
    );
  }

  if (/\b404\b/.test(raw) && lower.includes("model")) {
    return "Modelo não encontrado no provedor. Ajuste em Modelos (/models) ou troque para Groq/NVIDIA no modo ROBIN.";
  }

  if (raw.includes("Sandbox E2B não configurado") || raw.includes("e2b_not_configured")) {
    return formatE2bUserError(raw, "e2b_not_configured");
  }

  if (raw.includes("E2B connect") || raw.includes("E2B create")) {
    return formatE2bUserError(raw);
  }

  return raw || "Erro ao conectar ao agente.";
}

/** Erro HTTP do agent-run (JSON body). */
export function formatAgentHttpError(message: string, code?: string): string {
  return formatE2bUserError(message, code) || message || "Erro ao conectar ao agente.";
}