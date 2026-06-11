import type { FunctionsError } from "@supabase/supabase-js";

type EdgeErrorBody = { error?: string; code?: string; ok?: boolean };

async function readErrorBody(res: Response): Promise<EdgeErrorBody | null> {
  try {
    return (await res.clone().json()) as EdgeErrorBody;
  } catch {
    return null;
  }
}

/** Extrai mensagem útil quando invoke retorna non-2xx (evita "Edge Function returned..."). */
export async function edgeFunctionErrorMessage(
  data: unknown,
  error: FunctionsError | null,
  format?: (message: string, code?: string) => string,
  response?: Response,
): Promise<string | null> {
  const body = (data ?? {}) as EdgeErrorBody;
  if (body.error && body.ok !== false) {
    return format ? format(body.error, body.code) : body.error;
  }

  const sources = [response, (error as FunctionsError & { context?: Response })?.context].filter(
    (r): r is Response => r instanceof Response,
  );

  for (const res of sources) {
    const json = await readErrorBody(res);
    if (json?.error) return format ? format(json.error, json.code) : json.error;
  }

  if (!error) return null;

  const raw = error.message ?? "";
  if (/non-2xx/i.test(raw)) {
    return "Falha na edge function. Aguarde ~30s e tente salvar de novo.";
  }
  return format ? format(raw) : raw;
}

export async function assertEdgeFunctionOk<T extends EdgeErrorBody & { ok?: boolean }>(
  data: T | null,
  error: FunctionsError | null,
  format?: (message: string, code?: string) => string,
  response?: Response,
): Promise<T> {
  const msg = await edgeFunctionErrorMessage(data, error, format, response);
  if (msg) throw new Error(msg);
  return (data ?? {}) as T;
}
