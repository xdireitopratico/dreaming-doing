import { supabase } from "@/integrations/supabase/client";
import { getSupabaseEnv } from "@/lib/supabase-env";
import { formatAgentHttpError } from "@/lib/agent-fetch-errors";

export const TERMINAL_STATUSES = new Set(["completed", "failed", "canceled", "awaiting_user"]);

export function formatQueueBlockReason(reason?: string): string | null {
  if (!reason) return null;
  if (reason.startsWith("blocking_run:")) {
    return "Agente ainda em execução — a fila processa quando liberar (ou após ~5 min sem atividade).";
  }
  if (reason === "inngest_failed") {
    return "Falha ao disparar o worker — verifique INNGEST_EVENT_KEY no servidor.";
  }
  if (reason === "lock_failed") {
    return "Não foi possível adquirir lock do agente — tente Processar de novo.";
  }
  if (reason === "taste_limit") {
    return "Limite Taste Chat atingido — configure API em /api.";
  }
  return reason;
}

export async function parseErrorResponse(res: Response): Promise<string> {
  const txt = await res.text().catch(() => "");
  try {
    const body = JSON.parse(txt) as {
      error?: string;
      message?: string;
      code?: string;
    };
    const raw = body.error ?? body.message ?? txt.slice(0, 280);
    return formatAgentHttpError(raw, body.code);
  } catch {
    return txt.slice(0, 280) || `HTTP ${res.status}`;
  }
}

export async function postAgentRun(body: Record<string, unknown>): Promise<Response> {
  const { url, publishableKey } = getSupabaseEnv();
  if (!url || !publishableKey) {
    throw new Error(
      "Supabase não configurado. Verifique VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY.",
    );
  }
  const { data: sess } = await supabase.auth.getSession();
  const accessToken = sess.session?.access_token;
  if (!accessToken) {
    throw new Error("Sessão expirada. Faça login novamente.");
  }

  return fetch(`${url}/functions/v1/agent-run`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      apikey: publishableKey,
    },
    body: JSON.stringify(body),
  });
}
